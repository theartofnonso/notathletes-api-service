import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type CoachClientBody = {
  coach_id?: string;
  client_id?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /coach-clients
 * Assigns a client to a coach. Inserts into coach_clients.
 * Body: { coach_id, client_id }
 * Fails with 409 if link already exists.
 */
export async function POST(request: NextRequest) {
  try {
    let body: CoachClientBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const coachId =
      typeof body.coach_id === "string" ? body.coach_id.trim() : "";
    const clientId =
      typeof body.client_id === "string" ? body.client_id.trim() : "";

    if (!coachId) {
      return NextResponse.json(
        { error: "coach_id is required" },
        { status: 400 }
      );
    }
    if (!UUID_REGEX.test(coachId)) {
      return NextResponse.json(
        { error: "coach_id must be a valid UUID" },
        { status: 400 }
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400 }
      );
    }
    if (!UUID_REGEX.test(clientId)) {
      return NextResponse.json(
        { error: "client_id must be a valid UUID" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: record, error } = await supabase
      .from("coach_clients")
      .insert({ coach_id: coachId, client_id: clientId })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Client is already assigned to this coach" },
          { status: 409 }
        );
      }
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Invalid coach_id or client_id" },
          { status: 400 }
        );
      }
      console.error("coach-clients insert failed:", error);
      return NextResponse.json(
        { error: "Failed to assign client to coach" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, coach_client: record }, { status: 201 });
  } catch (err) {
    console.error("coach-clients error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
