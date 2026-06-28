// Domain types for the sport planner. Football only for now, but `Sport`
// is kept as a union so other sports can be added later.

export type Sport = "football";

export type Team = "home" | "away";

export interface User {
  id: string;
  name: string;
  email: string;
  /** scrypt hash in the form `salt:hash`. Absent for Google-only accounts. */
  passwordHash?: string;
  imgUrl?: string;
  provider?: "password" | "google";
  createdAt: string;
}

/** Public-safe view of a user (never leaks the password hash). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  imgUrl?: string;
}

/** A person taking part in a game. Created per-game; may be claimed by a user. */
export interface Player {
  id: string;
  name: string;
  number?: number;
  imgUrl?: string;
  email?: string;
  /** id of the User who claimed "that's me". */
  userId?: string;
}

/** A position on the pitch generated from a formation. */
export interface Slot {
  id: string;
  team: Team;
  /** short position label, e.g. GK / DEF / MID / FWD */
  role: string;
  /** percentage coordinates within the pitch (0-100) */
  x: number;
  y: number;
  /** id of the assigned Player, if any */
  playerId?: string;
}

export interface Rating {
  id: string;
  playerId: string;
  stars: number; // 1..10
  /** id of the User who gave the rating, if logged in */
  raterUserId?: string;
  createdAt: string;
}

export interface Score {
  home: number;
  away: number;
}

export interface Game {
  id: string;
  sport: Sport;
  title?: string;
  /** team sizes, e.g. { home: 5, away: 5 } for 5-a-side */
  format: { home: number; away: number };
  formationHome: string; // e.g. "4-2-2"
  formationAway: string;
  /** ISO datetime for kick-off */
  date: string;
  address: string;
  players: Player[];
  slots: Slot[];
  score?: Score;
  ratings: Rating[];
  /** id of the User who created the game, if logged in */
  ownerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape the client sends to create a game. */
export interface CreateGameInput {
  title?: string;
  format: { home: number; away: number };
  formationHome: string;
  formationAway: string;
  date: string;
  address: string;
  players: Omit<Player, "id">[];
  /** clone the player list from an existing game */
  clonePlayersFrom?: string;
}
