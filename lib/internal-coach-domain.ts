/**
 * Coaches with emails under this domain are included in public coach GET APIs
 * even when coaches.active is false (internal / not listed publicly).
 */
export const INTERNAL_COACH_EMAIL_DOMAIN = "ware.health";

/** PostgREST `.or()` fragment for Supabase: active OR internal email domain */
export const COACH_VISIBLE_OR_FILTER = `active.eq.true,email.ilike.%@${INTERNAL_COACH_EMAIL_DOMAIN}`;
