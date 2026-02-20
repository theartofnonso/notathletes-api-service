import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type ProfileBody = {
  user_id?: string;
  name?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /account/profile
 * Upserts client profile names from app settings.
 * Body: { user_id, name }
 */
export async function POST(request: NextRequest) {
  try {
    let body: ProfileBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const userId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { error: "user_id must be a valid UUID" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data: existingClient, error: existingClientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingClientError) {
      console.error("Profile lookup failed:", existingClientError);
      return NextResponse.json(
        { error: "Failed to save profile" },
        { status: 500 }
      );
    }

    if (existingClient) {
      const { error: updateError } = await supabase
        .from("clients")
        .update({
          name,
          updated_at: nowIso,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Profile update failed:", updateError);
        return NextResponse.json(
          { error: "Failed to save profile" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          client: { id: userId, name },
        },
        { status: 200 }
      );
    }

    const { data: authLookup, error: authLookupError } =
      await supabase.auth.admin.getUserById(userId);

    if (authLookupError || !authLookup.user) {
      console.error("Auth lookup failed:", authLookupError);
      return NextResponse.json(
        { error: "Failed to resolve user for profile insert" },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabase.from("clients").insert({
      id: userId,
      email: authLookup.user.email ?? null,
      name,
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (insertError) {
      console.error("Profile insert failed:", insertError);
      return NextResponse.json(
        { error: "Failed to save profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        client: { id: userId, name },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Profile error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
