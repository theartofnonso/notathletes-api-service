import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { randomBytes } from "crypto";

type ActivateBody = {
  email?: string;
  first_name?: string;
  last_name?: string;
  receipt?: string;
  platform?: string;
};

/**
 * POST /account/activate
 * Creates or activates a client. Sets is_active = true.
 * Body: { email } required. { first_name, last_name } optional.
 * receipt, platform accepted but ignored (no IAP verification).
 */
export async function POST(request: NextRequest) {
  try {
    let body: ActivateBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || "Client";

    if (existingClient) {
      const { error } = await supabase
        .from("clients")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email);

      if (error) {
        console.error("Activate update error:", error);
        return NextResponse.json(
          { error: "Failed to activate subscription" },
          { status: 500 }
        );
      }
    } else {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
      });

      if (authError || !authUser.user) {
        console.error("Auth user creation failed:", authError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      const { error: insertError } = await supabase.from("clients").insert({
        id: authUser.user.id,
        email,
        name,
        is_active: true,
      });

      if (insertError) {
        console.error("Client insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to create client record" },
          { status: 500 }
        );
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("Activate error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
