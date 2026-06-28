"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { formationsForSize, TEAM_SIZES } from "@/lib/formations";
import type { Player } from "@/lib/types";

type NewPlayer = Omit<Player, "id">;

export default function NewGamePage() {
  return (
    <Suspense fallback={<div className="container page muted">Loading…</div>}>
      <NewGameForm />
    </Suspense>
  );
}

function NewGameForm() {
  const router = useRouter();
  const params = useSearchParams();
  const cloneFrom = params.get("clone");

  const [title, setTitle] = useState("");
  const [homeSize, setHomeSize] = useState(5);
  const [awaySize, setAwaySize] = useState(5);
  const [formationHome, setFormationHome] = useState(
    formationsForSize(5)[0],
  );
  const [formationAway, setFormationAway] = useState(
    formationsForSize(5)[0],
  );
  const [date, setDate] = useState("");
  const [address, setAddress] = useState("");
  const [players, setPlayers] = useState<NewPlayer[]>([]);
  const [draft, setDraft] = useState<NewPlayer>({ name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cloneName, setCloneName] = useState<string | null>(null);

  const homeFormations = useMemo(
    () => formationsForSize(homeSize),
    [homeSize],
  );
  const awayFormations = useMemo(
    () => formationsForSize(awaySize),
    [awaySize],
  );

  // Default kick-off: tomorrow evening. Set on the client to avoid SSR mismatch.
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
      )}:${pad(d.getMinutes())}`,
    );
  }, []);

  // If cloning, pull the source game's players + settings.
  useEffect(() => {
    if (!cloneFrom) return;
    fetch(`/api/games/${cloneFrom}`)
      .then((r) => r.json())
      .then((d) => {
        const g = d.game;
        if (!g) return;
        setCloneName(g.title || "previous game");
        setHomeSize(g.format.home);
        setAwaySize(g.format.away);
        setFormationHome(g.formationHome);
        setFormationAway(g.formationAway);
        setAddress(g.address || "");
        setTitle(g.title ? `${g.title} (rematch)` : "");
        setPlayers(
          g.players.map((p: Player) => ({
            name: p.name,
            number: p.number,
            imgUrl: p.imgUrl,
            email: p.email,
          })),
        );
      })
      .catch(() => {});
  }, [cloneFrom]);

  function changeHomeSize(size: number) {
    setHomeSize(size);
    setFormationHome(formationsForSize(size)[0]);
  }
  function changeAwaySize(size: number) {
    setAwaySize(size);
    setFormationAway(formationsForSize(size)[0]);
  }

  function addPlayer() {
    const name = draft.name.trim();
    if (!name) return;
    setPlayers((prev) => [...prev, { ...draft, name }]);
    setDraft({ name: "" });
  }

  function removePlayer(idx: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date) {
      setError("Please choose when the game is happening.");
      return;
    }
    setSubmitting(true);
    // include a player typed into the add-row but not yet "Added"
    const allPlayers = draft.name.trim()
      ? [...players, { ...draft, name: draft.name.trim() }]
      : players;
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          format: { home: homeSize, away: awaySize },
          formationHome,
          formationAway,
          date: new Date(date).toISOString(),
          address: address.trim(),
          players: allPlayers,
          clonePlayersFrom: cloneFrom ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create game.");
      router.push(`/games/${data.game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="container page">
      <Link href="/" className="back-link">
        ← Back
      </Link>
      <div className="page-head">
        <span className="badge">⚽ Football</span>
        <h1>Create a game</h1>
        <p className="muted" style={{ margin: 0 }}>
          {cloneName
            ? `Re-running “${cloneName}” with the same people. Tweak anything you like.`
            : "No account needed. You can add players and build the line-up next."}
        </p>
      </div>

      <form onSubmit={submit}>
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="field">
            <label htmlFor="title">Game name (optional)</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tuesday night kickabout"
            />
          </div>

          <label>Format — how many vs how many</label>
          <div className="vs" style={{ marginBottom: 16 }}>
            <select
              aria-label="Home team size"
              value={homeSize}
              onChange={(e) => changeHomeSize(Number(e.target.value))}
            >
              {TEAM_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="vs-label">vs</span>
            <select
              aria-label="Away team size"
              value={awaySize}
              onChange={(e) => changeAwaySize(Number(e.target.value))}
            >
              {TEAM_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="fh">Home line-up</label>
              <select
                id="fh"
                value={formationHome}
                onChange={(e) => setFormationHome(e.target.value)}
              >
                {homeFormations.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fa">Away line-up</label>
              <select
                id="fa"
                value={formationAway}
                onChange={(e) => setFormationAway(e.target.value)}
              >
                {awayFormations.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="date">When is it happening?</label>
              <input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="addr">Event address</label>
              <input
                id="addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Riverside 3G Pitch, Main St 10"
              />
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: "1.15rem" }}>Players</h2>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Add the people who are playing. You can also add more later and drag
            them onto the pitch.
          </p>

          <div className="player-add">
            <div>
              <label htmlFor="pn">Name</label>
              <input
                id="pn"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPlayer();
                  }
                }}
                placeholder="Alex"
              />
            </div>
            <div>
              <label htmlFor="pnum">Number</label>
              <input
                id="pnum"
                type="number"
                min={1}
                value={draft.number ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    number: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="10"
              />
            </div>
            <div>
              <label htmlFor="pemail">Email</label>
              <input
                id="pemail"
                type="email"
                value={draft.email ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, email: e.target.value || undefined })
                }
                placeholder="alex@email.com"
              />
            </div>
            <div>
              <label htmlFor="pimg">Image URL</label>
              <input
                id="pimg"
                value={draft.imgUrl ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, imgUrl: e.target.value || undefined })
                }
                placeholder="https://…"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addPlayer}
              disabled={!draft.name.trim()}
            >
              Add
            </button>
          </div>

          {players.length > 0 && (
            <div className="player-rows">
              {players.map((p, i) => (
                <div key={i} className="player-pill">
                  {p.imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="player-avatar" src={p.imgUrl} alt={p.name} />
                  ) : (
                    <span className="pp-num">{p.number ?? "?"}</span>
                  )}
                  <span className="pp-name">{p.name}</span>
                  {p.email && <span className="pp-meta">· {p.email}</span>}
                  <span className="pp-spacer" />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removePlayer(i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="error" style={{ marginBottom: 12 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create game & open line-up"}
        </button>
      </form>
    </div>
  );
}
