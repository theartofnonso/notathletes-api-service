/**
 * Central URLs for external services and app links.
 */

export const URLs = {
  /** FCM notify service - notify coach when client is assigned */
  FCM_NOTIFY_CLIENT_ASSIGNED:
    process.env.FCM_NOTIFY_URL ?? "https://fcm.notathletes.com/notify-client-assigned",

  /** App base URL (e.g. for email links) */
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.notathletes.com",

  /** App Store link */
  APP_STORE: "https://apps.apple.com/app/id6758530822",
} as const;
