import type { Slot, Team } from "./types";

// Curated formation presets keyed by team size (including the goalkeeper).
// Each string lists outfield rows from defense -> attack; the GK is implicit.
// Sum of the digits === teamSize - 1.
export const FORMATIONS: Record<number, string[]> = {
  4: ["1-2", "2-1", "3", "1-1-1"],
  5: ["2-1-1", "1-2-1", "2-2", "1-1-2", "3-1"],
  6: ["2-2-1", "2-1-2", "1-2-2", "3-2", "2-3"],
  7: ["2-3-1", "3-2-1", "2-1-3", "3-1-2", "2-2-2"],
  8: ["3-3-1", "3-2-2", "2-3-2", "3-1-3", "4-2-1"],
  9: ["3-3-2", "4-2-2", "3-2-3", "4-3-1", "2-4-2"],
  10: ["4-3-2", "3-4-2", "4-2-3", "3-3-3", "4-4-1"],
  11: ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "3-4-3", "4-5-1"],
};

export const TEAM_SIZES = Object.keys(FORMATIONS).map(Number);

export function formationsForSize(size: number): string[] {
  return FORMATIONS[size] ?? defaultFormationList(size);
}

export function defaultFormation(size: number): string {
  return formationsForSize(size)[0] ?? `${Math.max(size - 1, 1)}`;
}

// Fallback so any team size still produces a sensible single-row formation.
function defaultFormationList(size: number): string[] {
  const outfield = Math.max(size - 1, 1);
  return [`${outfield}`];
}

function roleForRow(rowIndex: number, totalRows: number): string {
  if (rowIndex === 0) return "GK";
  if (totalRows <= 1) return "OUT";
  if (rowIndex === 1) return "DEF";
  if (rowIndex === totalRows - 1) return "FWD";
  return "MID";
}

/**
 * Turn a formation string into positioned slots for one team.
 * Home occupies the bottom half of the pitch, away the top half (mirrored).
 * Coordinates are percentages (0-100) of the pitch box.
 */
export function formationToSlots(formation: string, team: Team): Slot[] {
  const rows = formation
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  // index 0 is the GK row (single keeper), then outfield rows defense->attack.
  const allRows = [1, ...rows];
  const totalRows = allRows.length;
  const slots: Slot[] = [];

  allRows.forEach((count, rowIndex) => {
    // 0 (own goal line) -> 1 (half-way line) along the team's own half.
    const depth = totalRows === 1 ? 0 : rowIndex / (totalRows - 1);
    // Map depth onto the team's half, stopping short of the centre line so the
    // two attacking lines don't overlap on top of each other.
    const y =
      team === "home"
        ? 92 - depth * 36 // 92 (own goal) -> 56 (just below centre)
        : 8 + depth * 36; // 8 (own goal) -> 44 (just above centre)

    for (let j = 0; j < count; j++) {
      const xFraction = (j + 1) / (count + 1);
      const x = team === "home" ? xFraction * 100 : 100 - xFraction * 100;
      slots.push({
        id: `${team}-${rowIndex}-${j}`,
        team,
        role: roleForRow(rowIndex, totalRows),
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      });
    }
  });

  return slots;
}

export function buildSlots(
  formationHome: string,
  formationAway: string,
): Slot[] {
  return [
    ...formationToSlots(formationHome, "home"),
    ...formationToSlots(formationAway, "away"),
  ];
}
