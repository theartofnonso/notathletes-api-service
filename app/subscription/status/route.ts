import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /subscription/status?id=<client_uuid>
 * Returns { access: boolean } from webhook-maintained subscription state.
 */
export async function GET(request: NextRequest) {
  try {
    const rawId = request.nextUrl.searchParams.get("id");
    if (!rawId?.trim()) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const id = rawId.trim();
    const supabase = getSupabase();

    const { data: client, error } = await supabase
      .from("clients")
      .select("subscription_status, subscription_expires_at")
      .eq("id", id)
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
