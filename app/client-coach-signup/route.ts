import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type Body = {
  fullName?: string;
  email?: string;
  coachId?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

function randomPassword(): string {
  return randomBytes(32).toString("base64url") + "Aa1!";
}

/**
 * POST /client-coach-signup
 * Creates auto-confirmed auth user, clients row, and coach_clients row in one flow.
 * Body: { fullName, email, coachId }
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const coachId =
    typeof body.coachId === "string" ? body.coachId.trim() : "";

  if (!fullName) {
    return fail("fullName is required");
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return fail("A valid email is required");
  }
  if (!coachId || !UUID_REGEX.test(coachId)) {
    return fail("coachId must be a valid UUID");
  }

  const supabase = getSupabase();

  const { data: coachRow, error: coachLookupError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", coachId)
    .maybeSingle();

  if (coachLookupError) {
    console.error("client-coach-signup coach lookup:", coachLookupError);
    return fail("Failed to create client and assign coach", 500);
  }
  if (!coachRow) {
    return fail("Invalid coach");
  }

  const password = randomPassword();
  const { data: created, error: createUserError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (createUserError || !created.user) {
    console.error("client-coach-signup createUser:", createUserError);
    const msg = createUserError?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered")) {
      return fail("An account with this email already exists");
    }
    return fail("Failed to create client and assign coach", 500);
  }

  const userId = created.user.id;
  const nowIso = new Date().toISOString();

  const { error: clientError } = await supabase.from("clients").insert({
    id: userId,
    email,
    name: fullName,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (clientError) {
    console.error("client-coach-signup clients insert:", clientError);
    await supabase.auth.admin.deleteUser(userId);
    return fail("Failed to create client and assign coach", 500);
  }

  const { error: linkError } = await supabase.from("coach_clients").insert({
    coach_id: coachId,
    client_id: userId,
  });

  if (linkError) {
    console.error("client-coach-signup coach_clients insert:", linkError);
    await supabase.auth.admin.deleteUser(userId);
    if (linkError.code === "23505") {
      return fail("This client is already assigned to this coach");
    }
    if (linkError.code === "23503") {
      return fail("Invalid coach or client reference");
    }
    return fail("Failed to create client and assign coach", 500);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
