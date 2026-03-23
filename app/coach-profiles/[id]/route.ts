import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { formatCoachProfile } from "@/lib/coach-profile-format";

/** Public fields returned for display (excludes verification URLs, email) */
const PUBLIC_SELECT =
  "id, full_name, short_bio, years_experience, qualifications, specialties, interests_hobbies, profile_photo_url, intro_video_url, created_at, updated_at";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /coach-profiles/[id]
 * Returns a single coach profile by UUID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: profile, error } = await supabase
      .from("coach_profiles")
      .select(PUBLIC_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("coach-profiles fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch coach profile" },
        { status: 500 }
      );
    }
    if (!profile) {
      return NextResponse.json({ error: "Coach profile not found" }, { status: 404 });
    }

    return NextResponse.json(formatCoachProfile(profile), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("coach-profiles [id] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
