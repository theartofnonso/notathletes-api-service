import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ensureClientAndCoachAssignment } from "@/lib/client-coach-assignment";

type Body = {
  fullName?: string;
  email?: string;
  coachId?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOG = "client-coach-signup";

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

  console.log(`[${LOG}]`, "request", { email, coachId });

  const supabase = getSupabase();

  const { data: clientByEmail, error: clientByEmailError } = await supabase
    .from("clients")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (clientByEmailError) {
    console.error("client-coach-signup client by email:", clientByEmailError);
    return fail("Failed to create client and assign coach", 500);
  }

  const initialPassword = randomPassword();
  let clientId: string;

  if (clientByEmail) {
    clientId = clientByEmail.id;
  } else {
    const existingAuthUserId = await findAuthUserIdByEmail(email);
    if (existingAuthUserId) {
      clientId = existingAuthUserId;
    } else {
      const { data: created, error: createUserError } =
        await supabase.auth.admin.createUser({
          email,
          password: initialPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

      if (createUserError || !created.user) {
        if (isAlreadyExistsError(createUserError?.message ?? "")) {
          const retryId = await findAuthUserIdByEmail(email);
          if (!retryId) {
            return fail("Failed to create client and assign coach", 500);
          }
          clientId = retryId;
        } else {
          console.error("client-coach-signup createUser:", createUserError);
          return fail("Failed to create client and assign coach", 500);
        }
      } else {
        clientId = created.user.id;
      }
    }

  }

  const assignment = await ensureClientAndCoachAssignment({
    supabase,
    clientId,
    email,
    fullName,
    coachId,
    logLabel: LOG,
  });
  if (!assignment.ok) {
    return fail(assignment.message, assignment.status ?? 400);
  }
  if (assignment.alreadyLinked) {
    return NextResponse.json({ success: true }, { status: 409 });
  }

  // Always return a refresh token: set a new password server-side, then sign in.
  const sessionPassword = randomPassword();
  const { error: pwdError } = await supabase.auth.admin.updateUserById(clientId, {
    password: sessionPassword,
  });

  if (pwdError) {
    console.error("client-coach-signup updateUser password:", pwdError);
    return fail("Failed to create client and assign coach", 500);
  }

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password: sessionPassword,
    });

  if (signInError || !signInData.session?.refresh_token) {
    console.error("client-coach-signup signIn:", signInError);
    return fail("Failed to create client and assign coach", 500);
  }

  console.log(`[${LOG}]`, "ok", { email, coachId, clientId });

  return NextResponse.json(
    { success: true, refreshToken: signInData.session.refresh_token },
    { status: 200 }
  );
}
