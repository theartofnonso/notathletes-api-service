/**
 * Capitalizes first letter of each word, rest lowercase.
 * Used for qualifications, specialties, interests_hobbies (pipe-separated).
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formats a pipe-separated string: each segment gets title case.
 * e.g. "Fat loss|bODYBUILDING" → "Fat Loss|Bodybuilding"
 */
function formatPipeSeparated(value: string | null | undefined): string | null {
  if (value == null || typeof value !== "string" || value.trim() === "") return null;
  return value
    .split("|")
    .map((s) => toTitleCase(s.trim()))
    .filter(Boolean)
    .join("|");
}

export function formatCoachProfile<T extends { qualifications?: string | null; specialties?: string | null; interests_hobbies?: string | null }>(
  profile: T
): T {
  return {
    ...profile,
    qualifications: formatPipeSeparated(profile.qualifications),
    specialties: formatPipeSeparated(profile.specialties),
    interests_hobbies: formatPipeSeparated(profile.interests_hobbies),
  };
}
