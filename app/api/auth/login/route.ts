import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/store";
import { setSession, toPublicUser, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");

  const user = email ? await getUserByEmail(email) : undefined;
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  await setSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
