import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getAppleApiClient,
  decodeJwsPayload,
} from "@/lib/apple-client";
import { randomBytes } from "crypto";

type ActivateBody = {
  email?: string;
  receipt?: string;
  platform?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * POST /account/activate
 * Validates receipt FIRST. Only creates/updates client after successful verification.
 * Body: { email, receipt, platform } (required). { first_name, last_name } optional, only sent when non-empty.
 * For existing inactive clients who resubscribe, body is { email, receipt, platform }.
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
    const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";

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

    // 1. VALIDATE RECEIPT FIRST – do not touch DB until this succeeds
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

    // 2. Receipt validated – now create or update client
    const supabase = getSupabase();

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Client";

    if (existingClient) {
      const { error } = await supabase
        .from("clients")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email);

      if (error) {
        console.error("Activate update error:", error);
        return NextResponse.json(
          { error: "Failed to activate subscription" },
          { status: 500 }
        );
      }
    } else {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
      });

      if (authError || !authUser.user) {
        console.error("Auth user creation failed:", authError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      const { error: insertError } = await supabase.from("clients").insert({
        id: authUser.user.id,
        email,
        name,
        is_active: true,
      });

      if (insertError) {
        console.error("Client insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to create client record" },
          { status: 500 }
        );
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("Activate error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
