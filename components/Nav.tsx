"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Nav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="brand-dot">⚽</span>
          <span>Squad</span>
        </Link>
        <nav className="nav-links">
          <Link href="/games/new" className="btn btn-sm btn-ghost">
            New game
          </Link>
          {!loading && user ? (
            <>
              <Link href="/calendar" className="btn btn-sm btn-ghost">
                My games
              </Link>
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleLogout}
                title={user.email}
              >
                Log out
              </button>
              <span className="avatar" title={user.name}>
                {user.imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.imgUrl}
                    alt={user.name}
                    width={34}
                    height={34}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  initials(user.name)
                )}
              </span>
            </>
          ) : (
            !loading && (
              <Link href="/login" className="btn btn-sm btn-primary">
                Log in
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
