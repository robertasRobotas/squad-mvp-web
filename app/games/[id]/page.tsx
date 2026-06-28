import { notFound } from "next/navigation";
import { getGame } from "@/lib/store";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import GameView from "@/components/GameView";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  const user = await getCurrentUser();

  return (
    <GameView initialGame={game} currentUser={user ? toPublicUser(user) : null} />
  );
}
