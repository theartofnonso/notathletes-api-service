import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";

let client: AppStoreServerAPIClient | null = null;

function loadSigningKey(): string {
  const keyFromEnv = process.env.APPLE_SIGNING_KEY;
  if (!keyFromEnv?.trim()) {
    throw new Error(
      "Set APPLE_SIGNING_KEY with the full .p8 file contents (paste in Vercel env, use \\n for newlines if needed)."
    );
  }

  return keyFromEnv.replace(/\\n/g, "\n").trim();
}

export function getAppleApiClient(): AppStoreServerAPIClient {
  if (client) return client;

  const keyId = process.env.APPLE_KEY_ID ?? "7874ZAA5SY";
  const issuerId = process.env.APPLE_ISSUER_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;

  if (!issuerId || !bundleId) {
    throw new Error(
      "APPLE_ISSUER_ID and APPLE_BUNDLE_ID environment variables are required"
    );
  }

  const envStr = process.env.APPLE_ENVIRONMENT || "Sandbox";
  const environment =
    envStr.toLowerCase() === "production"
      ? Environment.PRODUCTION
      : Environment.SANDBOX;

  const signingKey = loadSigningKey();
  client = new AppStoreServerAPIClient(
    signingKey,
    keyId,
    issuerId,
    bundleId,
    environment
  );

  return client;
}

/** Decode JWS payload without verifying (for reading transactionId or response data) */
export function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWS format");
  }
  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payload) as Record<string, unknown>;
}
