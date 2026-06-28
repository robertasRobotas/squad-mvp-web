import { NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
}
