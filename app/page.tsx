"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { formatDateTime } from "@/lib/format";
import type { Game } from "@/lib/types";

const SPORTS = [
  { key: "football", emoji: "⚽", name: "Football", available: true },
  { key: "basketball", emoji: "🏀", name: "Basketball", available: false },
  { key: "volleyball", emoji: "🏐", name: "Volleyball", available: false },
  { key: "hockey", emoji: "🏒", name: "Hockey", available: false },
];

const FEATURES = [
  {
    emoji: "🧩",
    title: "Drag & drop line-ups",
    text: "Build your formation on a real pitch, just like the pros.",
  },
  {
    emoji: "🙋",
    title: "Claim your spot",
    text: "Tap “That’s me” so everyone knows who’s playing where.",
  },
  {
    emoji: "⭐",
    title: "Rate the squad",
    text: "Score every player 1–10 after the final whistle.",
  },
  {
    emoji: "🔁",
    title: "Same crew, next week",
    text: "Recreate a match with the same people in one click.",
  },
];

export default function Home() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch("/api/games", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => active && setGames(d.games ?? []))
      .catch(() => active && setGames([]));
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <div className="container">
      <section className="hero">
        <span className="badge">⚽ Football planner · no sign-up needed</span>
        <h1>
          Plan your match.
          <br />
          <span className="accent">Build the perfect line-up.</span>
        </h1>
        <p className="lead">
          Set the format, drop players onto the pitch, share the link with your
          squad and rate everyone after the game. Create an account only when you
          want to keep your history.
        </p>
        <div className="hero-cta">
          <Link href="/games/new" className="btn btn-primary">
            Create a game
          </Link>
          {!user && (
            <Link href="/register" className="btn btn-ghost">
              Sign up to save history
            </Link>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Pick a sport</h2>
        </div>
        <div className="sport-grid">
          {SPORTS.map((s) =>
            s.available ? (
              <Link
                key={s.key}
                href="/games/new"
                className="sport-card active"
              >
                <span className="emoji">{s.emoji}</span>
                <strong>{s.name}</strong>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  Plan a match →
                </span>
              </Link>
            ) : (
              <div key={s.key} className="sport-card soon">
                <span className="emoji">{s.emoji}</span>
                <strong>{s.name}</strong>
                <span className="badge">Coming soon</span>
              </div>
            ),
          )}
        </div>
      </section>

      {user && (
        <section className="section">
          <div className="section-head">
            <h2>Your recent games</h2>
            <Link href="/calendar" className="btn btn-sm btn-ghost">
              View calendar
            </Link>
          </div>
          {games.length === 0 ? (
            <div className="card empty">
              No games yet — create your first one above.
            </div>
          ) : (
            <div className="game-list">
              {games.slice(0, 6).map((g) => (
                <Link key={g.id} href={`/games/${g.id}`} className="game-card">
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
              ))}
            </div>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Everything you need on match day</h2>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature">
              <span className="emoji">{f.emoji}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
