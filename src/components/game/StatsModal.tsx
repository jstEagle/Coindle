import { Modal } from "@/components/game/Modal";
import { formatSignedPercent } from "@/lib/format";
import type { Stats } from "@/lib/gameStorage";

export function StatsModal({
  stats,
  onClose,
}: {
  stats: Stats;
  onClose: () => void;
}) {
  const winPercent =
    stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <Modal title="Statistics" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat label="Played" value={stats.played.toString()} />
        <Stat label="Win %" value={`${winPercent}%`} />
        <Stat label="Streak" value={stats.currentStreak.toString()} />
        <Stat label="Best streak" value={stats.maxStreak.toString()} />
      </div>

      <div className="mt-5 rounded-xl border border-border bg-elevated/50 p-3 text-center">
        <p className="coindle-tabular text-2xl font-semibold text-text">
          {stats.played > 0 ? formatSignedPercent(stats.bestReturnPercent) : "—"}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-text-faint">
          Best single-run return
        </p>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="coindle-tabular text-xl font-semibold text-text">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
