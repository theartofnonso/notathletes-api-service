import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RevenueCat webhook event types that mean the user should have access. */
const ACTIVE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

/** RevenueCat webhook event types that mean access should be revoked (or paused). */
const INACTIVE_EVENT_TYPES = new Set(["EXPIRATION", "SUBSCRIPTION_PAUSED"]);

type RcWebhookPayload = {
  api_version?: string;
  event?: {
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    event_timestamp_ms?: number;
  };
};

function getWebhookAuthError(request: NextRequest): NextResponse | null {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "RevenueCat webhook authorization is not configured" },
      { status: 503 }
    );
  }
  const received = request.headers.get("Authorization")?.trim();
  if (received !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function resolveClientUserId(
  event: NonNullable<RcWebhookPayload["event"]>
): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const id = c.trim();
      if (UUID_REGEX.test(id)) return id;
    }
  }
  return null;
}

function subscriptionActiveForEventType(
  type: string | undefined
): boolean | null {
  if (!type) return null;
  if (ACTIVE_EVENT_TYPES.has(type)) return true;
  if (INACTIVE_EVENT_TYPES.has(type)) return false;
  return null;
}

/**
 * POST /subscriptions
 * RevenueCat server webhook: syncs `clients.subscription_active` and
 * `clients.subscription_updated_at` from purchase events.
 * Requires env REVENUECAT_WEBHOOK_AUTHORIZATION; dashboard Authorization header must match exactly.
 * Configure RevenueCat App User ID to match Supabase `auth.users` / `clients.id`.
 */
export async function POST(request: NextRequest) {
  const authError = getWebhookAuthError(request);
  if (authError) return authError;

  let body: RcWebhookPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = body.event;
  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  const active = subscriptionActiveForEventType(event.type);
  if (active === null) {
    return NextResponse.json({ ok: true });
  }

  const userId = resolveClientUserId(event);
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  const subscriptionUpdatedAt =
    typeof event.event_timestamp_ms === "number" &&
    Number.isFinite(event.event_timestamp_ms)
      ? new Date(event.event_timestamp_ms).toISOString()
      : new Date().toISOString();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clients")
    .update({
      subscription_active: active,
      subscription_updated_at: subscriptionUpdatedAt,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("subscriptions webhook clients update:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }

  if (!data) {
    console.warn(
      "subscriptions webhook: no clients row for app_user_id",
      userId,
      "event",
      event.type
    );
  }

  return NextResponse.json({ ok: true });
}
