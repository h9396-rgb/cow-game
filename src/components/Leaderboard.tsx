import { useEffect, useState } from "react";
import { supabase, type ScoreRow } from "@/lib/supabase";

export function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchScores = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("scores")
        .select("id, player_name, score, created_at")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(10);

      if (!cancelled) {
        if (!error && data) {
          setScores(data as ScoreRow[]);
        }
        setLoading(false);
      }
    };

    fetchScores();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleReset = async () => {
    if (resetting) return;
    const confirmed = window.confirm("랭킹 TOP 10과 모든 기록을 초기화할까요?");
    if (!confirmed) return;

    setResetting(true);
    setResetError(false);
    const { error } = await supabase.from("scores").delete().not("id", "is", null);

    if (error) {
      setResetError(true);
    } else {
      setScores([]);
    }
    setResetting(false);
  };

  return (
    <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 w-56 shadow-lg ring-1 ring-white/20">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-white font-black text-lg flex items-center gap-2">
          <span className="text-yellow-300">TOP</span> 랭킹 10
        </h2>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="text-[11px] font-bold text-white/70 hover:text-white underline underline-offset-2 transition-colors disabled:opacity-40"
        >
          {resetting ? "초기화 중" : "초기화"}
        </button>
      </div>

      <p className="text-white/60 text-xs mb-3">100점을 깬 사람들의 기록</p>

      {loading ? (
        <div className="text-white/60 text-sm py-4 text-center">불러오는 중...</div>
      ) : scores.length === 0 ? (
        <div className="text-white/50 text-sm py-4 text-center">
          아직 기록이 없어요
        </div>
      ) : (
        <ol className="space-y-1.5">
          {scores.map((row, i) => (
            <li
              key={`${row.id}-${row.created_at}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                i === 0
                  ? "bg-yellow-400/30 text-yellow-100 font-bold"
                  : i === 1
                  ? "bg-gray-300/20 text-white font-semibold"
                  : i === 2
                  ? "bg-orange-400/20 text-orange-100 font-semibold"
                  : "text-white/80"
              }`}
            >
              <span className="w-6 text-center font-black tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 truncate font-medium">
                {row.player_name}
              </span>
              <span className="tabular-nums font-bold text-right">
                {row.score}
              </span>
            </li>
          ))}
        </ol>
      )}

      {resetError && (
        <p className="text-red-200 text-xs text-center mt-3">초기화하지 못했어요</p>
      )}
    </div>
  );
}
