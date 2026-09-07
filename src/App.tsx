import { useRef, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Leaderboard } from "@/components/Leaderboard";
import { ScoreModal } from "@/components/ScoreModal";

type GameState = "ready" | "playing" | "gameover" | "entering_score" | "victory";

type ItemType = "lightning1" | "lightning3" | "lightning5" | "poop" | "reset";

interface Item {
  x: number;
  y: number;
  size: number;
  type: ItemType;
  bobOffset: number;
  collected: boolean;
  value: number;
}

type ObstacleType = "bottom" | "middle" | "top" | "tall";

interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed: boolean;
  rotation: number;
  rotationSpeed: number;
  bobOffset: number;
  variant: number;
  type: ObstacleType;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
}

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const GROUND_Y = 420;
const GRAVITY = 0.7;
const JUMP_POWER = -13;
const DOUBLE_JUMP_POWER = -11;
const TRIPLE_JUMP_POWER = -14;
const TRIPLE_JUMP_COOLDOWN = 15000; // 15 seconds in ms
const VICTORY_SCORE = 100;
const ITEM_BASE_SPAWN_INTERVAL = 1200;
const PLAYER_X = 140;
const PLAYER_SIZE = 48;
const BASE_SPEED = 5;
const BASE_SPAWN_INTERVAL = 1700;

// Time-of-day phases based on score
// 0-9: morning, 10-19: day, 20-29: sunset, 30-39: dusk, 40+: night
type Phase = "morning" | "day" | "sunset" | "dusk" | "night";

function getPhase(score: number): Phase {
  if (score < 10) return "morning";
  if (score < 20) return "day";
  if (score < 30) return "sunset";
  if (score < 40) return "dusk";
  return "night";
}

const PHASE_COLORS: Record<Phase, {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  hillFar: string;
  hillNear: string;
  ground: string;
  grass: string;
  grassDark: string;
  cloud: string;
  groundLine: string;
}> = {
  morning: {
    skyTop: "#FFB088",
    skyMid: "#FFD9B0",
    skyBottom: "#FFF0DC",
    hillFar: "#b8d8a8",
    hillNear: "#88c078",
    ground: "#8B6B3a",
    grass: "#6aa83a",
    grassDark: "#4a8a2a",
    cloud: "rgba(255, 255, 255, 0.85)",
    groundLine: "rgba(139, 107, 58, 0.4)",
  },
  day: {
    skyTop: "#87CEEB",
    skyMid: "#B0E0E6",
    skyBottom: "#E0F4F8",
    hillFar: "#7ab87a",
    hillNear: "#5a9a5a",
    ground: "#8B6B3a",
    grass: "#5a9a3a",
    grassDark: "#4a8a2a",
    cloud: "rgba(255, 255, 255, 0.85)",
    groundLine: "rgba(139, 107, 58, 0.4)",
  },
  sunset: {
    skyTop: "#FF6B35",
    skyMid: "#FF9E5C",
    skyBottom: "#FFD4A0",
    hillFar: "#c08868",
    hillNear: "#9a6a4a",
    ground: "#7a5a3a",
    grass: "#8a7a3a",
    grassDark: "#6a5a2a",
    cloud: "rgba(255, 220, 180, 0.8)",
    groundLine: "rgba(122, 90, 58, 0.4)",
  },
  dusk: {
    skyTop: "#4a3a6a",
    skyMid: "#7a5a7a",
    skyBottom: "#C0808a",
    hillFar: "#5a4a6a",
    hillNear: "#4a3a5a",
    ground: "#5a4a3a",
    grass: "#5a5a3a",
    grassDark: "#3a3a2a",
    cloud: "rgba(200, 180, 200, 0.5)",
    groundLine: "rgba(90, 74, 58, 0.4)",
  },
  night: {
    skyTop: "#0a0a2a",
    skyMid: "#1a1a4a",
    skyBottom: "#2a2a5a",
    hillFar: "#1a2a1a",
    hillNear: "#0a1a0a",
    ground: "#2a2a3a",
    grass: "#2a3a1a",
    grassDark: "#1a2a0a",
    cloud: "rgba(180, 180, 220, 0.3)",
    groundLine: "rgba(42, 42, 58, 0.4)",
  },
};

// Lerp between two hex colors
function lerpColor(a: string, b: string, t: number): string {
  const parse = (c: string) => {
    if (c.startsWith("rgba")) {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      }
    }
    const hex = c.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      1,
    ];
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  const al = ca[3] + (cb[3] - ca[3]) * t;
  if (al < 1) {
    return `rgba(${r}, ${g}, ${bl}, ${al.toFixed(2)})`;
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function getPhaseColors(score: number) {
  const phase = getPhase(score);
  const phases: Phase[] = ["morning", "day", "sunset", "dusk", "night"];
  const idx = phases.indexOf(phase);
  const current = PHASE_COLORS[phase];
  const next = PHASE_COLORS[phases[Math.min(idx + 1, phases.length - 1)]];
  const phaseStart = idx * 10;
  const phaseEnd = phaseStart + 10;
  const t = Math.max(0, Math.min(1, (score - phaseStart) / (phaseEnd - phaseStart)));

  return {
    skyTop: lerpColor(current.skyTop, next.skyTop, t),
    skyMid: lerpColor(current.skyMid, next.skyMid, t),
    skyBottom: lerpColor(current.skyBottom, next.skyBottom, t),
    hillFar: lerpColor(current.hillFar, next.hillFar, t),
    hillNear: lerpColor(current.hillNear, next.hillNear, t),
    ground: lerpColor(current.ground, next.ground, t),
    grass: lerpColor(current.grass, next.grass, t),
    grassDark: lerpColor(current.grassDark, next.grassDark, t),
    cloud: lerpColor(current.cloud, next.cloud, t),
    groundLine: lerpColor(current.groundLine, next.groundLine, t),
    phase,
  };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("ready");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const gameStateRef = useRef<GameState>("ready");
  const scoreRef = useRef(0);
  const animationRef = useRef<number>(0);

  // Game state refs
  const playerYRef = useRef(GROUND_Y - PLAYER_SIZE);
  const playerVYRef = useRef(0);
  const jumpsUsedRef = useRef(0);
  const isGroundedRef = useRef(true);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const starsRef = useRef<Star[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const spawnTimerRef = useRef(0);
  const spawnIntervalRef = useRef(BASE_SPAWN_INTERVAL);
  const lastTimeRef = useRef(0);
  const groundOffsetRef = useRef(0);
  const playerAnimFrameRef = useRef(0);
  const squashRef = useRef(1);
  const stretchRef = useRef(1);
  const flashRef = useRef(0);
  const scoreRefLocal = useRef(0);
  const tripleJumpReadyAtRef = useRef(0); // timestamp when triple jump is ready
  const tripleJumpCooldownRef = useRef(0); // 0..1 fraction ready
  const itemsRef = useRef<Item[]>([]);
  const itemSpawnTimerRef = useRef(0);
  const lastObstacleRightRef = useRef(0);
  const lastItemRightRef = useRef(0);
  const victoryAnimRef = useRef(0);
  const confettiRef = useRef<Particle[]>([]);

  // Initialize clouds and stars
  useEffect(() => {
    cloudsRef.current = Array.from({ length: 5 }, (_, i) => ({
      x: (i / 5) * GAME_WIDTH + Math.random() * 100,
      y: 40 + Math.random() * 120,
      size: 30 + Math.random() * 40,
      speed: 0.3 + Math.random() * 0.4,
    }));
    starsRef.current = Array.from({ length: 40 }, () => ({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * (GROUND_Y - 50),
      size: 0.5 + Math.random() * 1.5,
      twinkle: Math.random() * Math.PI * 2,
    }));
  }, []);

  const resetGame = useCallback(() => {
    playerYRef.current = GROUND_Y - PLAYER_SIZE;
    playerVYRef.current = 0;
    jumpsUsedRef.current = 0;
    isGroundedRef.current = true;
    obstaclesRef.current = [];
    particlesRef.current = [];
    speedRef.current = BASE_SPEED;
    spawnTimerRef.current = 0;
    spawnIntervalRef.current = BASE_SPAWN_INTERVAL;
    scoreRef.current = 0;
    scoreRefLocal.current = 0;
    setScore(0);
    flashRef.current = 0;
    squashRef.current = 1;
    stretchRef.current = 1;
    setShowScoreModal(false);
    setScoreSaved(false);
    tripleJumpReadyAtRef.current = 0;
    tripleJumpCooldownRef.current = 1;
    itemsRef.current = [];
    itemSpawnTimerRef.current = 0;
    lastObstacleRightRef.current = 0;
    lastItemRightRef.current = 0;
    victoryAnimRef.current = 0;
    confettiRef.current = [];
  }, []);

  const startGame = useCallback(() => {
    resetGame();
    gameStateRef.current = "playing";
    setGameState("playing");
    lastTimeRef.current = performance.now();
  }, [resetGame]);

  const jump = useCallback(() => {
    if (gameStateRef.current !== "playing") return;
    const now = performance.now();

    // Triple jump (3rd jump) — only if 1st & 2nd used and cooldown is ready
    if (jumpsUsedRef.current === 2 && now >= tripleJumpReadyAtRef.current) {
      playerVYRef.current = TRIPLE_JUMP_POWER;
      jumpsUsedRef.current = 3;
      isGroundedRef.current = false;
      squashRef.current = 0.6;
      stretchRef.current = 1.4;
      // Big burst of particles for triple jump
      for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20;
        particlesRef.current.push({
          x: PLAYER_X + PLAYER_SIZE / 2,
          y: playerYRef.current + PLAYER_SIZE,
          vx: Math.cos(angle) * 5,
          vy: Math.sin(angle) * 5 + 1,
          life: 40,
          maxLife: 40,
          color: i % 2 === 0 ? "#fbbf24" : "#f97316",
          size: 4 + Math.random() * 4,
        });
      }
      // Start cooldown
      tripleJumpReadyAtRef.current = now + TRIPLE_JUMP_COOLDOWN;
      return;
    }

    // Normal 1st & 2nd jump
    if (jumpsUsedRef.current < 2) {
      if (jumpsUsedRef.current === 0) {
        playerVYRef.current = JUMP_POWER;
      } else {
        playerVYRef.current = DOUBLE_JUMP_POWER;
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          particlesRef.current.push({
            x: PLAYER_X + PLAYER_SIZE / 2,
            y: playerYRef.current + PLAYER_SIZE,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3 + 1,
            life: 30,
            maxLife: 30,
            color: "#fbbf24",
            size: 3 + Math.random() * 3,
          });
        }
      }
      jumpsUsedRef.current++;
      isGroundedRef.current = false;
      squashRef.current = 0.7;
      stretchRef.current = 1.3;
    }
  }, []);

  const handleGameOver = useCallback(async () => {
    const finalScore = scoreRef.current;
    gameStateRef.current = "entering_score";
    setGameState("entering_score");

    if (finalScore > highScore) {
      setHighScore(finalScore);
    }
    setShowScoreModal(true);
  }, [highScore]);

  const handleScoreSubmit = useCallback(
    async (name: string) => {
      const finalScore = scoreRef.current;
      const { error } = await supabase
        .from("scores")
        .insert({ player_name: name, score: finalScore });

      if (!error) {
        setScoreSaved(true);
        setLeaderboardKey((k) => k + 1);
      }
      setShowScoreModal(false);
      gameStateRef.current = "gameover";
      setGameState("gameover");
    },
    []
  );

  const handleScoreSkip = useCallback(() => {
    setShowScoreModal(false);
    gameStateRef.current = "gameover";
    setGameState("gameover");
  }, []);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (gameStateRef.current === "ready" || gameStateRef.current === "gameover" || gameStateRef.current === "victory") {
          startGame();
        } else if (gameStateRef.current === "playing") {
          jump();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jump, startGame]);

  // Draw cow head obstacle — refined design with gradients
  const drawCowHead = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rotation: number,
    time: number,
    bobOffset: number,
    variant: number
  ) => {
    ctx.save();
    const bobY = Math.sin(time * 0.003 + bobOffset) * 8;
    ctx.translate(x + size / 2, y + size / 2 + bobY);
    ctx.rotate(rotation);
    const s = size / 100;

    // Shadow
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 58, 42, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(s, s);

    // Variant-specific palette
    const variants = [
      { horn: "#e8d4b0", hornStroke: "#b89868", hornTip: "#a08050", head: "#faf6f0", headStroke: "#d8d0c4", headShadow: "#e8e0d4", patch: "#8b6b4a", patchStroke: "#6a4a2a", snout: "#f0d8d0", snoutStroke: "#c8a8a0", nostril: "#7a5040", eyeBg: "#fff", pupil: "#1a1a1a", brow: "#5a3a2a", ear: "#e8e0d4", earStroke: "#c0b8a8" },
      { horn: "#d8d8e0", hornStroke: "#9090a0", hornTip: "#707078", head: "#ffffff", headStroke: "#c0c0c8", headShadow: "#e8e8f0", patch: "#2a2a2a", patchStroke: "#1a1a1a", snout: "#e0e0e8", snoutStroke: "#a0a0a8", nostril: "#404048", eyeBg: "#fff", pupil: "#1a1a1a", brow: "#2a2a2a", ear: "#e8e8f0", earStroke: "#b0b0b8" },
      { horn: "#d4a878", hornStroke: "#a07840", hornTip: "#805820", head: "#b8804a", headStroke: "#8a5830", headShadow: "#a06838", patch: "#6a4020", patchStroke: "#4a2810", snout: "#d4a880", snoutStroke: "#a87850", nostril: "#5a3020", eyeBg: "#fff", pupil: "#1a1a1a", brow: "#3a2010", ear: "#a06838", earStroke: "#7a4820" },
      { horn: "#e8c8a0", hornStroke: "#b08858", hornTip: "#906830", head: "#c8704a", headStroke: "#8a4030", headShadow: "#a85030", patch: "#8a3020", patchStroke: "#6a1a10", snout: "#d8a890", snoutStroke: "#a87060", nostril: "#5a2010", eyeBg: "#fff", pupil: "#1a1a1a", brow: "#4a1a0a", ear: "#a85030", earStroke: "#7a3010" },
      { horn: "#c0c0c8", hornStroke: "#888890", hornTip: "#606068", head: "#d0d0d8", headStroke: "#a0a0a8", headShadow: "#b8b8c0", patch: "#707078", patchStroke: "#505058", snout: "#b8b8c0", snoutStroke: "#888890", nostril: "#404048", eyeBg: "#fff", pupil: "#1a1a1a", brow: "#404048", ear: "#b8b8c0", earStroke: "#909098" },
    ];
    const v = variants[variant % variants.length];

    // Ears (behind head)
    ctx.fillStyle = v.ear;
    ctx.strokeStyle = v.earStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-34, -2, 14, 9, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(34, -2, 14, 9, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner ear
    ctx.fillStyle = v.snout;
    ctx.beginPath();
    ctx.ellipse(-34, 0, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(34, 0, 8, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Horns with gradient
    const hornGrad = ctx.createLinearGradient(0, -55, 0, -20);
    hornGrad.addColorStop(0, v.hornTip);
    hornGrad.addColorStop(0.5, v.horn);
    hornGrad.addColorStop(1, v.hornStroke);
    ctx.fillStyle = hornGrad;
    ctx.strokeStyle = v.hornStroke;
    ctx.lineWidth = 2;
    if (variant === 3) {
      // Highland cow — long curved horns
      ctx.beginPath();
      ctx.moveTo(-26, -20);
      ctx.quadraticCurveTo(-62, -36, -58, -60);
      ctx.quadraticCurveTo(-48, -52, -22, -28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(26, -20);
      ctx.quadraticCurveTo(62, -36, 58, -60);
      ctx.quadraticCurveTo(48, -52, 22, -28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-28, -22);
      ctx.quadraticCurveTo(-50, -40, -44, -54);
      ctx.quadraticCurveTo(-36, -46, -26, -30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, -22);
      ctx.quadraticCurveTo(50, -40, 44, -54);
      ctx.quadraticCurveTo(36, -46, 26, -30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head with gradient
    const headGrad = ctx.createRadialGradient(-8, -8, 5, 0, 5, 42);
    headGrad.addColorStop(0, v.head);
    headGrad.addColorStop(1, v.headShadow);
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = v.headStroke;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 5, 36, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Patches — organic shapes per variant
    ctx.fillStyle = v.patch;
    ctx.strokeStyle = v.patchStroke;
    ctx.lineWidth = 1.5;
    if (variant === 0) {
      ctx.beginPath();
      ctx.moveTo(-22, -15);
      ctx.bezierCurveTo(-30, -5, -25, 15, -10, 18);
      ctx.bezierCurveTo(-5, 10, -15, -5, -22, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(15, 5);
      ctx.bezierCurveTo(10, 15, 20, 20, 28, 10);
      ctx.bezierCurveTo(25, 0, 20, 0, 15, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (variant === 1) {
      ctx.beginPath();
      ctx.moveTo(-20, -15);
      ctx.bezierCurveTo(-28, 5, -15, 25, -5, 15);
      ctx.bezierCurveTo(-2, 0, -10, -10, -20, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(16, -8, 10, 14, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (variant === 2) {
      ctx.beginPath();
      ctx.ellipse(0, -3, 22, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (variant === 3) {
      // Highland — shaggy fur patches
      for (let i = 0; i < 4; i++) {
        const px = -18 + i * 12;
        const py = -18 + Math.sin(i) * 10;
        ctx.beginPath();
        ctx.ellipse(px, py, 14, 10, i * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(-5, 18, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(-10, -10, 12, 16, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(14, 10, 14, 10, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Snout with gradient
    const snoutGrad = ctx.createRadialGradient(0, 25, 3, 0, 28, 22);
    snoutGrad.addColorStop(0, v.snout);
    snoutGrad.addColorStop(1, v.snoutStroke);
    ctx.fillStyle = snoutGrad;
    ctx.strokeStyle = v.snoutStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 28, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = v.nostril;
    ctx.beginPath();
    ctx.ellipse(-7, 27, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, 27, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes with subtle gradient
    ctx.fillStyle = v.eyeBg;
    ctx.beginPath();
    ctx.arc(-13, -5, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(13, -5, 7.5, 0, Math.PI * 2);
    ctx.fill();
    // Eye outline
    ctx.strokeStyle = v.headShadow;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-13, -5, 7.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13, -5, 7.5, 0, Math.PI * 2);
    ctx.stroke();

    // Pupils with highlight
    ctx.fillStyle = v.pupil;
    ctx.beginPath();
    ctx.arc(-11, -3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(15, -3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Eye highlights
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(-12, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Angry eyebrows — thicker, tapered
    ctx.strokeStyle = v.brow;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-22, -16);
    ctx.lineTo(-7, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, -16);
    ctx.lineTo(7, -10);
    ctx.stroke();

    ctx.restore();
  };

  // Draw player character
  const drawPlayer = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    isGrounded: boolean,
    animFrame: number,
    squash: number,
    stretch: number
  ) => {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(squash, stretch);

    const s = size / 48;

    // Shadow
    ctx.save();
    ctx.scale(s, s);
    if (isGrounded) {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(0, 30, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.scale(s, s);

    // Legs
    const legSwing = isGrounded ? Math.sin(animFrame * 0.3) * 8 : 0;
    ctx.fillStyle = "#3a5a3a";
    ctx.fillRect(-12, 14, 8, 16 + legSwing);
    ctx.fillRect(4, 14, 8, 16 - legSwing);

    // Shoes
    ctx.fillStyle = "#1a2a1a";
    ctx.fillRect(-14, 28 + legSwing, 12, 5);
    ctx.fillRect(2, 28 - legSwing, 12, 5);

    // Body
    ctx.fillStyle = "#4a8a3a";
    ctx.beginPath();
    ctx.roundRect(-16, -6, 32, 24, 6);
    ctx.fill();

    // Overall straps
    ctx.strokeStyle = "#3a6a2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(-8, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -6);
    ctx.lineTo(8, 10);
    ctx.stroke();

    // Arms
    const armSwing = isGrounded ? Math.sin(animFrame * 0.3) * 6 : -8;
    ctx.fillStyle = "#d4a878";
    ctx.beginPath();
    ctx.roundRect(-20, -2 + armSwing, 7, 14, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(13, -2 - armSwing, 7, 14, 3);
    ctx.fill();

    // Head
    ctx.fillStyle = "#d4a878";
    ctx.beginPath();
    ctx.arc(0, -16, 13, 0, Math.PI * 2);
    ctx.fill();

    // Straw hat
    ctx.fillStyle = "#e8c860";
    ctx.beginPath();
    ctx.ellipse(0, -20, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4a840";
    ctx.beginPath();
    ctx.roundRect(-10, -28, 20, 10, 4);
    ctx.fill();
    ctx.fillStyle = "#8a5a2a";
    ctx.fillRect(-10, -22, 20, 3);

    // Eyes
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(-4, -16, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -16, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.strokeStyle = "#5a3a2a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, -13, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Cheeks
    ctx.fillStyle = "rgba(232, 120, 100, 0.4)";
    ctx.beginPath();
    ctx.arc(-8, -13, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -13, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Draw background with time-of-day
  const drawBackground = (
    ctx: CanvasRenderingContext2D,
    time: number,
    groundOffset: number,
    currentScore: number
  ) => {
    const colors = getPhaseColors(currentScore);
    const phase = colors.phase;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, colors.skyTop);
    skyGrad.addColorStop(0.5, colors.skyMid);
    skyGrad.addColorStop(1, colors.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, GAME_WIDTH, GROUND_Y);

    // Stars (visible at dusk/night)
    const starAlpha = phase === "night" ? 1 : phase === "dusk" ? 0.5 : 0;
    if (starAlpha > 0) {
      starsRef.current.forEach((star) => {
        const twinkle = Math.sin(time * 0.002 + star.twinkle) * 0.3 + 0.7;
        ctx.save();
        ctx.globalAlpha = starAlpha * twinkle;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Sun / Moon
    ctx.save();
    if (phase === "night") {
      // Moon
      ctx.fillStyle = "rgba(240, 240, 220, 0.95)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 80, 30, 0, Math.PI * 2);
      ctx.fill();
      // Crater
      ctx.fillStyle = "rgba(200, 200, 180, 0.5)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 108, 75, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 92, 85, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 90, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (phase === "dusk") {
      // Fading sun
      ctx.fillStyle = "rgba(255, 150, 80, 0.7)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 120, 30, 0, Math.PI * 2);
      ctx.fill();
    } else if (phase === "sunset") {
      // Setting sun
      ctx.fillStyle = "rgba(255, 180, 80, 0.9)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 160, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 220, 150, 0.3)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 160, 60, 0, Math.PI * 2);
      ctx.fill();
    } else if (phase === "morning") {
      // Rising sun
      ctx.fillStyle = "rgba(255, 200, 100, 0.9)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 100, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 230, 180, 0.3)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 100, 55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Day sun
      ctx.fillStyle = "rgba(255, 220, 100, 0.9)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 80, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 240, 180, 0.3)";
      ctx.beginPath();
      ctx.arc(GAME_WIDTH - 100, 80, 55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Clouds
    cloudsRef.current.forEach((cloud) => {
      cloud.x -= cloud.speed;
      if (cloud.x < -cloud.size * 2) {
        cloud.x = GAME_WIDTH + cloud.size;
        cloud.y = 30 + Math.random() * 120;
        cloud.size = 30 + Math.random() * 40;
      }
      ctx.save();
      ctx.fillStyle = colors.cloud;
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size * 0.5, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.4, cloud.y - cloud.size * 0.1, cloud.size * 0.4, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.7, cloud.y + cloud.size * 0.05, cloud.size * 0.35, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.3, cloud.y + cloud.size * 0.15, cloud.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Distant hills
    ctx.fillStyle = colors.hillFar;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let i = 0; i <= GAME_WIDTH; i += 50) {
      ctx.lineTo(i, GROUND_Y - 40 - Math.sin(i * 0.01 + time * 0.0001) * 20);
    }
    ctx.lineTo(GAME_WIDTH, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Closer hills
    ctx.fillStyle = colors.hillNear;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let i = 0; i <= GAME_WIDTH; i += 40) {
      ctx.lineTo(i, GROUND_Y - 20 - Math.sin(i * 0.015 + 2) * 12);
    }
    ctx.lineTo(GAME_WIDTH, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Ground
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);

    // Grass top
    ctx.fillStyle = colors.grass;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 12);

    // Grass texture (moving)
    ctx.fillStyle = colors.grassDark;
    for (let i = 0; i < GAME_WIDTH; i += 20) {
      const gx = i - (groundOffset % 20);
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y);
      ctx.lineTo(gx + 3, GROUND_Y - 6);
      ctx.lineTo(gx + 6, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }

    // Ground lines (moving)
    ctx.strokeStyle = colors.groundLine;
    ctx.lineWidth = 2;
    for (let i = 0; i < GAME_WIDTH; i += 60) {
      const gx = i - (groundOffset % 60);
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y + 25);
      ctx.lineTo(gx + 30, GROUND_Y + 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx + 15, GROUND_Y + 50);
      ctx.lineTo(gx + 45, GROUND_Y + 50);
      ctx.stroke();
    }
  };

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (now: number) => {
      const dt = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;

      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      if (gameStateRef.current === "playing") {
        // Update speed based on score
        speedRef.current = BASE_SPEED + Math.min(scoreRefLocal.current * 0.15, 8);
        spawnIntervalRef.current = Math.max(
          BASE_SPAWN_INTERVAL - scoreRefLocal.current * 25,
          700
        );

        // Ground scroll
        groundOffsetRef.current += speedRef.current;

        // Player physics
        playerVYRef.current += GRAVITY;
        playerYRef.current += playerVYRef.current;

        if (playerYRef.current >= GROUND_Y - PLAYER_SIZE) {
          playerYRef.current = GROUND_Y - PLAYER_SIZE;
          if (playerVYRef.current > 5) {
            squashRef.current = 1.3;
            stretchRef.current = 0.7;
            for (let i = 0; i < 6; i++) {
              particlesRef.current.push({
                x: PLAYER_X + Math.random() * PLAYER_SIZE,
                y: GROUND_Y,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 3,
                life: 25,
                maxLife: 25,
                color: "#d4a868",
                size: 2 + Math.random() * 3,
              });
            }
          }
          playerVYRef.current = 0;
          jumpsUsedRef.current = 0;
          isGroundedRef.current = true;
        } else {
          isGroundedRef.current = false;
        }

        // Squash/stretch recovery
        squashRef.current += (1 - squashRef.current) * 0.2;
        stretchRef.current += (1 - stretchRef.current) * 0.2;

        // Animation frame
        if (isGroundedRef.current) {
          playerAnimFrameRef.current += speedRef.current * 0.3;
        }

        // Spawn items — lightning variants (+1, +3, +5), poop (-1), reset
        // Anti-overlap: ensure items don't spawn on top of obstacles
        itemSpawnTimerRef.current += dt;
        if (itemSpawnTimerRef.current >= ITEM_BASE_SPAWN_INTERVAL) {
          itemSpawnTimerRef.current = 0;
          const roll = Math.random();
          let itemType: ItemType;
          let itemValue = 0;
          let itemSize = 32;
          if (roll < 0.35) {
            itemType = "lightning1";
            itemValue = 1;
            itemSize = 28;
          } else if (roll < 0.55) {
            itemType = "lightning3";
            itemValue = 3;
            itemSize = 40;
          } else if (roll < 0.62) {
            itemType = "lightning5";
            itemValue = 5;
            itemSize = 52;
          } else if (roll < 0.85) {
            itemType = "poop";
            itemValue = -1;
            itemSize = 30;
          } else {
            itemType = "reset";
            itemValue = 0;
            itemSize = 34;
          }

          // Choose height tier that doesn't overlap with recent obstacles
          // Tier 0: ground level (no jump needed) — y = GROUND_Y - itemSize/2 - 5
          // Tier 1: 1-jump height — y = GROUND_Y - 70
          // Tier 2: 2-jump height — y = GROUND_Y - 130
          // Tier 3: high (under top obstacles) — y = 80
          const tiers = [
            { y: GROUND_Y - itemSize - 5, label: "ground" },
            { y: GROUND_Y - 80 - itemSize / 2, label: "jump1" },
            { y: GROUND_Y - 140 - itemSize / 2, label: "jump2" },
            { y: 70, label: "high" },
          ];

          // Find a tier that doesn't overlap with obstacles near the spawn X
          const spawnX = GAME_WIDTH + 50;
          const minGap = 80; // minimum horizontal gap between item and obstacle centers
          let chosenTier = tiers[Math.floor(Math.random() * tiers.length)];
          // Check obstacles for overlap
          let attempts = 0;
          while (attempts < 10) {
            let overlaps = false;
            for (const obs of obstaclesRef.current) {
              const obsCenterY = obs.y + obs.size / 2;
              const itemCenterY = chosenTier.y + itemSize / 2;
              const verticalDist = Math.abs(obsCenterY - itemCenterY);
              const horizontalDist = Math.abs(obs.x - spawnX);
              if (horizontalDist < minGap && verticalDist < 50) {
                overlaps = true;
                break;
              }
            }
            if (!overlaps) break;
            chosenTier = tiers[(tiers.indexOf(chosenTier) + 1) % tiers.length];
            attempts++;
          }

          itemsRef.current.push({
            x: spawnX,
            y: chosenTier.y,
            size: itemSize,
            type: itemType,
            bobOffset: Math.random() * Math.PI * 2,
            collected: false,
            value: itemValue,
          });
        }

        // Spawn obstacles — three height lanes: bottom, middle, top
        spawnTimerRef.current += dt;
        if (spawnTimerRef.current >= spawnIntervalRef.current) {
          spawnTimerRef.current = 0;
          const maxVariant = Math.min(1 + Math.floor(scoreRefLocal.current / 8), 4);
          const variant = Math.floor(Math.random() * (maxVariant + 1));
          const baseRotationSpeed = (Math.random() - 0.5) * 0.04;

          // Lane selection: more lanes unlock as score increases
          // Score 0-4: only bottom. 5-9: bottom + top. 10+: all three lanes + tall.
          let lanes: ObstacleType[];
          if (scoreRefLocal.current < 5) {
            lanes = ["bottom", "bottom", "bottom", "tall"];
          } else if (scoreRefLocal.current < 10) {
            lanes = ["bottom", "bottom", "top", "tall", "top"];
          } else if (scoreRefLocal.current < 20) {
            lanes = ["bottom", "top", "middle", "bottom", "tall", "top"];
          } else {
            lanes = ["bottom", "top", "middle", "tall", "middle", "top", "bottom"];
          }
          const lane = lanes[Math.floor(Math.random() * lanes.length)];

          if (lane === "bottom") {
            // 하단: ground level — 1단 점프로 피하기
            const size = 50 + Math.random() * 15;
            obstaclesRef.current.push({
              x: GAME_WIDTH + 50, y: GROUND_Y - size, size, passed: false,
              rotation: 0, rotationSpeed: baseRotationSpeed,
              bobOffset: Math.random() * Math.PI * 2, variant, type: "bottom",
            });
          } else if (lane === "top") {
            // 상단: very high — 점프 없이 그냥 지나가기
            const size = 45 + Math.random() * 15;
            const topY = 50 + Math.random() * 30;
            obstaclesRef.current.push({
              x: GAME_WIDTH + 50, y: topY, size, passed: false,
              rotation: 0, rotationSpeed: baseRotationSpeed,
              bobOffset: Math.random() * Math.PI * 2, variant, type: "top",
            });
          } else if (lane === "middle") {
            // 중단: 2단 점프 높이에 있어서 2단 점프로 피하기
            const size = 45 + Math.random() * 15;
            // Place at 2nd jump height — must double jump over it
            const midY = GROUND_Y - 120 - Math.random() * 20;
            obstaclesRef.current.push({
              x: GAME_WIDTH + 50, y: midY, size, passed: false,
              rotation: 0, rotationSpeed: baseRotationSpeed,
              bobOffset: Math.random() * Math.PI * 2, variant, type: "middle",
            });
          } else if (lane === "tall") {
            // 큰 소 머리: 3단 점프가 필요한 매우 큰 장애물
            const size = 95 + Math.random() * 15;
            obstaclesRef.current.push({
              x: GAME_WIDTH + 50, y: GROUND_Y - size, size, passed: false,
              rotation: 0, rotationSpeed: baseRotationSpeed * 0.5,
              bobOffset: Math.random() * Math.PI * 2, variant, type: "tall",
            });
            // At high scores, sometimes follow with a top obstacle
            if (scoreRefLocal.current >= 15 && Math.random() < 0.35) {
              const topSize = 40 + Math.random() * 10;
              obstaclesRef.current.push({
                x: GAME_WIDTH + 50 + size + 80, y: 70 + Math.random() * 30,
                size: topSize, passed: false,
                rotation: 0, rotationSpeed: baseRotationSpeed,
                bobOffset: Math.random() * Math.PI * 2, variant, type: "top",
              });
            }
          }
        }

        // Update obstacles
        obstaclesRef.current = obstaclesRef.current.filter((obs) => {
          obs.x -= speedRef.current;
          obs.rotation += obs.rotationSpeed;

          // Collision detection — tighter hitboxes for fairness
          const playerLeft = PLAYER_X + 8;
          const playerRight = PLAYER_X + PLAYER_SIZE - 8;
          const playerTop = playerYRef.current + 8;
          const playerBottom = playerYRef.current + PLAYER_SIZE - 4;
          const obsPad = obs.type === "top" || obs.type === "middle" ? 12 : 10;
          const obsLeft = obs.x + obsPad;
          const obsRight = obs.x + obs.size - obsPad;
          const obsTop = obs.y + obsPad;
          const obsBottom = obs.y + obs.size - 6;

          if (
            playerRight > obsLeft &&
            playerLeft < obsRight &&
            playerBottom > obsTop &&
            playerTop < obsBottom
          ) {
            // Game over
            gameStateRef.current = "gameover_pending";
            // Explosion particles
            for (let i = 0; i < 30; i++) {
              const angle = (Math.PI * 2 * i) / 30;
              const speed = 2 + Math.random() * 5;
              particlesRef.current.push({
                x: PLAYER_X + PLAYER_SIZE / 2,
                y: playerYRef.current + PLAYER_SIZE / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 40,
                maxLife: 40,
                color: i % 2 === 0 ? "#fbbf24" : "#8b6b4a",
                size: 3 + Math.random() * 4,
              });
            }
            // Trigger score entry after a brief delay
            setTimeout(() => {
              handleGameOver();
            }, 500);
          }

          return obs.x > -obs.size - 50;
        });

        // Update items — collision with player
        itemsRef.current = itemsRef.current.filter((item) => {
          item.x -= speedRef.current;

          const playerLeft = PLAYER_X + 8;
          const playerRight = PLAYER_X + PLAYER_SIZE - 8;
          const playerTop = playerYRef.current + 8;
          const playerBottom = playerYRef.current + PLAYER_SIZE - 4;
          const itemLeft = item.x + 4;
          const itemRight = item.x + item.size - 4;
          const itemTop = item.y + 4;
          const itemBottom = item.y + item.size - 4;

          if (
            playerRight > itemLeft &&
            playerLeft < itemRight &&
            playerBottom > itemTop &&
            playerTop < itemBottom
          ) {
            item.collected = true;

            if (item.type === "lightning1" || item.type === "lightning3" || item.type === "lightning5") {
              const pts = item.value;
              scoreRef.current += pts;
              scoreRefLocal.current += pts;
              setScore(scoreRef.current);
              flashRef.current = 15;
              const particleCount = pts === 1 ? 15 : pts === 3 ? 25 : 40;
              const particleColor = pts === 1 ? "#fde047" : pts === 3 ? "#fbbf24" : "#f97316";
              for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const speed = pts === 1 ? 4 : pts === 3 ? 5 : 7;
                particlesRef.current.push({
                  x: item.x + item.size / 2,
                  y: item.y + item.size / 2,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  life: 30 + pts * 5,
                  maxLife: 30 + pts * 5,
                  color: particleColor,
                  size: 3 + Math.random() * (2 + pts),
                });
              }
              if (scoreRef.current >= VICTORY_SCORE) {
                gameStateRef.current = "victory";
                setGameState("victory");
                if (scoreRef.current > highScore) {
                  setHighScore(scoreRef.current);
                }
                setShowScoreModal(true);
                for (let i = 0; i < 80; i++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = 3 + Math.random() * 8;
                  confettiRef.current.push({
                    x: GAME_WIDTH / 2,
                    y: GAME_HEIGHT / 2,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 3,
                    life: 120,
                    maxLife: 120,
                    color: ["#fbbf24", "#f97316", "#ec4899", "#22c55e", "#3b82f6", "#a855f7"][Math.floor(Math.random() * 6)],
                    size: 4 + Math.random() * 6,
                  });
                }
              }
            } else if (item.type === "poop") {
              scoreRef.current--;
              scoreRefLocal.current--;
              if (scoreRef.current < 0) scoreRef.current = 0;
              if (scoreRefLocal.current < 0) scoreRefLocal.current = 0;
              setScore(scoreRef.current);
              for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12;
                particlesRef.current.push({
                  x: item.x + item.size / 2,
                  y: item.y + item.size / 2,
                  vx: Math.cos(angle) * 3,
                  vy: Math.sin(angle) * 3 + 1,
                  life: 30,
                  maxLife: 30,
                  color: "#8b6b4a",
                  size: 3 + Math.random() * 3,
                });
              }
            } else if (item.type === "reset") {
              tripleJumpReadyAtRef.current = 0;
              tripleJumpCooldownRef.current = 1;
              for (let i = 0; i < 15; i++) {
                const angle = (Math.PI * 2 * i) / 15;
                particlesRef.current.push({
                  x: item.x + item.size / 2,
                  y: item.y + item.size / 2,
                  vx: Math.cos(angle) * 4,
                  vy: Math.sin(angle) * 4,
                  life: 35,
                  maxLife: 35,
                  color: "#22c55e",
                  size: 3 + Math.random() * 3,
                });
              }
            }
            return false;
          }

          return item.x > -item.size - 50;
        });

        // Update particles
        particlesRef.current = particlesRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2;
          p.life--;
          return p.life > 0;
        });

        // Flash decay
        if (flashRef.current > 0) flashRef.current--;

        // Update confetti
        confettiRef.current = confettiRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15;
          p.vx *= 0.99;
          p.life--;
          return p.life > 0;
        });
        victoryAnimRef.current += dt;

        // Update triple jump cooldown fraction
        const nowMs = performance.now();
        if (tripleJumpReadyAtRef.current === 0) {
          tripleJumpCooldownRef.current = 1;
        } else {
          const remaining = tripleJumpReadyAtRef.current - nowMs;
          tripleJumpCooldownRef.current = Math.max(0, 1 - remaining / TRIPLE_JUMP_COOLDOWN);
        }
      }

      // Draw background
      drawBackground(ctx, now, groundOffsetRef.current, scoreRefLocal.current);

      // Draw obstacles — airborne ones get a motion trail
      obstaclesRef.current.forEach((obs) => {
        if (obs.type === "top" || obs.type === "middle") {
          for (let t = 1; t <= 3; t++) {
            ctx.save();
            ctx.globalAlpha = 0.15 / t;
            drawCowHead(ctx, obs.x + t * 12, obs.y, obs.size, obs.rotation, now, obs.bobOffset, obs.variant);
            ctx.restore();
          }
        }
        drawCowHead(ctx, obs.x, obs.y, obs.size, obs.rotation, now, obs.bobOffset, obs.variant);
      });

      // Draw items
      itemsRef.current.forEach((item) => {
        const bobY = Math.sin(now * 0.004 + item.bobOffset) * 6;
        ctx.save();
        ctx.translate(item.x + item.size / 2, item.y + item.size / 2 + bobY);
        const s = item.size / 32;
        ctx.scale(s, s);

        if (item.type === "lightning1" || item.type === "lightning3" || item.type === "lightning5") {
          const glowColor = item.type === "lightning1" ? "#fde047" : item.type === "lightning3" ? "#fbbf24" : "#f97316";
          const strokeColor = item.type === "lightning1" ? "#f59e0b" : item.type === "lightning3" ? "#d97706" : "#ea580c";
          const scale = item.type === "lightning1" ? 0.85 : item.type === "lightning3" ? 1.2 : 1.6;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = item.type === "lightning5" ? 20 : 12;
          ctx.fillStyle = glowColor;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-3 * scale, -14 * scale);
          ctx.lineTo(6 * scale, -2 * scale);
          ctx.lineTo(1 * scale, -2 * scale);
          ctx.lineTo(4 * scale, 14 * scale);
          ctx.lineTo(-6 * scale, 2 * scale);
          ctx.lineTo(-1 * scale, 2 * scale);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Point value label for 3 and 5 point bolts
          if (item.type !== "lightning1") {
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${item.type === "lightning5" ? 12 : 9}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`+${item.value}`, 0, 0);
          }
          ctx.shadowBlur = 0;
        } else if (item.type === "poop") {
          // Poop emoji-style swirl
          ctx.fillStyle = "#8b6b4a";
          ctx.strokeStyle = "#6a4a2a";
          ctx.lineWidth = 1.5;
          // Base
          ctx.beginPath();
          ctx.ellipse(0, 8, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Middle
          ctx.beginPath();
          ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Top swirl
          ctx.beginPath();
          ctx.ellipse(0, -4, 6, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Peak
          ctx.beginPath();
          ctx.ellipse(0, -9, 3, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (item.type === "reset") {
          // Green star with glow — triple jump reset
          ctx.shadowColor = "#22c55e";
          ctx.shadowBlur = 12;
          ctx.fillStyle = "#22c55e";
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            const r = 14;
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            const innerAngle = angle + Math.PI / 5;
            ctx.lineTo(Math.cos(innerAngle) * 6, Math.sin(innerAngle) * 6);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          // Small "3" in center
          ctx.fillStyle = "#fff";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("3", 0, 0);
        }
        ctx.restore();
      });

      // Draw particles
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Draw confetti (victory)
      confettiRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Draw player
      drawPlayer(
        ctx,
        PLAYER_X,
        playerYRef.current,
        PLAYER_SIZE,
        isGroundedRef.current,
        playerAnimFrameRef.current,
        squashRef.current,
        stretchRef.current
      );

      // Score flash
      if (flashRef.current > 0) {
        ctx.save();
        ctx.globalAlpha = (flashRef.current / 15) * 0.15;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.restore();
      }

      // Score display (top right)
      ctx.save();
      ctx.font = "bold 28px 'Pretendard', sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillText(`${scoreRef.current}`, GAME_WIDTH - 19, 49);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${scoreRef.current}`, GAME_WIDTH - 20, 48);

      ctx.font = "bold 14px 'Pretendard', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("SCORE", GAME_WIDTH - 20, 68);
      ctx.restore();

      // Triple jump cooldown bar (bottom center)
      const barWidth = 200;
      const barHeight = 14;
      const barX = (GAME_WIDTH - barWidth) / 2;
      const barY = GAME_HEIGHT - 28;
      const cd = tripleJumpCooldownRef.current;
      const isReady = cd >= 1;

      ctx.save();
      // Background
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 8);
      ctx.fill();

      // Bar fill
      if (isReady) {
        const pulse = Math.sin(now * 0.006) * 0.2 + 0.8;
        ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
      } else {
        ctx.fillStyle = "#f97316";
      }
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * cd, barHeight, 6);
      ctx.fill();

      // Border
      ctx.strokeStyle = isReady ? "rgba(251, 191, 36, 0.8)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 6);
      ctx.stroke();

      // Label
      ctx.font = "bold 11px 'Pretendard', sans-serif";
      ctx.textAlign = "center";
      if (isReady) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText("3단 점프 준비됨!", GAME_WIDTH / 2, barY + 11);
      } else {
        const secs = Math.ceil((1 - cd) * 15);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(`3단 점프 ${secs}초 후 사용 가능`, GAME_WIDTH / 2, barY + 11);
      }
      ctx.restore();

      // Phase indicator (top center)
      const phaseLabels: Record<Phase, string> = {
        morning: "🌅 아침",
        day: "☀️ 낮",
        sunset: "🌇 노을",
        dusk: "🌆 해질녘",
        night: "🌙 밤",
      };
      const currentPhase = getPhase(scoreRefLocal.current);
      ctx.save();
      ctx.font = "bold 16px 'Pretendard', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillText(phaseLabels[currentPhase], GAME_WIDTH / 2 + 1, 31);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(phaseLabels[currentPhase], GAME_WIDTH / 2, 30);
      ctx.restore();

      // Ready overlay
      if (gameStateRef.current === "ready") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.textAlign = "center";
        ctx.font = "bold 52px 'Pretendard', sans-serif";
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText("소머리 피했어유", GAME_WIDTH / 2 + 3, GAME_HEIGHT / 2 - 57);
        ctx.fillStyle = "#fef3c7";
        ctx.fillText("소머리 피했어유", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);

        ctx.font = "18px 'Pretendard', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText("스페이스바 또는 화면을 터치해서 점프!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
        ctx.fillText("⚡번개 +1/+3/+5 · 💩똥 -1 · ⭐3단 점프 초기화", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 5);
        ctx.fillText("소 머리를 피하고 번개를 모아 100점 달성!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);

        const pulse = Math.sin(now * 0.005) * 0.3 + 0.7;
        ctx.font = "bold 22px 'Pretendard', sans-serif";
        ctx.fillStyle = `rgba(255, 220, 100, ${pulse})`;
        ctx.fillText("▶ 게임 시작", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 55);
        ctx.restore();
      }

      // Game Over overlay (only when not showing modal)
      if (gameStateRef.current === "gameover") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.textAlign = "center";
        ctx.font = "bold 44px 'Pretendard', sans-serif";
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText("게임 오버!", GAME_WIDTH / 2 + 2, GAME_HEIGHT / 2 - 48);
        ctx.fillStyle = "#fca5a5";
        ctx.fillText("게임 오버!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);

        ctx.font = "bold 32px 'Pretendard', sans-serif";
        ctx.fillStyle = "#fef3c7";
        ctx.fillText(`점수: ${scoreRef.current}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 5);

        if (scoreRef.current >= highScore && scoreRef.current > 0) {
          ctx.font = "bold 20px 'Pretendard', sans-serif";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText("최고 기록 갱신!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 25);
        } else {
          ctx.font = "16px 'Pretendard', sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillText(`최고 점수: ${highScore}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 25);
        }

        const pulse = Math.sin(now * 0.005) * 0.3 + 0.7;
        ctx.font = "bold 20px 'Pretendard', sans-serif";
        ctx.fillStyle = `rgba(255, 220, 100, ${pulse})`;
        ctx.fillText("스페이스바로 다시 시작", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
        ctx.restore();
      }

      // Victory overlay
      if (gameStateRef.current === "victory") {
        // Update confetti even during victory
        confettiRef.current = confettiRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15;
          p.vx *= 0.99;
          p.life--;
          return p.life > 0;
        });
        victoryAnimRef.current += 16;

        // Spawn new confetti periodically
        if (Math.floor(victoryAnimRef.current / 500) < 5) {
          for (let i = 0; i < 5; i++) {
            confettiRef.current.push({
              x: Math.random() * GAME_WIDTH,
              y: -10,
              vx: (Math.random() - 0.5) * 4,
              vy: 2 + Math.random() * 3,
              life: 100,
              maxLife: 100,
              color: ["#fbbf24", "#f97316", "#ec4899", "#22c55e", "#3b82f6", "#a855f7"][Math.floor(Math.random() * 6)],
              size: 4 + Math.random() * 5,
            });
          }
        }

        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.textAlign = "center";

        // Big celebratory cow heads floating
        const cowFloat = Math.sin(now * 0.003) * 15;
        ctx.save();
        ctx.globalAlpha = 0.9;
        drawCowHead(ctx, GAME_WIDTH / 2 - 120, GAME_HEIGHT / 2 - 100 + cowFloat, 80, 0, now, 0, 0);
        drawCowHead(ctx, GAME_WIDTH / 2 + 80, GAME_HEIGHT / 2 - 100 - cowFloat, 80, 0, now, Math.PI, 2);
        ctx.restore();

        // "축하합니다!" text
        const textPulse = Math.sin(now * 0.005) * 0.1 + 1;
        ctx.save();
        ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.scale(textPulse, textPulse);
        ctx.font = "bold 56px 'Pretendard', sans-serif";
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText("축하합니다!", 3, 3);
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("축하합니다!", 0, 0);
        ctx.restore();

        ctx.font = "bold 24px 'Pretendard', sans-serif";
        ctx.fillStyle = "#fef3c7";
        ctx.fillText("100점 달성!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 25);

        ctx.font = "16px 'Pretendard', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("소머리를 모두 피하고 번개를 모았어요!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 55);
        ctx.fillText("이름을 입력해서 랭킹에 등록하세요!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);

        const pulse = Math.sin(now * 0.005) * 0.3 + 0.7;
        ctx.font = "bold 20px 'Pretendard', sans-serif";
        ctx.fillStyle = `rgba(255, 220, 100, ${pulse})`;
        ctx.fillText("스페이스바로 다시 시작", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 110);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationRef.current);
  }, [highScore, handleGameOver]);

  // Touch / click to jump
  const handleCanvasInteraction = () => {
    if (gameStateRef.current === "ready" || gameStateRef.current === "gameover" || gameStateRef.current === "victory") {
      startGame();
    } else if (gameStateRef.current === "playing") {
      jump();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 via-sky-300 to-emerald-200 flex items-center justify-center p-4 select-none">
      <div className="flex gap-6 items-start max-w-[1280px] w-full justify-center">
        {/* Leaderboard — left side */}
        <div className="hidden sm:block flex-shrink-0 mt-8">
          <Leaderboard refreshKey={leaderboardKey} />
        </div>

        {/* Game area */}
        <div className="flex flex-col items-center">
          <div className="mb-4 text-center">
            <h1 className="text-4xl font-black text-white drop-shadow-lg tracking-tight">
              소머리 피했어유
            </h1>
            <p className="text-white/80 text-sm mt-1 font-medium">
              ⚡ 번개 +1/+3/+5 · 💩 똥 -1 · ⭐ 3단 점프 초기화 · 100점 달성 시 엔딩!
            </p>
          </div>

          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/30"
            style={{ width: GAME_WIDTH, maxWidth: "100%" }}
          >
            <canvas
              ref={canvasRef}
              width={GAME_WIDTH}
              height={GAME_HEIGHT}
              onClick={handleCanvasInteraction}
              onTouchStart={(e) => {
                e.preventDefault();
                handleCanvasInteraction();
              }}
              className="block w-full h-auto cursor-pointer"
              style={{ imageRendering: "auto" }}
            />

            {showScoreModal && (
              <ScoreModal
                score={score}
                isHighScore={score >= highScore && score > 0}
                isVictory={gameState === "victory"}
                onSubmit={handleScoreSubmit}
                onSkip={handleScoreSkip}
              />
            )}
          </div>

          <div className="mt-4 flex gap-4 text-white/90 text-sm font-medium flex-wrap justify-center">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white/20 rounded-md text-xs font-bold">Space</kbd>
              <span>점프</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white/20 rounded-md text-xs font-bold">×2</kbd>
              <span>2단 점프</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-amber-400/30 rounded-md text-xs font-bold text-amber-200">×3</kbd>
              <span>3단 점프 (15초)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-200 font-bold">목표: 100점</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-200 font-bold">최고: {highScore}</span>
            </div>
          </div>

          {/* Mobile leaderboard */}
          <div className="sm:hidden mt-4 w-full" style={{ maxWidth: GAME_WIDTH }}>
            <Leaderboard refreshKey={leaderboardKey} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
