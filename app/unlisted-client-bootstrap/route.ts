import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ensureClientAndCoachAssignment } from "@/lib/client-coach-assignment";

type Body = {
  clientId?: string;
  fullName?: string;
  email?: string;
  coachId?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOG = "unlisted-client-bootstrap";

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * POST /unlisted-client-bootstrap
 * Creates/updates a clients row and assigns that client to coach_clients.
 * Body: { clientId, fullName, email, coachId }
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const coachId =
    typeof body.coachId === "string" ? body.coachId.trim() : "";

  if (!clientId || !UUID_REGEX.test(clientId)) {
    return fail("clientId must be a valid UUID");
  }
  if (!fullName) {
    return fail("fullName is required");
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return fail("A valid email is required");
  }
  if (!coachId || !UUID_REGEX.test(coachId)) {
    return fail("coachId must be a valid UUID");
  }

  console.log(`[${LOG}]`, "request", { clientId, email, coachId });

  const assignment = await ensureClientAndCoachAssignment({
    supabase: getSupabase(),
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

  console.log(`[${LOG}]`, "ok", { clientId, email, coachId });
  return NextResponse.json({ success: true }, { status: 200 });
}
