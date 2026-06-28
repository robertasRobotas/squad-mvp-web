import { NextResponse } from "next/server";
import { createGame, getGame, listGamesForUser, newId } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { buildSlots, defaultFormation } from "@/lib/formations";
import type { CreateGameInput, Game, Player } from "@/lib/types";

// List the current user's games (history). Empty when logged out.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ games: [] });
  const games = await listGamesForUser(user.id);
  return NextResponse.json({ games });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const body = (await request.json().catch(() => null)) as CreateGameInput | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const home = clampSize(body.format?.home);
  const away = clampSize(body.format?.away);
  const address = String(body.address ?? "").trim();
  const date = String(body.date ?? "").trim();

  if (!date) {
    return NextResponse.json(
      { error: "Please choose when the game is happening." },
      { status: 400 },
    );
  }

  const formationHome = body.formationHome?.trim() || defaultFormation(home);
  const formationAway = body.formationAway?.trim() || defaultFormation(away);

  // Players: either cloned from an existing game or provided inline.
  let players: Player[] = [];
  if (body.clonePlayersFrom) {
    const source = await getGame(body.clonePlayersFrom);
    if (source) {
      players = source.players.map((p) => ({
        id: newId(),
        name: p.name,
        number: p.number,
        imgUrl: p.imgUrl,
        email: p.email,
        userId: p.userId,
      }));
    }
  } else if (Array.isArray(body.players)) {
    players = body.players
      .filter((p) => String(p.name ?? "").trim())
      .map((p) => ({
        id: newId(),
        name: String(p.name).trim(),
        number: numberOrUndef(p.number),
        imgUrl: strOrUndef(p.imgUrl),
        email: strOrUndef(p.email),
      }));
  }

  const now = new Date().toISOString();
  const game: Game = {
    id: newId(),
    sport: "football",
    title: strOrUndef(body.title),
    format: { home, away },
    formationHome,
    formationAway,
    date,
    address,
    swapEndsMinutes: numberOrUndef(body.swapEndsMinutes),
    players,
    slots: buildSlots(formationHome, formationAway),
    ratings: [],
    ownerUserId: user?.id,
    createdAt: now,
    updatedAt: now,
  };

  await createGame(game);
  return NextResponse.json({ game });
}

function clampSize(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(11, Math.max(4, v));
}

function numberOrUndef(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

function strOrUndef(s: unknown): string | undefined {
  const v = String(s ?? "").trim();
  return v || undefined;
}
