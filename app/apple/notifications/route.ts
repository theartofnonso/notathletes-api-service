import { getSupabase } from "@/lib/supabase";
import {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  Subtype,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type NotificationBody = {
  signedPayload?: unknown;
};

type MappedStatus = {
  shouldUpdate: boolean;
  isActive: boolean;
  status: string;
};

const verifierCache = new Map<Environment, SignedDataVerifier>();

function parseRootsFromEnv(): Buffer[] {
  const roots = process.env.APPLE_ROOT_CA_CERTS_BASE64 ?? "";
  return roots
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Buffer.from(value, "base64"));
}

function toDate(value?: number): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value);
}

function isFuture(date: Date | null): boolean {
  return !!date && date.getTime() > Date.now();
}

function getConfiguredEnvironment(): Environment {
  const rawEnv = process.env.APPLE_SERVER_ENVIRONMENT?.toLowerCase();
  console.info(
    `Apple webhook configured environment raw="${process.env.APPLE_SERVER_ENVIRONMENT ?? "undefined"}"`
  );
  if (rawEnv === "sandbox") return Environment.SANDBOX;
  if (rawEnv === "production") return Environment.PRODUCTION;
  throw new Error(
    "Apple notifications not configured. Set APPLE_SERVER_ENVIRONMENT to sandbox or production."
  );
}

function getVerifierForEnvironment(environment: Environment): SignedDataVerifier {
  const cached = verifierCache.get(environment);
  if (cached) return cached;

  const roots = parseRootsFromEnv();
  const bundleId = process.env.APPLE_BUNDLE_ID;
  const appAppleId =
    process.env.APPLE_APP_ID && Number.isFinite(Number(process.env.APPLE_APP_ID))
      ? Number(process.env.APPLE_APP_ID)
      : undefined;

  if (!roots.length || !bundleId) {
    throw new Error(
      "Apple notifications not configured. Set APPLE_ROOT_CA_CERTS_BASE64, APPLE_BUNDLE_ID, and APPLE_SERVER_ENVIRONMENT."
    );
  }

  const created = new SignedDataVerifier(
    roots,
    true,
    environment,
    bundleId,
    appAppleId
  );

  verifierCache.set(environment, created);
  return created;
}

function mapSubscriptionStatus(
  notificationType?: string,
  subtype?: string,
  expiresAt: Date | null = null
): MappedStatus {
  if (
    notificationType === NotificationTypeV2.SUBSCRIBED ||
    notificationType === NotificationTypeV2.DID_RENEW ||
    notificationType === "DID_RECOVER"
  ) {
    return { shouldUpdate: true, isActive: true, status: "active" };
  }

  if (
    notificationType === NotificationTypeV2.EXPIRED ||
    notificationType === NotificationTypeV2.REVOKE ||
    notificationType === NotificationTypeV2.REFUND ||
    notificationType === NotificationTypeV2.DID_FAIL_TO_RENEW ||
    notificationType === NotificationTypeV2.GRACE_PERIOD_EXPIRED
  ) {
    if (notificationType === NotificationTypeV2.REVOKE) {
      return { shouldUpdate: true, isActive: false, status: "revoked" };
    }
    if (notificationType === NotificationTypeV2.REFUND) {
      return { shouldUpdate: true, isActive: false, status: "refunded" };
    }
    return { shouldUpdate: true, isActive: false, status: "expired" };
  }

  if (
    notificationType === NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS &&
    subtype === Subtype.AUTO_RENEW_DISABLED
  ) {
    return {
      shouldUpdate: true,
      isActive: isFuture(expiresAt),
      status: "canceled_pending_expiry",
    };
  }

  return { shouldUpdate: false, isActive: false, status: "inactive" };
}

export async function POST(request: NextRequest) {
  let body: NotificationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.signedPayload !== "string" || !body.signedPayload.trim()) {
    return NextResponse.json({ error: "signedPayload is required" }, { status: 400 });
  }

  let configuredEnvironment: Environment;
  let primaryVerifier: SignedDataVerifier;
  try {
    configuredEnvironment = getConfiguredEnvironment();
    primaryVerifier = getVerifierForEnvironment(configuredEnvironment);
  } catch (err) {
    console.error("Apple notification configuration error:", err);
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 500 });
  }

  let appleVerifier = primaryVerifier;
  let decodedNotification;
  try {
    console.info(`Apple webhook verifier attempt environment="${configuredEnvironment}"`);
    decodedNotification = await appleVerifier.verifyAndDecodeNotification(body.signedPayload);
  } catch (err) {
    const shouldRetryWithOtherEnvironment =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      (err as { status?: number }).status === VerificationStatus.INVALID_ENVIRONMENT;

    if (!shouldRetryWithOtherEnvironment) {
      console.error("Apple notification verification failed:", err);
      return NextResponse.json({ error: "Invalid signedPayload" }, { status: 400 });
    }

    const fallbackEnvironment =
      configuredEnvironment === Environment.SANDBOX
        ? Environment.PRODUCTION
        : Environment.SANDBOX;

    try {
      appleVerifier = getVerifierForEnvironment(fallbackEnvironment);
      console.warn(
        `Apple webhook retrying verifier with fallback environment="${fallbackEnvironment}"`
      );
      decodedNotification = await appleVerifier.verifyAndDecodeNotification(body.signedPayload);
      console.warn(
        `Apple notification verified using fallback environment: ${fallbackEnvironment}`
      );
    } catch (fallbackErr) {
      console.error("Apple notification verification failed:", fallbackErr);
      return NextResponse.json({ error: "Invalid signedPayload" }, { status: 400 });
    }
  }

  const notificationUUID = decodedNotification.notificationUUID;
  const notificationType = decodedNotification.notificationType?.toString();
  const subtype = decodedNotification.subtype?.toString();

  if (!notificationUUID || !notificationType) {
    return NextResponse.json(
      { error: "Missing notificationUUID or notificationType" },
      { status: 400 }
    );
  }

  const signedDate = toDate(decodedNotification.signedDate);
  const signedTransactionInfo = decodedNotification.data?.signedTransactionInfo;

  let originalTransactionId: string | null = null;
  let transactionId: string | null = null;
  let appAccountToken: string | null = null;
  let productId: string | null = null;
  let environment: string | null = decodedNotification.data?.environment?.toString() ?? null;
  let expiresAt: Date | null = null;

  if (signedTransactionInfo) {
    try {
      const decodedTx = await appleVerifier.verifyAndDecodeTransaction(signedTransactionInfo);
      originalTransactionId = decodedTx.originalTransactionId ?? null;
      transactionId = decodedTx.transactionId ?? null;
      appAccountToken = decodedTx.appAccountToken ?? null;
      productId = decodedTx.productId ?? null;
      environment = decodedTx.environment?.toString() ?? environment;
      expiresAt = toDate(decodedTx.expiresDate);
    } catch (err) {
      console.error("Failed decoding signedTransactionInfo:", err);
      return NextResponse.json({ error: "Invalid transaction payload" }, { status: 400 });
    }
  }

  const supabase = getSupabase();

  const { error: eventInsertError } = await supabase
    .from("apple_subscription_events")
    .insert({
      notification_uuid: notificationUUID,
      notification_type: notificationType,
      subtype: subtype ?? null,
      original_transaction_id: originalTransactionId,
      transaction_id: transactionId,
      signed_date: signedDate?.toISOString() ?? null,
      raw_payload: {
        signedPayload: body.signedPayload,
        decodedNotification,
      },
    });

  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    console.error("apple_subscription_events insert failed:", eventInsertError);
    return NextResponse.json({ error: "Failed to persist event" }, { status: 500 });
  }

  const mapped = mapSubscriptionStatus(notificationType, subtype, expiresAt);
  if (!mapped.shouldUpdate || !originalTransactionId) {
    return NextResponse.json({ ok: true, updated: false }, { status: 200 });
  }

  const nowIso = new Date().toISOString();
  const subscriptionUpdate: Record<string, unknown> = {
    entitlement_source: "apple",
    subscription_status: mapped.status,
    is_active: mapped.isActive,
    subscription_expires_at: expiresAt?.toISOString() ?? null,
    app_store_original_transaction_id: originalTransactionId,
    last_subscription_event_at: signedDate?.toISOString() ?? nowIso,
    updated_at: nowIso,
  };

  if (productId) {
    subscriptionUpdate.subscription_product_id = productId;
  }
  if (environment) {
    subscriptionUpdate.app_store_environment = environment;
  }

  let matchedClient = false;

  const { data: byOriginalTx, error: originalTxUpdateError } = await supabase
    .from("clients")
    .update(subscriptionUpdate)
    .eq("app_store_original_transaction_id", originalTransactionId)
    .select("id");

  if (originalTxUpdateError) {
    console.error("Failed to update clients by original transaction id:", originalTxUpdateError);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }

  if (Array.isArray(byOriginalTx) && byOriginalTx.length > 0) {
    matchedClient = true;
  }

  if (!matchedClient && appAccountToken) {
    const { data: byClientId, error: byClientIdError } = await supabase
      .from("clients")
      .update(subscriptionUpdate)
      .eq("id", appAccountToken)
      .select("id");

    if (byClientIdError) {
      console.error("Failed to update clients by appAccountToken:", byClientIdError);
      return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
    }

    matchedClient = Array.isArray(byClientId) && byClientId.length > 0;
  }

  return NextResponse.json({ ok: true, updated: matchedClient }, { status: 200 });
}
// Nonso
