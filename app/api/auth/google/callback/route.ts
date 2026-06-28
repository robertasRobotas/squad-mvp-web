import { NextResponse } from "next/server";
import { createUser, getUserByEmail } from "@/lib/store";
import { setSession } from "@/lib/auth";

interface GoogleProfile {
  email?: string;
  name?: string;
  picture?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !code) {
    return NextResponse.redirect(`${url.origin}/login?error=google`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("no access token");

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.email) throw new Error("no email");

    let user = await getUserByEmail(profile.email);
    if (!user) {
      user = await createUser({
        name: profile.name ?? profile.email.split("@")[0],
        email: profile.email,
        imgUrl: profile.picture,
        provider: "google",
      });
    }
    await setSession(user.id);
    return NextResponse.redirect(`${url.origin}/`);
  } catch {
    return NextResponse.redirect(`${url.origin}/login?error=google`);
  }
}
