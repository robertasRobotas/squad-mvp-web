import { NextResponse } from "next/server";
import { updateGame } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

// Claim ("that's me") or release a player as the logged-in user.
// Requires login — this is the one action that needs an account.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please log in to assign a player to yourself." },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const playerId = String(body?.playerId ?? "");
  const release = body?.release === true;

  const updated = await updateGame(id, (game) => {
    // a user can only "be" one player per game
    game.players.forEach((p) => {
      if (p.userId === user.id) p.userId = undefined;
    });
    if (!release) {
      const target = game.players.find((p) => p.id === playerId);
      if (target) target.userId = user.id;
    }
  });

  if (!updated) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game: updated });
}
