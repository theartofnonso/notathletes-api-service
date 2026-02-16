import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getWelcomeEmailTemplate } from "@/lib/templates/welcome";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 500 }
    );
  }

  try {
    const { email, name } = await request.json();

    if (!email || !name) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "https://www.notathletes.com";

    const { data, error } = await resend.emails.send({
      from: "Not Athletes <noreply@notathletes.com>",
      to: email,
      subject: "Welcome to Not Athletes",
      html: getWelcomeEmailTemplate(name, baseUrl),
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
