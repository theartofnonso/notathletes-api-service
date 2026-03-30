/**
 * Capitalizes first letter of each word, rest lowercase.
 * Used for qualifications, specialties, interests_hobbies (pipe-separated).
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Formats a pipe-separated string: each segment gets title case.
 * e.g. "Fat loss|bODYBUILDING" → "Fat Loss, Bodybuilding"
 */
function formatPipeSeparated(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  return value
    .split("|")
    .map((s) => toTitleCase(s.trim()))
    .filter(Boolean)
    .join(", ");
}

export function formatCoachProfile<T extends { qualifications?: string | null; specialties?: string | null; interests_hobbies?: string | null }>(
  profile: T
): T {
  return {
    ...profile,
    full_name: trimString((profile as { full_name?: unknown }).full_name),
    email: trimString((profile as { email?: unknown }).email),
    short_bio: trimString((profile as { short_bio?: unknown }).short_bio),
    qualifications: formatPipeSeparated(profile.qualifications),
    specialties: formatPipeSeparated(profile.specialties),
    interests_hobbies: formatPipeSeparated(profile.interests_hobbies),
    profile_photo_url: trimString(
      (profile as { profile_photo_url?: unknown }).profile_photo_url
    ),
    intro_video_url: trimString(
      (profile as { intro_video_url?: unknown }).intro_video_url
    ),
  };
}
