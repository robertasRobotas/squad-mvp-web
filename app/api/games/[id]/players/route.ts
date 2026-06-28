import { NextResponse } from "next/server";
import { newId, updateGame } from "@/lib/store";
import type { Player } from "@/lib/types";

// Add a player to an existing game.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Player name is required." },
      { status: 400 },
    );
  }

  const player: Player = {
    id: newId(),
    name,
    number: posIntOrUndef(body?.number),
    imgUrl: strOrUndef(body?.imgUrl),
    email: strOrUndef(body?.email),
  };

  const updated = await updateGame(id, (game) => {
    game.players.push(player);
  });
  if (!updated) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game: updated, player });
}

// Remove a player (and clear it from any slot).
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required." }, { status: 400 });
  }

  const updated = await updateGame(id, (game) => {
    game.players = game.players.filter((p) => p.id !== playerId);
    game.slots = game.slots.map((s) =>
      s.playerId === playerId ? { ...s, playerId: undefined } : s,
    );
    game.ratings = game.ratings.filter((r) => r.playerId !== playerId);
  });
  if (!updated) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game: updated });
}

function posIntOrUndef(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

function strOrUndef(s: unknown): string | undefined {
  const v = String(s ?? "").trim();
  return v || undefined;
}
