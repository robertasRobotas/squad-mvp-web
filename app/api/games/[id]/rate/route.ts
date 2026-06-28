import { NextResponse } from "next/server";
import { newId, updateGame } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

// Rate a player 1..10. If logged in, the rating is attributed and upserted
// (one rating per rater per player). Anonymous ratings are also allowed.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const body = await request.json().catch(() => null);
  const playerId = String(body?.playerId ?? "");
  const stars = Math.round(Number(body?.stars));

  if (!playerId || !Number.isFinite(stars) || stars < 1 || stars > 10) {
    return NextResponse.json(
      { error: "Provide a playerId and a rating from 1 to 10." },
      { status: 400 },
    );
  }

  const updated = await updateGame(id, (game) => {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;

    if (user) {
      const existing = game.ratings.find(
        (r) => r.playerId === playerId && r.raterUserId === user.id,
      );
      if (existing) {
        existing.stars = stars;
        existing.createdAt = new Date().toISOString();
        return;
      }
    }
    game.ratings.push({
      id: newId(),
      playerId,
      stars,
      raterUserId: user?.id,
      createdAt: new Date().toISOString(),
    });
  });

  if (!updated) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game: updated });
}
