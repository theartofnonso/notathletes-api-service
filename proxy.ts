import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Replace with your protected path prefixes (e.g. /api/secure, /dashboard)
const PROTECTED_PATHS = ["/account/delete"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!PROTECTED_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await getSupabase().auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.next();
}

// Must match PROTECTED_PATHS; use static strings for build-time analysis
export const config = {
  matcher: PROTECTED_PATHS,
};
