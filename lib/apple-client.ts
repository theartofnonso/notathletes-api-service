import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";
import * as fs from "fs";
import * as path from "path";

let client: AppStoreServerAPIClient | null = null;

function loadSigningKey(): string {
  const keyPath =
    process.env.APPLE_KEY_PATH ??
    path.join(process.cwd(), "certs", "AuthKey_RM36D2V4T6.p8");

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Apple signing key not found at ${keyPath}. Set APPLE_KEY_PATH or place AuthKey_*.p8 in certs/.`
    );
  }

  return fs.readFileSync(keyPath, "utf-8");
}

export function getAppleApiClient(): AppStoreServerAPIClient {
  if (client) return client;

  const keyId = process.env.APPLE_KEY_ID ?? "RM36D2V4T6";
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
