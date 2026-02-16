import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getAppleApiClient,
  decodeJwsPayload,
} from "@/lib/apple-client";

type ActivateBody = {
  email?: string;
  receipt?: string;
  platform?: string;
};

/**
 * POST /account/activate
 * Body: { email, receipt, platform: "ios" }
 * Validates StoreKit 2 JWS via App Store Server API (.p8 key).
 */
export async function POST(request: NextRequest) {
  try {
    let body: ActivateBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const receipt = typeof body.receipt === "string" ? body.receipt.trim() : undefined;
    const platform = typeof body.platform === "string" ? body.platform.toLowerCase() : undefined;

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    if (!receipt) {
      return NextResponse.json(
        { error: "receipt is required" },
        { status: 400 }
      );
    }

    if (platform !== "ios") {
      return NextResponse.json(
        { error: "Only platform 'ios' is supported" },
        { status: 400 }
      );
    }

    let transactionId: string;

    try {
      const payload = decodeJwsPayload(receipt);
      transactionId = payload.transactionId as string;
      if (!transactionId || typeof transactionId !== "string") {
        throw new Error("Missing transactionId in receipt");
      }
    } catch (err) {
      console.error("Receipt decode failed:", err);
      return NextResponse.json(
        { error: "Invalid receipt format" },
        { status: 400 }
      );
    }

    try {
      const apiClient = getAppleApiClient();
      const response = await apiClient.getTransactionInfo(transactionId);
      const signedTransactionInfo = response.signedTransactionInfo;

      if (!signedTransactionInfo) {
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 400 }
        );
      }

      const decoded = decodeJwsPayload(signedTransactionInfo) as {
        revocationDate?: number;
      };
      if (decoded.revocationDate != null) {
        return NextResponse.json(
          { error: "Transaction was refunded or revoked" },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error("Apple API verification failed:", err);
      return NextResponse.json(
        { error: "Invalid or expired receipt" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("clients")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Activate DB error:", error);
      return NextResponse.json(
        { error: "Failed to activate subscription" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "No account found for this email" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Activate error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
