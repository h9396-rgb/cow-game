import { useState, useEffect, useRef } from "react";

interface ScoreModalProps {
  score: number;
  isHighScore: boolean;
  isVictory?: boolean;
  onSubmit: (name: string) => void;
  onSkip: () => void;
}

export function ScoreModal({ score, isHighScore, isVictory, onSubmit, onSkip }: ScoreModalProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    onSubmit(trimmed.slice(0, 12));
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-3xl p-8 shadow-2xl w-80 mx-4 ring-2 ring-amber-300/50">
        {isVictory ? (
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">축하</div>
            <h2 className="text-2xl font-black text-amber-700">100점 달성!</h2>
            <p className="text-sm font-semibold text-amber-600 mt-1">깨뜨린 사람 목록에 등록하세요</p>
          </div>
        ) : isHighScore ? (
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">최고</div>
            <h2 className="text-2xl font-black text-amber-700">최고 기록 갱신!</h2>
          </div>
        ) : (
          <div className="text-center mb-4">
            <h2 className="text-2xl font-black text-amber-800">게임 오버</h2>
          </div>
        )}

        <div className="text-center mb-6">
          <span className="text-5xl font-black text-amber-600 tabular-nums">
            {score}
          </span>
          <span className="text-lg text-amber-700 ml-1">점</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-amber-800 mb-2">
            이름을 입력하세요
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            placeholder="최대 12자"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-xl border-2 border-amber-300 bg-white text-amber-900 font-bold text-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all"
          />
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-lg shadow-lg hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "저장 중..." : "점수 등록"}
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={submitting}
              className="px-5 py-3 rounded-xl bg-gray-200 text-gray-600 font-bold hover:bg-gray-300 active:scale-95 transition-all disabled:opacity-40"
            >
              건너뛰기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
