import crypto from "crypto";
import type { Document } from "mongodb";
import { getDb } from "./mongo";
import type { Game, User } from "./types";

/**
 * Persistence layer (MongoDB).
 *
 * The whole app talks to storage only through the repository functions below,
 * so swapping the backing store never touches the rest of the codebase.
 * Documents are stored with a string `id` field (Mongo's own `_id` is projected
 * out everywhere) so the returned objects match the domain types exactly.
 */

// strip Mongo's _id from query results
const NO_ID = { projection: { _id: 0 } } as const;

export function newId(): string {
  return crypto.randomBytes(12).toString("hex");
}

async function users() {
  return (await getDb()).collection<User & Document>("users");
}
async function games() {
  return (await getDb()).collection<Game & Document>("games");
}

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------

export async function getUserById(id: string): Promise<User | undefined> {
  const col = await users();
  return (await col.findOne({ id }, NO_ID)) ?? undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const col = await users();
  // case-insensitive exact match on email
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    (await col.findOne(
      { email: { $regex: `^${escaped}$`, $options: "i" } },
      NO_ID,
    )) ?? undefined
  );
}

export async function createUser(
  user: Omit<User, "id" | "createdAt">,
): Promise<User> {
  const record: User = {
    ...user,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  const col = await users();
  await col.insertOne({ ...record });
  return record;
}

// ---------------------------------------------------------------------------
// Game repository
// ---------------------------------------------------------------------------

export async function getGame(id: string): Promise<Game | undefined> {
  const col = await games();
  return (await col.findOne({ id }, NO_ID)) ?? undefined;
}

export async function createGame(game: Game): Promise<Game> {
  const col = await games();
  await col.insertOne({ ...game });
  return game;
}

/**
 * Apply a mutation to a game and persist it. Returns the updated game, or
 * undefined if it doesn't exist.
 */
export async function updateGame(
  id: string,
  mutate: (game: Game) => void,
): Promise<Game | undefined> {
  const col = await games();
  const game = await col.findOne({ id }, NO_ID);
  if (!game) return undefined;
  mutate(game);
  game.updatedAt = new Date().toISOString();
  await col.replaceOne({ id }, { ...game });
  return game;
}

/** Games a user can see in their history: created by them or where they
 * claimed a player ("that's me"). Newest first. */
export async function listGamesForUser(userId: string): Promise<Game[]> {
  const col = await games();
  return col
    .find(
      { $or: [{ ownerUserId: userId }, { "players.userId": userId }] },
      NO_ID,
    )
    .sort({ date: -1 })
    .toArray();
}
