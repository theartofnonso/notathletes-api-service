import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
type DeleteBody = { userId?: string };

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid authorization" },
        { status: 401 }
      );
    }

    let body: DeleteBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : undefined;
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    if (user.id !== userId) {
      return NextResponse.json(
        { error: "userId does not match authenticated user" },
        { status: 400 }
      );
    }

    const { data: coachRow } = await supabase
      .from("coaches")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (coachRow) {
      return NextResponse.json(
        { error: "Coach accounts cannot be deleted" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Account deletion failed:", deleteError);
      return NextResponse.json(
        { error: "Account deletion failed" },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("Account delete error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
