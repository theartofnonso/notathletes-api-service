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

function isAlreadyExistsError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("already") || msg.includes("registered");
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabase();
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
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

  const { data: existingClient, error: existingClientError } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingClientError) {
    console.error("client-coach-signup existing client lookup:", existingClientError);
    return fail("Failed to create client and assign coach", 500);
  }

  const password = randomPassword();
  let createdNewUser = false;
  let clientId = existingClient?.id ?? "";

  if (!clientId) {
    const { data: created, error: createUserError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (!createUserError && created.user) {
      createdNewUser = true;
      clientId = created.user.id;
    } else if (isAlreadyExistsError(createUserError?.message ?? "")) {
      const existingAuthUserId = await findAuthUserIdByEmail(email);
      if (!existingAuthUserId) {
        return fail("Failed to create client and assign coach", 500);
      }
      clientId = existingAuthUserId;
    } else {
      console.error("client-coach-signup createUser:", createUserError);
      return fail("Failed to create client and assign coach", 500);
    }

    const { error: clientInsertError } = await supabase.from("clients").insert({
      id: clientId,
      email,
      name: fullName,
    });

    if (clientInsertError && clientInsertError.code !== "23505") {
      console.error("client-coach-signup clients insert:", clientInsertError);
      if (createdNewUser) {
        await supabase.auth.admin.deleteUser(clientId);
      }
      return fail("Failed to create client and assign coach", 500);
    }
  }

  const { error: linkError } = await supabase.from("coach_clients").insert({
    coach_id: coachId,
    client_id: clientId,
  });

  if (linkError) {
    if (linkError.code === "23505") {
      return NextResponse.json({ success: true, refreshToken: null }, { status: 200 });
    }
    if (linkError.code === "23503") {
      return fail("Invalid coach or client reference");
    }
    console.error("client-coach-signup coach_clients insert:", linkError);
    if (createdNewUser) {
      await supabase.auth.admin.deleteUser(clientId);
    }
    return fail("Failed to create client and assign coach", 500);
  }

  let refreshToken: string | null = null;
  if (createdNewUser) {
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !signInData.session?.refresh_token) {
      console.error("client-coach-signup signIn:", signInError);
      await supabase.auth.admin.deleteUser(clientId);
      return fail("Failed to create client and assign coach", 500);
    }
    refreshToken = signInData.session.refresh_token;
  }

  return NextResponse.json(
    { success: true, refreshToken },
    { status: 200 }
  );
}
