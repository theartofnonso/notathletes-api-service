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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /coach-profiles/[id]
 * Returns a single coach with linked public coach profile by coach UUID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid coach ID" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: coach, error } = await supabase
      .from("coaches")
      .select(COACH_SELECT)
      .eq("id", id)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("coach-profiles fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch coach" },
        { status: 500 }
      );
    }
    const coachProfile = Array.isArray(coach?.coach_profile)
      ? coach.coach_profile[0]
      : coach?.coach_profile;

    if (!coach || !coachProfile) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    return NextResponse.json(
      (() => {
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
      })(),
      {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      }
    );
  } catch (err) {
    console.error("coach-profiles [id] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
