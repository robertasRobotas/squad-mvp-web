"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { formatDateTime } from "@/lib/format";
import type { Game } from "@/lib/types";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CalendarPage() {
  const { user, loading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [nowTs, setNowTs] = useState(0);

  // Read the clock once on mount (an external system) — keeps render pure.
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ y: now.getFullYear(), m: now.getMonth() });
    setTodayKey(dayKey(now));
    setNowTs(now.getTime());
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/games", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .catch(() => setGames([]));
  }, [user]);

  const byDay = useMemo(() => {
    const m = new Map<string, Game[]>();
    games.forEach((g) => {
      const key = dayKey(new Date(g.date));
      const arr = m.get(key) ?? [];
      arr.push(g);
      m.set(key, arr);
    });
    return m;
  }, [games]);

  if (loading) {
    return <div className="container page muted">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <h1>Your game calendar</h1>
          <p className="muted">
            Log in to see every match you’ve created or played in.
          </p>
          <Link href="/login?next=/calendar" className="btn btn-primary">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (!view) return null;

  // build the month grid (Monday-first)
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: { date: Date; out: boolean }[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push({ date: new Date(view.y, view.m, i - lead + 1), out: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(view.y, view.m, d), out: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      out: true,
    });
  }

  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shift(delta: number) {
    setView((v) => {
      if (!v) return v;
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const upcoming = [...games]
    .filter((g) => new Date(g.date).getTime() >= nowTs)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = [...games]
    .filter((g) => new Date(g.date).getTime() < nowTs)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="container page">
      <Link href="/" className="back-link">
        ← Home
      </Link>
      <div className="cal-head">
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>{monthLabel}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => shift(-1)}>
            ←
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const now = new Date();
              setView({ y: now.getFullYear(), m: now.getMonth() });
            }}
          >
            Today
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => shift(1)}>
            →
          </button>
        </div>
      </div>

      <div className="cal-grid" style={{ marginBottom: 8 }}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map(({ date, out }, i) => {
          const key = dayKey(date);
          const dayGames = byDay.get(key) ?? [];
          return (
            <div
              key={i}
              className={`cal-cell${out ? " out" : ""}${
                key === todayKey ? " today" : ""
              }`}
            >
              <div className="cal-date">{date.getDate()}</div>
              {dayGames.map((g) => (
                <Link
                  key={g.id}
                  href={`/games/${g.id}`}
                  className="cal-event"
                  title={g.title || "Football match"}
                >
                  {g.title || `${g.format.home}v${g.format.away}`}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {upcoming.length > 0 && (
        <section className="section" style={{ paddingBottom: 16 }}>
          <div className="section-head">
            <h2>Upcoming</h2>
          </div>
          <div className="game-list">
            {upcoming.map((g) => (
              <GameCardLink key={g.id} game={g} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Past games</h2>
        </div>
        {past.length === 0 ? (
          <div className="card empty">No past games yet.</div>
        ) : (
          <div className="game-list">
            {past.map((g) => (
              <GameCardLink key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GameCardLink({ game: g }: { game: Game }) {
  return (
    <Link href={`/games/${g.id}`} className="game-card">
      <div className="gc-top">
        <span className="badge">
          {g.format.home}v{g.format.away}
        </span>
        {g.score && (
          <span className="badge">
            {g.score.home}–{g.score.away}
          </span>
        )}
      </div>
      <h3>{g.title || "Football match"}</h3>
      <div className="gc-meta">{formatDateTime(g.date)}</div>
      {g.address && <div className="gc-meta">📍 {g.address}</div>}
    </Link>
  );
}
