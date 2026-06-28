import { NextResponse } from "next/server";

// Kicks off Google OAuth. Activates only when GOOGLE_CLIENT_ID +
// GOOGLE_CLIENT_SECRET are configured. The redirect URI must be registered in
// the Google Cloud console as `<origin>/api/auth/google/callback`.
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Google sign-in isn't configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.",
      },
      { status: 501 },
    );
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
}
