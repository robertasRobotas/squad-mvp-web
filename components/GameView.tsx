"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { formatDateTime } from "@/lib/format";
import {
  defaultFormation,
  formationsForSize,
  formationToSlots,
  TEAM_SIZES,
} from "@/lib/formations";
import type { Game, Player, PublicUser, Slot, Team } from "@/lib/types";

// formations available for a team size, always including the current one
function formationOptions(size: number, current: string): string[] {
  const list = formationsForSize(size);
  return list.includes(current) ? list : [current, ...list];
}

// optimistic mirror of the server's formation change: rebuild a team's slots,
// carrying assigned players over in order.
function rebuildFormation(game: Game, team: Team, formation: string): Game {
  const previouslyAssigned = game.slots
    .filter((s) => s.team === team && s.playerId)
    .map((s) => s.playerId as string);
  const newTeamSlots = formationToSlots(formation, team);
  previouslyAssigned.forEach((pid, i) => {
    if (newTeamSlots[i]) newTeamSlots[i].playerId = pid;
  });
  const otherSlots = game.slots.filter((s) => s.team !== team);
  const players =
    formation.split("-").reduce((a, n) => a + (parseInt(n, 10) || 0), 0) + 1;
  return {
    ...game,
    slots:
      team === "home"
        ? [...newTeamSlots, ...otherSlots]
        : [...otherSlots, ...newTeamSlots],
    formationHome: team === "home" ? formation : game.formationHome,
    formationAway: team === "away" ? formation : game.formationAway,
    format: { ...game.format, [team]: players },
  };
}

interface Props {
  initialGame: Game;
  currentUser: PublicUser | null;
}

interface DragState {
  playerId: string;
  x: number;
  y: number;
}

interface DragInfo {
  playerId: string;
  fromSlotId: string | null;
  startX: number;
  startY: number;
  moved: boolean;
  rect: DOMRect;
  onMove: (e: PointerEvent) => void;
  onUp: (e: PointerEvent) => void;
}

export default function GameView({ initialGame, currentUser }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const me = user ?? currentUser;

  const [game, setGame] = useState<Game>(initialGame);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [pinned, setPinned] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  // Dates are locale/timezone dependent, so only format them after mount to
  // avoid an SSR/client hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dragRef = useRef<DragInfo | null>(null);
  const dropRef = useRef<string | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);

  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    game.players.forEach((p) => m.set(p.id, p));
    return m;
  }, [game.players]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    game.slots.forEach((slot) => slot.playerId && s.add(slot.playerId));
    return s;
  }, [game.slots]);

  const bench = game.players.filter((p) => !assignedIds.has(p.id));
  const myPlayerId = me ? game.players.find((p) => p.userId === me.id)?.id : undefined;

  const averages = useMemo(() => {
    const m = new Map<string, { avg: number; count: number }>();
    game.players.forEach((p) => {
      const rs = game.ratings.filter((r) => r.playerId === p.id);
      if (rs.length) {
        const avg = rs.reduce((a, r) => a + r.stars, 0) / rs.length;
        m.set(p.id, { avg: Math.round(avg * 10) / 10, count: rs.length });
      }
    });
    return m;
  }, [game.players, game.ratings]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }

  // -- persistence helpers --
  const patchGame = useCallback(
    async (body: Record<string, unknown>, optimistic?: Game) => {
      if (optimistic) setGame(optimistic);
      try {
        const res = await fetch(`/api/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.game) setGame(data.game);
      } catch {
        flash("Could not save — check your connection.");
      }
    },
    [game.id],
  );

  function commitSlots(slots: Slot[]) {
    patchGame({ slots }, { ...game, slots });
  }

  function assignToSlot(
    playerId: string,
    slotId: string,
    fromSlotId: string | null,
  ) {
    const slots = game.slots.map((s) => ({ ...s }));
    const target = slots.find((s) => s.id === slotId);
    if (!target) return;
    const displaced = target.playerId;
    slots.forEach((s) => {
      if (s.playerId === playerId) s.playerId = undefined;
    });
    if (displaced && displaced !== playerId && fromSlotId) {
      const from = slots.find((s) => s.id === fromSlotId);
      if (from) from.playerId = displaced;
    }
    target.playerId = playerId;
    commitSlots(slots);
  }

  function unassign(playerId: string) {
    const slots = game.slots.map((s) =>
      s.playerId === playerId ? { ...s, playerId: undefined } : s,
    );
    commitSlots(slots);
  }

  // -- drag (pointer based) --
  function startDrag(
    e: React.PointerEvent,
    playerId: string,
    fromSlotId: string | null,
  ) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const info = dragRef.current;
      if (!info) return;
      const dx = ev.clientX - info.startX;
      const dy = ev.clientY - info.startY;
      if (!info.moved && Math.hypot(dx, dy) < 6) return;
      info.moved = true;
      setHovered(null);
      setPinned(null);
      setDrag({ playerId: info.playerId, x: ev.clientX, y: ev.clientY });

      // If the pointer is over the pitch, snap to the NEAREST position rather
      // than requiring a pixel-perfect hit — this makes crowded spots (e.g. the
      // two forwards near the halfway line) reliably reachable.
      let target: string | null = null;
      const pitch = pitchRef.current;
      if (pitch) {
        const r = pitch.getBoundingClientRect();
        const inside =
          ev.clientX >= r.left &&
          ev.clientX <= r.right &&
          ev.clientY >= r.top &&
          ev.clientY <= r.bottom;
        if (inside) {
          const px = ((ev.clientX - r.left) / r.width) * 100;
          const py = ((ev.clientY - r.top) / r.height) * 100;
          let bestDist = Infinity;
          for (const s of game.slots) {
            const d = (s.x - px) ** 2 + (s.y - py) ** 2;
            if (d < bestDist) {
              bestDist = d;
              target = s.id;
            }
          }
        }
      }
      if (!target) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (el?.closest("[data-bench]")) target = "__bench__";
      }
      dropRef.current = target;
      setDropTarget(target);
    };

    const onUp = (ev: PointerEvent) => {
      const info = dragRef.current;
      document.removeEventListener("pointermove", info!.onMove);
      document.removeEventListener("pointerup", info!.onUp);
      dragRef.current = null;
      setDrag(null);
      const target = dropRef.current;
      dropRef.current = null;
      setDropTarget(null);
      if (!info) return;
      if (!info.moved) {
        // a tap/click → toggle the action popover
        openPlayerActions(
          info.playerId,
          info.rect.left + info.rect.width / 2,
          info.rect.top,
        );
        return;
      }
      if (target === "__bench__") unassign(info.playerId);
      else if (target) assignToSlot(info.playerId, target, info.fromSlotId);
      void ev;
    };

    const info: DragInfo = {
      playerId,
      fromSlotId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      rect,
      onMove,
      onUp,
    };
    dragRef.current = info;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // close pinned popover when clicking elsewhere
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".popover") || el.closest("[data-draggable]")) return;
      setPinned(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  // -- account-gated + player actions --
  async function claim(playerId: string, release: boolean) {
    if (!me) {
      flash("Log in to claim your spot.");
      router.push(`/login?next=/games/${game.id}`);
      return;
    }
    const res = await fetch(`/api/games/${game.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, release }),
    });
    const data = await res.json();
    if (res.ok && data.game) {
      setGame(data.game);
      flash(release ? "Released." : "That's you! ⚽");
    } else {
      flash(data.error || "Could not update.");
    }
  }

  async function rate(playerId: string, stars: number) {
    const res = await fetch(`/api/games/${game.id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, stars }),
    });
    const data = await res.json();
    if (res.ok && data.game) {
      setGame(data.game);
      flash(`Rated ${stars}/10`);
    }
  }

  async function addPlayer(p: Omit<Player, "id">) {
    const res = await fetch(`/api/games/${game.id}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const data = await res.json();
    if (res.ok && data.game) setGame(data.game);
    else flash(data.error || "Could not add player.");
  }

  async function removePlayer(playerId: string) {
    const res = await fetch(
      `/api/games/${game.id}/players?playerId=${playerId}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (res.ok && data.game) setGame(data.game);
    setPinned(null);
  }

  function myRatingFor(playerId: string): number | undefined {
    if (!me) return undefined;
    return game.ratings.find(
      (r) => r.playerId === playerId && r.raterUserId === me.id,
    )?.stars;
  }

  // Open the player action popover (claim / rate / remove) anchored at a point,
  // used by both the pitch circles and the team-sheet table rows.
  function openPlayerActions(playerId: string, x: number, y: number) {
    // keep the ~230px popover within the viewport
    const cx = Math.min(Math.max(x, 122), window.innerWidth - 122);
    setPinned((cur) =>
      cur?.id === playerId ? null : { id: playerId, x: cx, y },
    );
  }

  // Change a team's size (e.g. 7-a-side -> 5-a-side): switch to a default
  // formation for the new size; the rebuild keeps placed players where it can.
  function changeSize(team: "home" | "away", size: number) {
    const formation = defaultFormation(size);
    patchGame(
      team === "home"
        ? { formationHome: formation }
        : { formationAway: formation },
      rebuildFormation(game, team, formation),
    );
  }

  // -- rendering helpers --
  function circleInner(player: Player) {
    if (player.imgUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={player.imgUrl} alt={player.name} />;
    }
    return <span>{player.number ?? player.name.slice(0, 2).toUpperCase()}</span>;
  }

  const popoverPlayerId = pinned?.id ?? null;
  const popoverPlayer = popoverPlayerId
    ? playersById.get(popoverPlayerId)
    : null;
  const hoveredPlayer =
    hovered && hovered.id !== popoverPlayerId
      ? playersById.get(hovered.id)
      : null;

  return (
    <div className="container page">
      <Link href="/" className="back-link">
        ← All games
      </Link>

      <div className="game-header">
        <h1>{game.title || "Football match"}</h1>
        <div className="formation-pill" title="Team sizes — how many vs how many">
          <select
            aria-label="Home team size"
            value={game.format.home}
            onChange={(e) => changeSize("home", Number(e.target.value))}
          >
            {TEAM_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <strong style={{ color: "var(--muted)" }}>v</strong>
          <select
            aria-label="Away team size"
            value={game.format.away}
            onChange={(e) => changeSize("away", Number(e.target.value))}
          >
            {TEAM_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="formation-pill" title="Home line-up">
          🏠
          <select
            value={game.formationHome}
            onChange={(e) =>
              patchGame(
                { formationHome: e.target.value },
                rebuildFormation(game, "home", e.target.value),
              )
            }
          >
            {formationOptions(game.format.home, game.formationHome).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="formation-pill" title="Away line-up">
          ✈️
          <select
            value={game.formationAway}
            onChange={(e) =>
              patchGame(
                { formationAway: e.target.value },
                rebuildFormation(game, "away", e.target.value),
              )
            }
          >
            {formationOptions(game.format.away, game.formationAway).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="game-meta" style={{ marginBottom: 16 }}>
        <span suppressHydrationWarning>
          🗓️ {mounted ? formatDateTime(game.date) : ""}
        </span>
        {game.address && <span>📍 {game.address}</span>}
      </div>

      {/* match rule: switch ends every N minutes */}
      <SwapEndsRule
        key={game.swapEndsMinutes ?? "none"}
        minutes={game.swapEndsMinutes}
        onChange={(m) =>
          patchGame(
            { swapEndsMinutes: m ?? null },
            { ...game, swapEndsMinutes: m },
          )
        }
      />

      {/* PLAYER TRAY — kept above the pitch so players are always visible */}
      <section className="card card-pad tray">
        <div className="tray-head">
          <h3 style={{ fontSize: "1.05rem", margin: 0 }}>
            Players{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              {game.players.length === 0
                ? "— add some to get started"
                : `· ${bench.length} on the bench`}
            </span>
          </h3>
          <AddPlayer onAdd={addPlayer} />
        </div>
        <div
          className={`bench tray-bench${
            dropTarget === "__bench__" ? " drop-target" : ""
          }`}
          data-bench
        >
          {game.players.length === 0 ? (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              No players yet — use “Add player” above, then drag them onto the
              pitch.
            </span>
          ) : (
            bench.length === 0 && (
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Everyone is on the pitch 🎉
              </span>
            )
          )}
          {bench.map((p) => (
            <div
              key={p.id}
              data-draggable
              className="bench-player"
              onPointerDown={(e) => startDrag(e, p.id, null)}
            >
              <span className="bp-circle">{circleInner(p)}</span>
              {p.name}
              {p.id === myPlayerId && " ⚽"}
            </div>
          ))}
        </div>
      </section>

      <div className="board-layout">
        {/* PITCH */}
        <div className="pitch-wrap">
          <div className="pitch" ref={pitchRef}>
            <div className="pitch-box top" />
            <div className="pitch-box bottom" />
            {game.slots.map((slot) => {
              const player = slot.playerId
                ? playersById.get(slot.playerId)
                : undefined;
              const isMine = player && player.id === myPlayerId;
              return (
                <div
                  key={slot.id}
                  className={`slot${dropTarget === slot.id ? " drop-target" : ""}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  data-slot-id={slot.id}
                >
                  {player ? (
                    <>
                      <div
                        data-draggable
                        className={`circle ${slot.team}${isMine ? " mine" : ""}`}
                        onPointerDown={(e) =>
                          startDrag(e, player.id, slot.id)
                        }
                        onMouseEnter={(e) => {
                          const r = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          setHovered({
                            id: player.id,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onMouseLeave={() => setHovered(null)}
                      >
                        {circleInner(player)}
                        {isMine && <span className="mine-tag">ME</span>}
                      </div>
                      <span className="slot-name">{player.name}</span>
                    </>
                  ) : (
                    <div className="slot-empty">{slot.role}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p
            className="muted"
            style={{ textAlign: "center", fontSize: "0.82rem", marginTop: 10 }}
          >
            Drag players from the bench onto the pitch · tap a player for options
          </p>
        </div>

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="card card-pad">
            <h3 style={{ fontSize: "1.05rem" }}>Final score</h3>
            <ScoreEditor
              key={`${game.score?.home ?? ""}-${game.score?.away ?? ""}`}
              game={game}
              onSave={(score) => patchGame({ score }, { ...game, score })}
            />
          </div>

          {averages.size > 0 && (
            <div className="card card-pad">
              <h3 style={{ fontSize: "1.05rem" }}>Squad ratings</h3>
              {game.players
                .filter((p) => averages.has(p.id))
                .sort(
                  (a, b) =>
                    (averages.get(b.id)?.avg ?? 0) -
                    (averages.get(a.id)?.avg ?? 0),
                )
                .map((p) => (
                  <div key={p.id} className="rating-row">
                    <span>{p.name}</span>
                    <span className="rating-score">
                      ⭐ {averages.get(p.id)?.avg}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {" "}
                        ({averages.get(p.id)?.count})
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          )}

          <div className="card card-pad">
            <button
              className="btn btn-primary btn-block"
              onClick={() => router.push(`/games/new?clone=${game.id}`)}
              title="Create another game with the same people"
            >
              🔁 Rematch with same squad
            </button>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => {
                navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => flash("Link copied — share it with your squad!"))
                  .catch(() => flash(window.location.href));
              }}
            >
              🔗 Copy share link
            </button>
            {!me && (
              <p
                className="muted"
                style={{ fontSize: "0.8rem", margin: "12px 0 0" }}
              >
                <Link href={`/login?next=/games/${game.id}`} className="accent">
                  Log in
                </Link>{" "}
                to claim your spot and keep this game in your history.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* TEAM SHEETS — one table per team, below the pitch */}
      <div className="team-sheets">
        <TeamSheet
          title="Home"
          icon="🏠"
          formation={game.formationHome}
          slots={game.slots.filter((s) => s.team === "home")}
          playersById={playersById}
          averages={averages}
          myPlayerId={myPlayerId}
          onSelectPlayer={openPlayerActions}
        />
        <TeamSheet
          title="Away"
          icon="✈️"
          formation={game.formationAway}
          slots={game.slots.filter((s) => s.team === "away")}
          playersById={playersById}
          averages={averages}
          myPlayerId={myPlayerId}
          onSelectPlayer={openPlayerActions}
        />
      </div>

      {/* hover tooltip */}
      {hoveredPlayer && hovered && (
        <div
          className="popover"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <h4>
            {hoveredPlayer.number ? `#${hoveredPlayer.number} ` : ""}
            {hoveredPlayer.name}
          </h4>
          {hoveredPlayer.id === myPlayerId ? (
            <span className="mine-badge">✓ That&apos;s me</span>
          ) : hoveredPlayer.userId ? (
            <div className="po-sub">Claimed by a player</div>
          ) : (
            <div className="po-sub">Unassigned — tap to claim</div>
          )}
          {averages.has(hoveredPlayer.id) && (
            <div className="po-sub">
              ⭐ {averages.get(hoveredPlayer.id)?.avg} / 10
            </div>
          )}
        </div>
      )}

      {/* pinned action popover */}
      {popoverPlayer && pinned && (
        <div className="popover" style={{ left: pinned.x, top: pinned.y }}>
          <h4>
            {popoverPlayer.number ? `#${popoverPlayer.number} ` : ""}
            {popoverPlayer.name}
          </h4>
          {popoverPlayer.id === myPlayerId ? (
            <div className="po-sub">
              <span className="mine-badge">✓ That&apos;s me</span>
            </div>
          ) : popoverPlayer.userId ? (
            <div className="po-sub">Claimed by another player</div>
          ) : (
            <div className="po-sub">No one has claimed this player yet</div>
          )}

          <div className="muted" style={{ fontSize: "0.78rem" }}>
            Rate (1–10)
          </div>
          <div className="po-stars">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const mine = myRatingFor(popoverPlayer.id);
              return (
                <button
                  key={n}
                  className={`po-star${mine && n <= mine ? " on" : ""}`}
                  onClick={() => rate(popoverPlayer.id, n)}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {averages.has(popoverPlayer.id) && (
            <div className="po-sub">
              Average ⭐ {averages.get(popoverPlayer.id)?.avg} (
              {averages.get(popoverPlayer.id)?.count})
            </div>
          )}

          <div className="po-actions">
            {popoverPlayer.id === myPlayerId ? (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => claim(popoverPlayer.id, true)}
              >
                Release
              </button>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => claim(popoverPlayer.id, false)}
              >
                That&apos;s me
              </button>
            )}
            <button
              className="btn btn-sm btn-danger"
              onClick={() => removePlayer(popoverPlayer.id)}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* drag ghost */}
      {drag &&
        (() => {
          const p = playersById.get(drag.playerId);
          if (!p) return null;
          return (
            <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
              <div className="circle">{circleInner(p)}</div>
            </div>
          );
        })()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---- sub-components ----

function AddPlayer({
  onAdd,
}: {
  onAdd: (p: Omit<Player, "id">) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [imgUrl, setImgUrl] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      number: number ? Number(number) : undefined,
      email: email.trim() || undefined,
      imgUrl: imgUrl.trim() || undefined,
    });
    setName("");
    setNumber("");
    setEmail("");
    setImgUrl("");
    setOpen(false);
  }

  return (
    <div className="add-player">
      <button
        className="btn btn-sm btn-primary"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "+ Add player"}
      </button>
      {open && (
        <div className="add-player-panel card">
          <input
            placeholder="Name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <div className="row">
            <input
              placeholder="No."
              type="number"
              min={1}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <input
            placeholder="Image URL (optional)"
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
          />
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={submit}>
              Add player
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A team line-up rendered as a table (one per side, below the pitch).
function TeamSheet({
  title,
  icon,
  formation,
  slots,
  playersById,
  averages,
  myPlayerId,
  onSelectPlayer,
}: {
  title: string;
  icon: string;
  formation: string;
  slots: Slot[];
  playersById: Map<string, Player>;
  averages: Map<string, { avg: number; count: number }>;
  myPlayerId?: string;
  onSelectPlayer: (playerId: string, x: number, y: number) => void;
}) {
  const filled = slots.filter((s) => s.playerId).length;
  return (
    <div className="card card-pad team-sheet">
      <div className="ts-head">
        <h3>
          {icon} {title}
        </h3>
        <span className="badge">
          {formation} · {filled}/{slots.length}
        </span>
      </div>
      <table className="ts-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>#</th>
            <th>Player</th>
            <th style={{ textAlign: "right" }}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const player = s.playerId ? playersById.get(s.playerId) : undefined;
            const avg = player ? averages.get(player.id) : undefined;
            return (
              <tr
                key={s.id}
                className={player ? "ts-row" : undefined}
                onClick={
                  player
                    ? (e) => onSelectPlayer(player.id, e.clientX, e.clientY)
                    : undefined
                }
                title={player ? "Tap to claim / rate this player" : undefined}
              >
                <td>
                  <span className="pos-tag">{s.role}</span>
                </td>
                <td className="ts-num">{player?.number ?? "—"}</td>
                <td>
                  {player ? (
                    <span className="ts-name">
                      {player.name}
                      {player.id === myPlayerId && (
                        <span className="ts-me">ME</span>
                      )}
                    </span>
                  ) : (
                    <span className="muted">— empty —</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {avg ? (
                    <span className="rating-score">⭐ {avg.avg}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// "Teams switch ends every N minutes" — a prominent, editable match rule.
function SwapEndsRule({
  minutes,
  onChange,
}: {
  minutes?: number;
  onChange: (m: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(minutes ?? 10));

  if (!minutes && !editing) {
    return (
      <button
        className="btn btn-sm btn-ghost"
        style={{ marginBottom: 16 }}
        onClick={() => {
          setValue("10");
          setEditing(true);
        }}
      >
        ⇄ Add “switch ends” rule
      </button>
    );
  }

  function commit() {
    const m = Math.round(Number(value));
    onChange(Number.isFinite(m) && m > 0 ? Math.min(m, 120) : undefined);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rule-pill editing">
        <span className="rule-arrows" aria-hidden>
          ⇄
        </span>
        <span>Switch ends every</span>
        <input
          type="number"
          min={1}
          max={120}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <span>min</span>
        <button className="btn btn-sm btn-primary" onClick={commit}>
          Save
        </button>
        {minutes != null && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => onChange(undefined)}
            title="Remove rule"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      className="rule-pill"
      title="Tap to change — teams switch ends on this schedule"
      onClick={() => {
        setValue(String(minutes));
        setEditing(true);
      }}
    >
      <span className="rule-arrows" aria-hidden>
        ⇄
      </span>
      <strong>Switch ends every {minutes} min</strong>
      <span className="rule-edit-hint">edit</span>
    </button>
  );
}

function ScoreEditor({
  game,
  onSave,
}: {
  game: Game;
  onSave: (score: { home: number; away: number }) => void;
}) {
  const [home, setHome] = useState(String(game.score?.home ?? ""));
  const [away, setAway] = useState(String(game.score?.away ?? ""));

  return (
    <>
      <div className="score-box">
        <div>
          <input
            type="number"
            min={0}
            value={home}
            onChange={(e) => setHome(e.target.value)}
          />
          <div className="score-team">Home</div>
        </div>
        <strong style={{ fontSize: "1.3rem" }}>:</strong>
        <div>
          <input
            type="number"
            min={0}
            value={away}
            onChange={(e) => setAway(e.target.value)}
          />
          <div className="score-team">Away</div>
        </div>
      </div>
      <button
        className="btn btn-sm btn-primary btn-block"
        style={{ marginTop: 12 }}
        onClick={() =>
          onSave({ home: Number(home) || 0, away: Number(away) || 0 })
        }
      >
        Save score
      </button>
    </>
  );
}
