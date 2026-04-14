import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type Body = {
  coachId?: string;
};

type SessionRow = {
  start_time: string;
  end_time: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

function hoursBetween(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return (endMs - startMs) / (1000 * 60 * 60);
}

async function fetchAllSessionsForUsers(
  userIds: string[]
): Promise<{ sessions: SessionRow[]; error: Error | null }> {
  const supabase = getSupabase();
  const all: SessionRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("start_time, end_time")
      .in("user_id", userIds)
      .range(offset, offset + pageSize - 1);

    if (error) {
      return { sessions: [], error };
    }

    const rows = (data ?? []) as SessionRow[];
    all.push(...rows);

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { sessions: all, error: null };
}

/**
 * POST /coach-marketing-stats
 * Public endpoint for marketing metrics by coach.
 * Body: { coachId }
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const coachId = typeof body.coachId === "string" ? body.coachId.trim() : "";
  if (!coachId || !UUID_REGEX.test(coachId)) {
    return fail("coachId must be a valid UUID");
  }

  const supabase = getSupabase();
  const { data: links, error: linksError } = await supabase
    .from("coach_clients")
    .select("client_id")
    .eq("coach_id", coachId);

  if (linksError) {
    console.error("coach-marketing-stats links lookup:", linksError);
    return fail("Failed to fetch coach metrics", 500);
  }

  const clientIds = (links ?? []).map((row) => row.client_id).filter(Boolean);
  const clientsCount = clientIds.length;

  if (clientsCount === 0) {
    return NextResponse.json({
      success: true,
      coachId,
      clientsCount: 0,
      sessionsCount: 0,
      totalHours: 0,
    });
  }

  const { sessions, error: sessionsError } = await fetchAllSessionsForUsers(clientIds);
  if (sessionsError) {
    console.error("coach-marketing-stats sessions lookup:", sessionsError);
    return fail("Failed to fetch coach metrics", 500);
  }

  const sessionsCount = sessions.length;
  const totalHoursRaw = sessions.reduce(
    (acc, session) => acc + hoursBetween(session.start_time, session.end_time),
    0
  );

  // Keep two decimals for display while preserving numeric type.
  const totalHours = Math.round(totalHoursRaw * 100) / 100;

  return NextResponse.json({
    success: true,
    coachId,
    clientsCount,
    sessionsCount,
    totalHours,
  });
}
