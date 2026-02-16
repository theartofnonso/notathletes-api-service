import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /account/check-active?email=client@example.com
 * Returns { active: boolean } based on is_active.
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");
    if (!email?.trim()) {
      return NextResponse.json(
        { error: "email query parameter is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data: client, error } = await supabase
      .from("clients")
      .select("is_active")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("check-active error:", error);
      return NextResponse.json(
        { error: "Failed to check subscription status" },
        { status: 500 }
      );
    }

    const active = client?.is_active === true;

    return NextResponse.json({ active }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("check-active error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
