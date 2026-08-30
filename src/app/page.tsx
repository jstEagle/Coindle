import { GameShell } from "@/components/game/GameShell";
import { getDailyPuzzle } from "@/lib/puzzles";

export const dynamic = "force-dynamic";

export default function Home() {
  const puzzle = getDailyPuzzle();

  return (
    <div className="flex flex-1 flex-col">
      <GameShell puzzle={puzzle} />
    </div>
  );
}
