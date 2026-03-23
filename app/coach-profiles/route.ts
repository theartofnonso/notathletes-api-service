import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { formatCoachProfile } from "@/lib/coach-profile-format";

/** Public fields returned for display (excludes verification URLs, email) */
const PUBLIC_SELECT =
  "id, full_name, short_bio, years_experience, qualifications, specialties, interests_hobbies, profile_photo_url, intro_video_url, created_at, updated_at";

/**
 * GET /coach-profiles
 * Returns public coach profile data for display.
 * Query params: limit=20&offset=0 (pagination)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1),
      100
    );
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const supabase = getSupabase();
    const { data: profiles, error } = await supabase
      .from("coach_profiles")
      .select(PUBLIC_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("coach-profiles fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch coach profiles" },
        { status: 500 }
      );
    }

    const formatted = (profiles ?? []).map(formatCoachProfile);
    return NextResponse.json(
      { profiles: formatted, limit, offset },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("coach-profiles error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
