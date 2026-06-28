import { NextResponse } from "next/server";
import { getGame, updateGame } from "@/lib/store";
import { formationToSlots } from "@/lib/formations";
import type { Game, Score, Slot, Team } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const game = await getGame(id);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game });
}

// Partial update: lineup slots, final score, and basic event details.
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const updated = await updateGame(id, (game) => {
    // Formation changes rebuild that team's slots (keeping players where we can)
    // and must run before slot/playerId edits.
    if (typeof body.formationHome === "string" && body.formationHome.trim()) {
      changeFormation(game, "home", body.formationHome.trim());
    }
    if (typeof body.formationAway === "string" && body.formationAway.trim()) {
      changeFormation(game, "away", body.formationAway.trim());
    }
    if (Array.isArray(body.slots)) {
      game.slots = sanitizeSlots(body.slots, game.slots);
    }
    if (body.score !== undefined) {
      game.score = sanitizeScore(body.score);
    }
    if (typeof body.title === "string") game.title = body.title.trim();
    if (typeof body.address === "string") game.address = body.address.trim();
    if (typeof body.date === "string" && body.date.trim()) {
      game.date = body.date.trim();
    }
  });

  if (!updated) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game: updated });
}

// Switch a team's formation: regenerate its slots and carry over the players
// that were already on the pitch (in order). Overflow players fall to the bench.
function changeFormation(game: Game, team: Team, formation: string): void {
  if (formation === (team === "home" ? game.formationHome : game.formationAway))
    return;

  const previouslyAssigned = game.slots
    .filter((s) => s.team === team && s.playerId)
    .map((s) => s.playerId!);

  const newTeamSlots = formationToSlots(formation, team);
  previouslyAssigned.forEach((pid, i) => {
    if (newTeamSlots[i]) newTeamSlots[i].playerId = pid;
  });

  const otherSlots = game.slots.filter((s) => s.team !== team);
  game.slots =
    team === "home"
      ? [...newTeamSlots, ...otherSlots]
      : [...otherSlots, ...newTeamSlots];

  if (team === "home") game.formationHome = formation;
  else game.formationAway = formation;

  // keep the "N v N" count in sync with the new formation (outfield + GK)
  const players = formation
    .split("-")
    .reduce((a, n) => a + (parseInt(n, 10) || 0), 0) + 1;
  game.format = { ...game.format, [team]: players };
}

// Only allow updating playerId/coords on known slots; never trust raw client
// objects to replace structural slot data.
function sanitizeSlots(incoming: unknown[], existing: Slot[]): Slot[] {
  return existing.map((slot) => {
    const match = incoming.find(
      (s) => (s as Slot)?.id === slot.id,
    ) as Partial<Slot> | undefined;
    if (!match) return slot;
    return {
      ...slot,
      playerId:
        typeof match.playerId === "string" ? match.playerId : undefined,
      x: typeof match.x === "number" ? match.x : slot.x,
      y: typeof match.y === "number" ? match.y : slot.y,
    };
  });
}

function sanitizeScore(score: unknown): Score | undefined {
  if (score === null) return undefined;
  const s = score as Partial<Score>;
  const home = Math.max(0, Math.round(Number(s?.home)));
  const away = Math.max(0, Math.round(Number(s?.away)));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return undefined;
  return { home, away };
}
