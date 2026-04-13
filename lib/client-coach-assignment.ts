import type { SupabaseClient } from "@supabase/supabase-js";

type AssignmentParams = {
  supabase: SupabaseClient;
  clientId: string;
  email: string;
  fullName: string;
  coachId: string;
  logLabel?: string;
};

export type AssignmentResult =
  | { ok: true; alreadyLinked: boolean }
  | { ok: false; message: string; status?: number };

export async function ensureClientAndCoachAssignment({
  supabase,
  clientId,
  email,
  fullName,
  coachId,
  logLabel,
}: AssignmentParams): Promise<AssignmentResult> {
  const logPrefix = logLabel ? `[${logLabel}]` : null;

  const { data: coachRow, error: coachLookupError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", coachId)
    .maybeSingle();

  if (coachLookupError) {
    console.error(`${logLabel ?? "client-coach"} coach lookup:`, coachLookupError);
    return { ok: false, message: "Failed to create client and assign coach", status: 500 };
  }
  if (!coachRow) {
    if (logPrefix) console.log(logPrefix, "fail", { reason: "invalid_coach", coachId });
    return { ok: false, message: "Invalid coach" };
  }

  const { data: clientByEmail, error: clientByEmailError } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (clientByEmailError) {
    console.error(`${logLabel ?? "client-coach"} client by email:`, clientByEmailError);
    return { ok: false, message: "Failed to create client and assign coach", status: 500 };
  }

  if (clientByEmail && clientByEmail.id !== clientId) {
    if (logPrefix) {
      console.log(logPrefix, "fail", {
        reason: "email_linked_to_other_client",
        email,
        clientId,
        existingClientId: clientByEmail.id,
      });
    }
    return { ok: false, message: "This email is already linked to another account", status: 403 };
  }

  const { data: clientById, error: clientByIdError } = await supabase
    .from("clients")
    .select("id, email, name")
    .eq("id", clientId)
    .maybeSingle();

  if (clientByIdError) {
    console.error(`${logLabel ?? "client-coach"} client by id:`, clientByIdError);
    return { ok: false, message: "Failed to create client and assign coach", status: 500 };
  }

  if (clientById) {
    if ((clientById.email ?? "").toLowerCase() !== email) {
      if (logPrefix) console.log(logPrefix, "fail", { reason: "email_mismatch", clientId });
      return { ok: false, message: "Email does not match existing client record" };
    }
    if (clientById.name !== fullName) {
      const { error: updateErr } = await supabase
        .from("clients")
        .update({ name: fullName })
        .eq("id", clientId);
      if (updateErr) {
        console.error(`${logLabel ?? "client-coach"} clients update:`, updateErr);
        return { ok: false, message: "Failed to create client and assign coach", status: 500 };
      }
    }
  } else {
    const { error: clientInsertError } = await supabase.from("clients").insert({
      id: clientId,
      email,
      name: fullName,
    });

    if (clientInsertError && clientInsertError.code !== "23505") {
      console.error(`${logLabel ?? "client-coach"} clients insert:`, clientInsertError);
      return { ok: false, message: "Failed to create client and assign coach", status: 500 };
    }
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("coach_clients")
    .select("coach_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (existingLinkError) {
    console.error(`${logLabel ?? "client-coach"} coach_clients lookup:`, existingLinkError);
    return { ok: false, message: "Failed to create client and assign coach", status: 500 };
  }

  if (existingLink) {
    if (existingLink.coach_id !== coachId) {
      if (logPrefix) {
        console.log(logPrefix, "fail", {
          reason: "other_coach",
          email,
          coachId,
          clientId,
          existingCoachId: existingLink.coach_id,
        });
      }
      return { ok: false, message: "This client is already assigned to another coach" };
    }
    if (logPrefix) console.log(logPrefix, "already_linked", { email, coachId, clientId });
    return { ok: true, alreadyLinked: true };
  }

  const { error: linkError } = await supabase.from("coach_clients").insert({
    coach_id: coachId,
    client_id: clientId,
  });

  if (linkError) {
    if (linkError.code === "23503") {
      if (logPrefix) console.log(logPrefix, "fail", { reason: "invalid_reference", email, coachId, clientId });
      return { ok: false, message: "Invalid coach or client reference" };
    }
    if (linkError.code === "23505") {
      const { data: afterRace } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", clientId)
        .maybeSingle();
      if (!afterRace || afterRace.coach_id !== coachId) {
        if (logPrefix) {
          console.log(logPrefix, "fail", {
            reason: "other_coach_race",
            email,
            coachId,
            clientId,
          });
        }
        return { ok: false, message: "This client is already assigned to another coach" };
      }
      if (logPrefix) console.log(logPrefix, "already_linked", { email, coachId, clientId });
      return { ok: true, alreadyLinked: true };
    }
    console.error(`${logLabel ?? "client-coach"} coach_clients insert:`, linkError);
    return { ok: false, message: "Failed to create client and assign coach", status: 500 };
  }

  if (logPrefix) console.log(logPrefix, "linked", { email, coachId, clientId });
  return { ok: true, alreadyLinked: false };
}
