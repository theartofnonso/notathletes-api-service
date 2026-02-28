import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type CreateProfileBody = {
  user_id?: string;
  name?: string;
};

type UpdateProfileBody = {
  user_id?: string;
  name?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUserId(userId: string): NextResponse | null {
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
  return null;
}

/**
 * POST /account/profile
 * Creates a new client profile (first-time users).
 * Body: { user_id, name }
 * Fails with 409 if record already exists.
 */
export async function POST(request: NextRequest) {
  try {
    let body: CreateProfileBody;
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

    const userIdError = validateUserId(userId);
    if (userIdError) return userIdError;

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
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    if (existingClient) {
      return NextResponse.json(
        { error: "Profile already exists for this user" },
        { status: 409 }
      );
    }

    const { data: authLookup, error: authLookupError } =
      await supabase.auth.admin.getUserById(userId);

    if (authLookupError || !authLookup.user) {
      console.error("Auth lookup failed:", authLookupError);
      return NextResponse.json(
        { error: "Failed to resolve user for profile create" },
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
      console.error("Profile create failed:", insertError);
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, client: { id: userId, name } },
      { status: 200 }
    );
  } catch (err) {
    console.error("Profile create error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /account/profile
 * Updates existing client profile.
 * Body: { user_id, name? }
 * Only updates fields provided. Fails with 404 if record does not exist.
 */
export async function PATCH(request: NextRequest) {
  try {
    let body: UpdateProfileBody;
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
    const name = typeof body.name === "string" ? body.name.trim() : undefined;

    const userIdError = validateUserId(userId);
    if (userIdError) return userIdError;

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data: existingClient, error: lookupError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (lookupError) {
      console.error("Profile lookup failed:", lookupError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    if (!existingClient) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, string> = { updated_at: nowIso };
    if (name !== undefined) updates.name = name;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const { data: updatedClient, error: updateError } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", userId)
      .select("id, name")
      .single();

    if (updateError) {
      console.error("Profile update failed:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, client: { id: updatedClient.id, name: updatedClient.name } },
      { status: 200 }
    );
  } catch (err) {
    console.error("Profile update error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
