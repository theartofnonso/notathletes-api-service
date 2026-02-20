import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /subscription/status?email=client@example.com
 * Returns { access: boolean } from webhook-maintained subscription state.
 */
export async function GET(request: NextRequest) {
  try {
    const rawEmail = request.nextUrl.searchParams.get("email");
    if (!rawEmail?.trim()) {
      return NextResponse.json(
        { error: "email query parameter is required" },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();
    const supabase = getSupabase();

    const { data: client, error } = await supabase
      .from("clients")
      .select("subscription_status, subscription_expires_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("subscription-status error:", error);
      return NextResponse.json(
        { error: "Failed to read subscription status" },
        { status: 500 }
      );
    }

    if (!client) {
      return NextResponse.json(
        { access: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const activeByStatus = client.subscription_status === "active";
    const expiresAt = client.subscription_expires_at
      ? new Date(client.subscription_expires_at)
      : null;
    const activeByExpiry = !expiresAt || expiresAt.getTime() > Date.now();

    return NextResponse.json(
      { access: activeByStatus && activeByExpiry },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("subscription-status error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
