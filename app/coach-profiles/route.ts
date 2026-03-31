import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { formatCoachProfile } from "@/lib/coach-profile-format";

const COACH_SELECT = `
  id,
  coach_profile_id,
  coach_profile:coach_profiles!coaches_coach_profile_id_fkey (
    full_name,
    email,
    short_bio,
    years_experience,
    qualifications,
    specialties,
    interests_hobbies,
    profile_photo_url,
    intro_video_url,
    created_at,
    updated_at
  )
`;

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
    const { data: coaches, error } = await supabase
      .from("coaches")
      .select(COACH_SELECT)
      .eq("active", true)
      .not("coach_profile_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("coach-profiles fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch coaches" },
        { status: 500 }
      );
    }

    const formatted = (coaches ?? [])
      .map((coach) => {
        const coachProfile = Array.isArray(coach.coach_profile)
          ? coach.coach_profile[0]
          : coach.coach_profile;
        if (!coachProfile) return null;
        const formattedProfile = formatCoachProfile(coachProfile);
        return {
          id: coach.id,
          full_name: formattedProfile.full_name,
          email: formattedProfile.email,
          short_bio: formattedProfile.short_bio,
          years_experience: formattedProfile.years_experience,
          qualifications: formattedProfile.qualifications,
          specialties: formattedProfile.specialties,
          interests_hobbies: formattedProfile.interests_hobbies,
          profile_photo_url: formattedProfile.profile_photo_url,
          intro_video_url: formattedProfile.intro_video_url,
          created_at: formattedProfile.created_at,
          updated_at: formattedProfile.updated_at,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { coaches: formatted, limit, offset },
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
