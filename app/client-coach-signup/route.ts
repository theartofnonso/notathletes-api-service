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

    const { data: clientById, error: clientByIdError } = await supabase
      .from("clients")
      .select("id, email")
      .eq("id", clientId)
      .maybeSingle();

    if (clientByIdError) {
      console.error("client-coach-signup client by id:", clientByIdError);
      return fail("Failed to create client and assign coach", 500);
    }

    if (clientById) {
      if ((clientById.email ?? "").toLowerCase() !== email) {
        return fail("Email does not match existing client record");
      }
    } else {
      const { error: clientInsertError } = await supabase.from("clients").insert({
        id: clientId,
        email,
        name: fullName,
      });

      if (clientInsertError && clientInsertError.code !== "23505") {
        console.error("client-coach-signup clients insert:", clientInsertError);
        return fail("Failed to create client and assign coach", 500);
      }
    }
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("coach_clients")
    .select("coach_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (existingLinkError) {
    console.error("client-coach-signup coach_clients lookup:", existingLinkError);
    return fail("Failed to create client and assign coach", 500);
  }

  if (existingLink) {
    if (existingLink.coach_id !== coachId) {
      return fail("This client is already assigned to another coach");
    }
  } else {
    const { error: linkError } = await supabase.from("coach_clients").insert({
      coach_id: coachId,
      client_id: clientId,
    });

    if (linkError) {
      if (linkError.code === "23503") {
        return fail("Invalid coach or client reference");
      }
      if (linkError.code === "23505") {
        const { data: afterRace } = await supabase
          .from("coach_clients")
          .select("coach_id")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!afterRace || afterRace.coach_id !== coachId) {
          return fail("This client is already assigned to another coach");
        }
      } else {
        console.error("client-coach-signup coach_clients insert:", linkError);
        return fail("Failed to create client and assign coach", 500);
      }
    }
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

  return NextResponse.json(
    { success: true, refreshToken: signInData.session.refresh_token },
    { status: 200 }
  );
}
