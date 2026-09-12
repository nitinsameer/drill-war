import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,

  ArrowRight,

  BookOpen,
  Gauge,
  Gem,
  Home,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import menuArt from "@/assets/drill-war-menu.jpg";
import alexArt from "@/assets/alex.png";
import miaArt from "@/assets/mia.png";
import roboArt from "@/assets/robo.png";
import { Button } from "@/components/ui/button";
import { setDrillIntensity, setSoundEnabled, sfx, startDrillLoop, stopDrillLoop, unlockAudio } from "@/lib/game-audio";
import { prewarmVoice, say, setVoiceEnabled, stopVoice } from "@/lib/race-voice";

const voiceLines = {
  start: "Drills down, dig deep!",
  gem: "Gem secured! Big points!",
  leadTaken: "You've taken the lead!",
  leadLost: "You're falling behind, push harder!",
  finalTen: "Ten seconds left! Dig, dig, dig!",
};

type Screen = "menu" | "howto" | "settings" | "character" | "drill" | "countdown" | "game" | "results";
type CharacterId = "alex" | "mia" | "robo";
type DrillId = "mini" | "speed" | "power";

const characters = [
  { id: "alex" as const, name: "Alex", art: alexArt, trait: "Brave explorer", perk: "+10% star value", color: "bg-amber" },
  { id: "mia" as const, name: "Mia", art: miaArt, trait: "Treasure hunter", perk: "+12% movement", color: "bg-coral" },
  { id: "robo" as const, name: "Robo", art: roboArt, trait: "Built for the deep", perk: "Starts with a shield", color: "bg-cyan" },
];

const drills = [
  { id: "mini" as const, name: "Mini Drill", tint: "#f0a712", trait: "Balanced and reliable", speed: 3, power: 3, control: 4 },
  { id: "speed" as const, name: "Speed Drill", tint: "#40d8ff", trait: "Fast and agile", speed: 5, power: 2, control: 4 },
  { id: "power" as const, name: "Power Drill", tint: "#ff5a80", trait: "Crushes tough rock", speed: 2, power: 5, control: 3 },
];


type RivalScore = { name: string; score: number };
type GameStats = {
  score: number;
  stars: number;
  gems: number;
  depth: number;
  combo: number;
  time: number;
  shields: number;
  boosts: number;
  magnets: number;
  hit: boolean;
  rivals: RivalScore[];
};

const emptyStats = (): GameStats => ({
  score: 0,
  stars: 0,
  gems: 0,
  depth: 0,
  combo: 1,
  time: 60,
  shields: 0,
  boosts: 0,
  magnets: 0,
  hit: false,
  rivals: [],
});

type PickupType = "star" | "gem" | "bomb" | "boost" | "magnet" | "shield";
type Pickup = { depth: number; x: number; type: PickupType; taken: boolean };

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand-compact" : "brand"} aria-label="Drill War">
      <span>DRILL</span><strong>WAR</strong>
    </div>
  );
}

function StatPips({ value }: { value: number }) {
  return <div className="stat-pips">{[1, 2, 3, 4, 5].map((pip) => <i key={pip} className={pip <= value ? "active" : ""} />)}</div>;
}

/** Stylized rig matching the in-race artwork: crawler tracks, cabin and cone auger. */
function RigIcon({ tint, spinning = false }: { tint: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={spinning ? "rig-icon spinning" : "rig-icon"} role="img" aria-hidden="true">
      <ellipse cx="60" cy="72" rx="40" ry="34" fill="rgba(2,10,22,.45)" />
      {[-1, 1].map((side) => (
        <g key={side}>
          <rect x={side < 0 ? 18 : 84} y="26" width="18" height="56" rx="8" fill="#101722" />
          <rect x={side < 0 ? 22 : 88} y="31" width="10" height="46" rx="5" fill="#394758" />
          {[36, 47, 58, 69].map((y) => <line key={y} x1={side < 0 ? 22 : 88} y1={y} x2={side < 0 ? 32 : 98} y2={y} stroke="#8994a0" strokeWidth="2" />)}
        </g>
      ))}
      <rect x="36" y="22" width="48" height="54" rx="9" fill={tint} />
      <rect x="41" y="26" width="38" height="7" rx="3.5" fill="rgba(255,255,255,.25)" />
      <rect x="43" y="35" width="34" height="24" rx="6" fill="#172334" />
      <rect x="47" y="39" width="26" height="16" rx="4" fill="#bfeaf6" />
      <rect x="50" y="42" width="9" height="3.5" rx="1.7" fill="rgba(255,255,255,.8)" />
      <rect x="40" y="62" width="40" height="16" rx="6" fill="#263646" />
      <rect x="46" y="65" width="28" height="10" rx="4" fill={tint} />
      <g className="rig-auger">
        <path d="M36 78 Q48 100 60 116 Q72 100 84 78 Z" fill="#d7e0e6" />
        <path d="M60 116 Q72 100 84 78 L60 78 Z" fill="#9cabb4" />
        <path d="M42 84 Q60 78 78 84" stroke="#4d5e6d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M47 94 Q60 88 73 94" stroke="#4d5e6d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M52 104 Q60 99 68 104" stroke="#4d5e6d" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="78" r="9" fill={tint} />
      <circle cx="57" cy="75" r="3" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2" />
    </svg>
  );
}


function GameCanvas({ selectedCharacter, selectedDrill, paused, sound, level, onStats, onFinish }: {
  selectedCharacter: CharacterId;
  selectedDrill: DrillId;
  paused: boolean;
  sound: boolean;
  level: number;
  onStats: (stats: GameStats) => void;
  onFinish: (stats: GameStats) => void;
}) {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ left: false, right: false, up: false, down: false });
  // Analog stick vector, -1..1 on each axis. Touch and keyboard both feed movement.
  const stick = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const finishRef = useRef(false);

  // Continuous motor + tunnel rumble for the whole race; the master gain follows the sound toggle.
  useEffect(() => {
    startDrillLoop();
    setSoundEnabled(sound);
    setVoiceEnabled(sound);
    prewarmVoice(Object.values(voiceLines));
    say(voiceLines.start, { priority: true });
    return () => { stopDrillLoop(); stopVoice(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const setInput = (key: keyof typeof keys.current, value: boolean) => {
    keys.current[key] = value;
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) setInput("left", true);
      if (["ArrowRight", "d", "D"].includes(event.key)) setInput("right", true);
      if (["ArrowUp", "w", "W"].includes(event.key)) setInput("up", true);
      if (["ArrowDown", "s", "S"].includes(event.key)) setInput("down", true);
      if (event.key.startsWith("Arrow")) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) setInput("left", false);
      if (["ArrowRight", "d", "D"].includes(event.key)) setInput("right", false);
      if (["ArrowUp", "w", "W"].includes(event.key)) setInput("up", false);
      if (["ArrowDown", "s", "S"].includes(event.key)) setInput("down", false);
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let previous = performance.now();
    const player = { x: 0.5, depth: 0, targetDepth: 0, direction: 0, targetDirection: 0, moving: true, vx: 0, vy: 1 };
    const drill = drills.find((item) => item.id === selectedDrill) ?? drills[0]!;
    const char = characters.find((item) => item.id === selectedCharacter) ?? characters[0]!;
    // Later levels: faster rivals, tighter tunnel, denser obstacle fields.
    const step = Math.min(6, Math.max(0, level - 1));
    const rivalBoost = 1 + step * 0.14;
    const bombShift = step * 0.045;
    const laneSqueeze = Math.min(0.2, step * 0.035);
    const rivals = characters
      .filter((item) => item.id !== selectedCharacter)
      .map((item, index) => ({
        name: item.name.toUpperCase(),
        x: index ? 0.76 : 0.24,
        depth: index ? 4 : 8,
        speed: (index ? 4.3 : 4.9) * rivalBoost,
        score: 0,
        color: item.id === "robo" ? "#40d8ff" : item.id === "mia" ? "#ff5a80" : "#f0a712",
        direction: 0,
      }));

    const stats: GameStats = emptyStats();
    if (selectedCharacter === "robo") stats.shields = 1;
    const starBonus = selectedCharacter === "alex" ? 1.1 : 1;
    const moveBonus = selectedCharacter === "mia" ? 1.12 : 1;

    // Timers for temporary effects, in seconds.
    let boostTime = 0;
    let magnetTime = 0;
    let stunTime = 0;
    let comboTime = 0;
    let timeLeft = 60;
    let wasLeading = true;
    let calledFinal = false;
    let spawnedTo = 6;
    const pickups: Pickup[] = [];
    const pops: { x: number; y: number; life: number; text: string; color: string }[] = [];

    const spawnAhead = () => {
      while (spawnedTo < player.depth + 120) {
        spawnedTo += Math.max(1.7, 3 - step * 0.22) + Math.random() * 2.4;
        const roll = Math.random();
        const zoneDeep = spawnedTo > 72;
        let type: PickupType = "star";
        if (roll > 0.94) type = "shield";
        else if (roll > 0.88) type = "magnet";
        else if (roll > 0.81) type = "boost";
        else if (roll > (zoneDeep ? 0.66 : 0.74) - bombShift) type = "bomb";
        else if (roll > (zoneDeep ? 0.42 : 0.56)) type = "gem";
        const span = 0.76 - laneSqueeze * 2;
        pickups.push({ depth: spawnedTo, x: 0.12 + laneSqueeze + Math.random() * span, type, taken: false });
      }
    };
    spawnAhead();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rounded = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    };
    const drawCrystal = (x: number, y: number, color: string, size: number) => {
      ctx.save(); ctx.translate(x, y); ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .7, -size * .25); ctx.lineTo(size * .45, size); ctx.lineTo(-size * .45, size); ctx.lineTo(-size * .7, -size * .25); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    const drawDrill = (x: number, y: number, color: string, label: string, direction: number, now: number, isPlayer = false, moving = true) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(direction);

      // Chunky rock chips and soft dust stream behind the spinning rig.
      if (moving && !paused) {
        for (let i = 0; i < 9; i++) {
          const phase = ((now / 4 + i * 17) % 100) / 100;
          const side = i % 2 ? 1 : -1;
          const spread = side * (9 + phase * 31 + (i % 3) * 4);
          const trail = -30 - phase * 44;
          ctx.globalAlpha = (1 - phase) * .46;
          ctx.fillStyle = i % 3 ? "#b9783e" : "#6b4129";
          ctx.beginPath();
          if (i % 3 === 0) {
            ctx.moveTo(spread, trail - 5);
            ctx.lineTo(spread + side * 7, trail + 3);
            ctx.lineTo(spread - side * 3, trail + 7);
            ctx.closePath();
          } else {
            ctx.arc(spread, trail, 3 + phase * 7, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (isPlayer) { ctx.shadowColor = color; ctx.shadowBlur = 18; }
      ctx.fillStyle = "rgba(2,10,22,.5)";
      ctx.beginPath(); ctx.ellipse(0, -1, 39, 46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Wide crawler tracks with individual steel tread plates.
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#101722";
        rounded(side * 18 - (side < 0 ? 17 : 0), -38, 17, 61, 7);
        ctx.fillStyle = "#394758";
        rounded(side * 20 - (side < 0 ? 13 : 0), -33, 10, 51, 5);
        ctx.strokeStyle = "#8994a0";
        ctx.lineWidth = 2;
        for (let tread = -27; tread <= 13; tread += 10) {
          ctx.beginPath(); ctx.moveTo(side * 21 - 5, tread); ctx.lineTo(side * 21 + 5, tread); ctx.stroke();
        }
        ctx.fillStyle = "#151d28";
        for (const wheelY of [-25, -7, 11]) {
          ctx.beginPath(); ctx.arc(side * 25, wheelY, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Compact armored body, cockpit glass and character-color panels.
      ctx.fillStyle = color; rounded(-22, -41, 44, 56, 8);
      ctx.fillStyle = "rgba(255,255,255,.22)"; rounded(-17, -37, 34, 7, 4);
      ctx.fillStyle = "#172334"; rounded(-15, -29, 30, 23, 5);
      const glass = ctx.createLinearGradient(-10, -27, 12, -9);
      glass.addColorStop(0, "#d5f7ff"); glass.addColorStop(1, "#5fb4ce");
      ctx.fillStyle = glass; rounded(-11, -26, 22, 15, 4);
      ctx.fillStyle = "rgba(255,255,255,.65)"; rounded(-8, -24, 8, 3, 2);
      ctx.fillStyle = "#263646"; rounded(-19, -3, 38, 19, 6);
      ctx.fillStyle = color; rounded(-14, 0, 28, 10, 4);
      ctx.fillStyle = "#dce5e8"; rounded(-15, 13, 30, 9, 3);
      ctx.fillStyle = "#6e7f8c";
      for (const rivetX of [-10, 10]) { ctx.beginPath(); ctx.arc(rivetX, 17, 2, 0, Math.PI * 2); ctx.fill(); }

      // Oversized conical auger with a moving helical cutting edge.
      const spin = now / 70;
      const steel = ctx.createLinearGradient(-22, 23, 22, 67);
      steel.addColorStop(0, "#f8fcfd"); steel.addColorStop(.45, "#9cabb4"); steel.addColorStop(1, "#eef4f5");
      ctx.fillStyle = steel;
      ctx.beginPath(); ctx.moveTo(-22, 23); ctx.quadraticCurveTo(-13, 51, 0, 70); ctx.quadraticCurveTo(13, 51, 22, 23); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#4d5e6d"; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (let ring = 0; ring < 4; ring++) {
        const yy = 28 + ring * 10;
        const half = 19 - ring * 4;
        const wave = Math.sin(spin + ring * 1.4) * 3;
        ctx.beginPath(); ctx.moveTo(-half, yy + wave); ctx.quadraticCurveTo(0, yy - wave - 4, half, yy - wave); ctx.stroke();
      }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 23, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-2, 21, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Labels remain readable while the machine turns.
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = isPlayer ? "#ffc400" : "#07182f"; rounded(-34, -65, 68, 18, 7);
      ctx.fillStyle = isPlayer ? "#10203a" : "#f4f8ff"; ctx.font = "800 10px Arial"; ctx.textAlign = "center"; ctx.fillText(label.toUpperCase(), 0, -52); ctx.restore();
    };
    const drawPickup = (type: PickupType, x: number, y: number, now: number) => {
      const bob = Math.sin(now / 320 + x) * 3;
      ctx.save(); ctx.translate(x, y + bob); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (type === "star") { ctx.shadowColor = "#ffd12a"; ctx.shadowBlur = 16; ctx.fillStyle = "#ffd12a"; ctx.font = "30px serif"; ctx.fillText("★", 0, 0); }
      else if (type === "gem") { drawCrystal(0, 0, "#3ad7ff", 13); }
      else if (type === "bomb") { ctx.shadowColor = "#ff3d16"; ctx.shadowBlur = 14; ctx.fillStyle = "#1b1f28"; ctx.beginPath(); ctx.arc(0, 2, 12, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(12, -17); ctx.stroke(); }
      else {
        const color = type === "boost" ? "#ffd12a" : type === "magnet" ? "#ff5a80" : "#40d8ff";
        ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.fillStyle = "rgba(6,16,32,.85)"; rounded(-15, -15, 30, 30, 9);
        ctx.fillStyle = color; ctx.font = "700 17px Arial";
        ctx.fillText(type === "boost" ? "⚡" : type === "magnet" ? "🧲" : "🛡", 0, 1);
      }
      ctx.restore();
    };

    const collect = (pickup: Pickup, screenX: number, screenY: number) => {
      pickup.taken = true;
      if (pickup.type === "bomb") {
        if (stats.shields > 0) {
          stats.shields -= 1;
          sfx.power();
          pops.push({ x: screenX, y: screenY, life: 1, text: "SHIELD!", color: "#40d8ff" });
          return;
        }
        stats.hit = true;
        stunTime = 1.1;
        stats.combo = 1;
        stats.score = Math.max(0, stats.score - 60);
        sfx.bomb();
        pops.push({ x: screenX, y: screenY, life: 1, text: "-60", color: "#ff5a3d" });
        return;
      }
      comboTime = 3;
      stats.combo = Math.min(8, stats.combo + 1);
      if (pickup.type === "star") {
        stats.stars += 1;
        const gain = Math.round(10 * stats.combo * starBonus);
        stats.score += gain;
        sfx.star();
        pops.push({ x: screenX, y: screenY, life: 1, text: `+${gain}`, color: "#ffd12a" });
        if (stats.stars > 0 && stats.stars % 10 === 0) say(`${stats.stars} stars collected!`, { cooldown: 6000 });
      } else if (pickup.type === "gem") {
        stats.gems += 1;
        const gain = 100 + stats.combo * 5;
        stats.score += gain;
        sfx.gem();
        pops.push({ x: screenX, y: screenY, life: 1, text: `+${gain}`, color: "#3ad7ff" });
        say(stats.gems > 1 ? `${stats.gems} gems in the bag!` : voiceLines.gem, { cooldown: 5000 });
      } else if (pickup.type === "boost") {
        stats.boosts += 1; boostTime = 4.5;
        sfx.power();
        pops.push({ x: screenX, y: screenY, life: 1, text: "TURBO!", color: "#ffd12a" });
      } else if (pickup.type === "magnet") {
        stats.magnets += 1; magnetTime = 6;
        sfx.power();
        pops.push({ x: screenX, y: screenY, life: 1, text: "MAGNET!", color: "#ff5a80" });
      } else {
        stats.shields += 1;
        sfx.power();
        pops.push({ x: screenX, y: screenY, life: 1, text: "SHIELD +1", color: "#40d8ff" });
      }
    };

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dt = Math.min((now - previous) / 1000, .05);
      previous = now;
      const playerY = h * .54;

      if (!paused) {
        timeLeft = Math.max(0, timeLeft - dt);
        stats.time = timeLeft;
        const input = keys.current;
        if (stunTime > 0) stunTime -= dt; else stats.hit = false;
        boostTime = Math.max(0, boostTime - dt);
        magnetTime = Math.max(0, magnetTime - dt);
        comboTime -= dt;
        if (comboTime <= 0) { stats.combo = 1; comboTime = 3; }

        const speedMul = (boostTime > 0 ? 1.7 : 1) * moveBonus * (stunTime > 0 ? 0 : 1);
        // Keyboard and joystick share one analog vector.
        const keyH = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const keyV = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        let horizontal = keyH || stick.current.x;
        let vertical = keyV || stick.current.y;
        const magnitude = Math.hypot(horizontal, vertical);
        if (magnitude > 1) { horizontal /= magnitude; vertical /= magnitude; }

        if (magnitude > 0.12) {
          player.targetDirection = Math.atan2(-horizontal, vertical);
          player.moving = true;
        } else {
          horizontal = 0; vertical = 0;
          player.targetDirection = 0;
          player.moving = stunTime <= 0;
        }
        // Smooth turn along the shortest arc so the rig never snaps.
        let delta = player.targetDirection - player.direction;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        player.direction += delta * Math.min(1, dt * 9);

        // Ease the velocity for smooth starts and stops.
        player.vx += (horizontal - player.vx) * Math.min(1, dt * 10);
        player.vy += (vertical - player.vy) * Math.min(1, dt * 10);
        if (Math.abs(player.vx) < 0.002) player.vx = 0;
        if (Math.abs(player.vy) < 0.002) player.vy = 0;

        // Keep the whole rig (plus its auger) inside the tunnel walls.
        const edge = Math.min(0.3, 72 / Math.max(w, 1));
        player.x = Math.max(edge, Math.min(1 - edge, player.x + player.vx * dt * (.19 + drill.speed * .017) * speedMul));
        player.targetDepth = Math.max(0, player.targetDepth + player.vy * dt * (7 + drill.power * 1.1) * speedMul);
        if (!horizontal && !vertical && stunTime <= 0) player.targetDepth += dt * 2.1;
        player.depth += (player.targetDepth - player.depth) * Math.min(1, dt * 6);

        stats.depth = Math.floor(player.depth);
        // Motor loudness follows how hard we dig, rumble follows travel speed.
        const travel = Math.min(1, Math.hypot(player.vx, player.vy));
        setDrillIntensity(stunTime > 0 ? 0.15 : 0.55 + travel * 0.45 + (boostTime > 0 ? 0.15 : 0), 0.35 + travel * 0.65);
        stats.score += dt * 4; // depth pressure keeps the race moving

        rivals.forEach((rival, index) => {
          const lateral = Math.sin(now / 1400 + index * 3) * .015;
          rival.depth += dt * rival.speed * (index ? .95 : 1.05) + Math.sin(now / 900 + index) * dt;
          const rivalEdge = Math.min(0.3, 72 / Math.max(w, 1));
          rival.x = Math.max(rivalEdge, Math.min(1 - rivalEdge, rival.x + lateral * dt));
          const rivalDelta = Math.atan2(-lateral * 18, 1) - rival.direction;
          rival.direction += rivalDelta * Math.min(1, dt * 6);

          rival.score += dt * (9 + rival.speed * 0.8) + (Math.random() < dt * 0.14 ? 80 : 0);
        });
        stats.rivals = rivals.map((rival) => ({ name: rival.name, score: Math.floor(rival.score) }));

        spawnAhead();
        const reach = magnetTime > 0 ? 130 : 38;
        pickups.forEach((pickup) => {
          if (pickup.taken) return;
          const py = playerY + (pickup.depth - player.depth) * 5;
          const px = pickup.x * w;
          if (py < -80 || py > h + 80) return;
          const dx = px - player.x * w;
          const dy = py - playerY;
          const magnetised = magnetTime > 0 && pickup.type !== "bomb";
          if (Math.hypot(dx, dy) < (magnetised ? reach : 38)) collect(pickup, px, py);
        });

        // Commentary on where the player sits against the rival rigs.
        const leader = rivals.reduce((best, rival) => (rival.score > best.score ? rival : best), rivals[0]!);
        const inLead = stats.score >= leader.score;
        if (inLead !== wasLeading) {
          wasLeading = inLead;
          say(inLead ? voiceLines.leadTaken : `${leader.name} is ahead of you!`, { cooldown: 7000 });
        }
        if (timeLeft <= 10 && !calledFinal) { calledFinal = true; say(voiceLines.finalTen, { priority: true }); }

        if (Math.floor(now / 200) % 2 === 0) onStats({ ...stats, score: Math.floor(stats.score) });
        if (timeLeft <= 0 && !finishRef.current) {
          finishRef.current = true;
          onFinish({ ...stats, score: Math.floor(stats.score) });
          return;
        }
      }

      if (paused) setDrillIntensity(0, 0);

      const zone = player.depth > 140 ? "volcanic" : player.depth > 72 ? "crystal" : "dirt";
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      if (zone === "volcanic") { gradient.addColorStop(0, "#351122"); gradient.addColorStop(1, "#7b1a11"); }
      else if (zone === "crystal") { gradient.addColorStop(0, "#101b46"); gradient.addColorStop(1, "#241350"); }
      else { gradient.addColorStop(0, "#4b2b1d"); gradient.addColorStop(1, "#241713"); }
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);

      const tile = 58;
      const offset = (player.depth * 5) % tile;
      for (let row = -1; row < h / tile + 2; row++) {
        for (let col = 0; col < w / tile + 1; col++) {
          const hash = (row * 43 + col * 97 + Math.floor(player.depth / 12) * 19) % 17;
          const x = col * tile; const y = row * tile - offset;
          ctx.fillStyle = hash % 3 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.11)";
          ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 1; rounded(x + 2, y + 2, tile - 4, tile - 4, 10); ctx.strokeRect(x + 3, y + 3, tile - 6, tile - 6);
          if (zone === "volcanic" && hash === 11) { ctx.fillStyle = "#ff3d16"; rounded(x + 5, y + 39, tile - 10, 12, 6); }
        }
      }
      for (let i = 0; i < 26; i++) {
        const px = (i * 89 + now / 8) % w; const py = (i * 137 + now / 14) % h;
        ctx.fillStyle = i % 3 ? "rgba(255,198,70,.35)" : "rgba(64,218,255,.32)"; ctx.fillRect(px, py, 3, 3);
      }

      pickups.forEach((pickup) => {
        if (pickup.taken) return;
        const py = playerY + (pickup.depth - player.depth) * 5;
        if (py < -40 || py > h + 40) return;
        drawPickup(pickup.type, pickup.x * w, py, now);
      });

      rivals.forEach((rival, index) => drawDrill(rival.x * w, playerY + (rival.depth - player.depth) * 5 + (index ? 150 : -130), rival.color, rival.name, rival.direction, now));

      if (magnetTime > 0) {
        ctx.save(); ctx.strokeStyle = "rgba(255,90,128,.45)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(player.x * w, playerY, 130, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (stats.shields > 0) {
        ctx.save(); ctx.strokeStyle = "rgba(64,216,255,.75)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(player.x * w, playerY, 52, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      const playerColor = selectedCharacter === "robo" ? "#40d8ff" : selectedCharacter === "mia" ? "#ff5a80" : "#f0a712";
      drawDrill(player.x * w, playerY, playerColor, `YOU · ${char.name}`, player.direction, now, true, player.moving);
      if (stunTime > 0) {
        ctx.save(); ctx.fillStyle = "rgba(255,61,22,.22)"; ctx.fillRect(0, 0, w, h); ctx.restore();
      }

      ctx.save(); ctx.textAlign = "center"; ctx.font = "900 18px Arial";
      for (let i = pops.length - 1; i >= 0; i--) {
        const pop = pops[i]!;
        pop.life -= dt * 1.4; pop.y -= dt * 46;
        if (pop.life <= 0) { pops.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, pop.life);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.restore();

      if (timeLeft <= 10) {
        ctx.fillStyle = "rgba(255,35,19,.16)"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 64px Impact, sans-serif"; ctx.fillText(String(Math.ceil(timeLeft)), w / 2, h * .38);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [onFinish, onStats, paused, selectedCharacter, selectedDrill]);

  const padRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);

  const updateStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - (rect.left + radius)) / radius;
    let dy = (event.clientY - (rect.top + radius)) / radius;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) { dx /= distance; dy /= distance; }
    stick.current = { x: dx, y: dy };
    setKnob({ x: dx, y: dy, active: true });
  };

  const releaseStick = () => {
    pointerId.current = null;
    stick.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0, active: false });
  };

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Drill War mine" />
      <div
        ref={padRef}
        className={`joystick${knob.active ? " active" : ""}`}
        role="application"
        aria-label="Drag to steer your drill"
        onPointerDown={(event) => {
          pointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateStick(event);
        }}
        onPointerMove={(event) => { if (pointerId.current === event.pointerId) updateStick(event); }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <span className="joystick-knob" style={{ transform: `translate(${knob.x * 42}px, ${knob.y * 42}px)` }} />
      </div>
    </>
  );

}

export function DrillWarGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [character, setCharacter] = useState<CharacterId>("alex");
  const [drill, setDrill] = useState<DrillId>("mini");
  const [countdown, setCountdown] = useState(3);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(true);
  const [runId, setRunId] = useState(0);
  const [stats, setStats] = useState<GameStats>(emptyStats());

  useEffect(() => { setSoundEnabled(sound); setVoiceEnabled(sound); }, [sound]);

  useEffect(() => {
    if (screen !== "countdown") return;
    setCountdown(3);
    let value = 3;
    const timer = window.setInterval(() => {
      value -= 1;
      if (value <= 0) { sfx.start(); window.clearInterval(timer); setStats(emptyStats()); setRunId((id) => id + 1); setScreen("game"); }
      else { sfx.countdown(); setCountdown(value); }
    }, 850);
    return () => window.clearInterval(timer);
  }, [screen]);

  const finishGame = useCallback((finalStats: GameStats) => { setStats(finalStats); setScreen("results"); setPaused(false); }, []);
  const updateStats = useCallback((next: GameStats) => setStats(next), []);
  const begin = () => { unlockAudio(); sfx.click(); setScreen("character"); };
  const you = characters.find((item) => item.id === character) ?? characters[0]!;
  const yourDrill = drills.find((item) => item.id === drill) ?? drills[0]!;

  const board = [
    { name: `YOU · ${you.name.toUpperCase()}`, score: stats.score, you: true },
    ...stats.rivals.map((rival) => ({ name: rival.name, score: rival.score, you: false })),
  ].sort((a, b) => b.score - a.score);

  if (screen === "game") {
    return (
      <main className="game-screen">
        <GameCanvas key={runId} selectedCharacter={character} selectedDrill={drill} paused={paused} sound={sound} onStats={updateStats} onFinish={finishGame} />
        <div className="hud" aria-live="polite">
          <div className="hud-player">
            <img src={you.art} width={512} height={512} alt="" loading="lazy" className="hud-avatar" />
            <div><small>YOU · {you.name}</small><strong>{stats.score.toLocaleString()}</strong></div>
          </div>
          <div className={`hud-timer ${stats.time <= 10 ? "danger" : ""}`}><small>TIME</small><strong>00:{Math.ceil(stats.time).toString().padStart(2, "0")}</strong></div>
          <div className="leaderboard"><small><Trophy /> LEADERBOARD</small>{board.map((entry, index) => <div key={entry.name}><b>{index + 1}</b><span>{entry.you ? "YOU" : entry.name}</span><strong>{entry.score.toLocaleString()}</strong></div>)}</div>
          <div className="hud-depth"><small>DEPTH</small><strong>{stats.depth}m</strong></div>
          <div className="hud-pickups">
            <span><Star /> {stats.stars}</span>
            <span><Gem /> {stats.gems}</span>
            <span><Zap /> x{stats.combo}</span>
            <span><Shield /> {stats.shields}</span>
          </div>
          <div className="zone-badge">{stats.depth > 140 ? "VOLCANIC CORE" : stats.depth > 72 ? "CRYSTAL CAVE" : "DEEP DIRT"}</div>
          <Button variant="control" size="iconGame" className="pause-button" aria-label="Pause game" onClick={() => setPaused(true)}><Pause /></Button>
        </div>
        {stats.time <= 10 && <div className="collapse-banner"><strong>CAVE COLLAPSE!</strong><span>Keep drilling — rocks are falling!</span></div>}
        {paused && <div className="modal-scrim"><div className="game-modal"><span className="modal-icon"><RigIcon tint="#f0a712" spinning /></span><h2>PAUSED</h2><p>Catch your breath. The treasure will wait.</p><Button variant="arcade" size="xl" onClick={() => setPaused(false)}><Play /> Resume</Button><Button variant="metal" size="lg" onClick={() => { setPaused(false); setScreen("menu"); }}><Home /> Quit to menu</Button></div></div>}
      </main>
    );
  }

  return (
    <main className="arcade-shell">
      <img src={menuArt} width={1536} height={1024} alt="Three Drill War racers charging through a crystal cavern" className="menu-art" />
      <div className="art-vignette" />
      {screen === "menu" && <section className="menu-stage"><Brand /><p className="tagline">DIG DEEP <i /> COLLECT <i /> CONQUER</p><div className="menu-actions"><Button variant="arcade" size="hero" onClick={begin}><Play /> Start game</Button><div><Button variant="metal" size="lg" onClick={() => setScreen("howto")}><BookOpen /> How to play</Button><Button variant="metal" size="lg" onClick={() => setScreen("settings")}><Settings /> Settings</Button></div></div><span className="version">ARCADE EDITION · v1.0</span></section>}

      {screen === "howto" && <section className="panel-screen"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => setScreen("menu")} aria-label="Back to menu"><Home /></Button></div><h1>HOW TO PLAY</h1><div className="howto-grid">
        <article><span className="how-rig"><RigIcon tint="#f0a712" spinning /></span><h3>Move & drill</h3><p>Drag the on-screen stick to steer and dig in any direction. WASD also works on a keyboard.</p></article>
        <article><span className="how-icon">⭐ 💎</span><h3>Grab treasure</h3><p>Stars are worth 10 × your combo, gems are worth 100. Keep collecting to hold the combo.</p></article>
        <article><span className="how-icon">⚡ 🧲 🛡</span><h3>Use power-ups</h3><p>Turbo speeds you up, the magnet vacuums treasure, a shield absorbs one blast.</p></article>
        <article><span className="how-icon">💣 🔥</span><h3>Dodge danger</h3><p>Bombs cost 60 points, break your combo and stun the drill for a second.</p></article>
      </div><div className="tip-strip"><Zap /> The final 10 seconds trigger a cave collapse. Keep moving!</div><Button variant="arcade" size="xl" onClick={() => setScreen("menu")}><Home /> Back to menu</Button></section>}

      {screen === "settings" && <section className="panel-screen settings-panel"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => setScreen("menu")} aria-label="Back to menu"><Home /></Button></div><h1>SETTINGS</h1><div className="settings-list"><button className="setting-control" onClick={() => setSound((value) => !value)}><span>{sound ? <Volume2 /> : <VolumeX />}</span><div><strong>Sound effects</strong><small>Drills, gems, hazards and countdowns</small></div><i className={sound ? "toggle active" : "toggle"} /></button><div className="setting-control"><span><Gauge /></span><div><strong>Game speed</strong><small>Arcade — fast, fair and competitive</small></div><b>ARCADE</b></div></div><Button variant="arcade" size="xl" onClick={() => setScreen("menu")}><Home /> Done</Button></section>}

      {screen === "character" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 1 OF 2</span></div><h1>CHOOSE YOUR DRILLER</h1><p className="screen-subtitle">Every racer has a different edge underground.</p><div className="selection-grid">{characters.map((item) => <button key={item.id} className={`select-card ${character === item.id ? "selected" : ""}`} onClick={() => setCharacter(item.id)}><span className={`character-portrait ${item.color}`}><img src={item.art} width={512} height={512} loading="lazy" alt={`${item.name}, a Drill War racer`} /></span><h2>{item.name}</h2><p>{item.trait}</p><strong>{item.perk}</strong><span className="selected-label">{character === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => setScreen("menu")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => setScreen("drill")}>Choose drill <ArrowRight /></Button></div></section>}

      {screen === "drill" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 2 OF 2</span></div><h1>CHOOSE YOUR DRILL</h1><p className="screen-subtitle">Pick a machine built for your racing style.</p><div className="selection-grid">{drills.map((item) => <button key={item.id} className={`select-card drill-card ${drill === item.id ? "selected" : ""}`} onClick={() => setDrill(item.id)}><span className="drill-portrait"><RigIcon tint={item.tint} spinning={drill === item.id} /></span><h2>{item.name}</h2><p>{item.trait}</p><div className="drill-stats"><label>Speed <StatPips value={item.speed} /></label><label>Power <StatPips value={item.power} /></label><label>Control <StatPips value={item.control} /></label></div><span className="selected-label">{drill === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => setScreen("character")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => setScreen("countdown")}><Play /> Start race</Button></div></section>}

      {screen === "countdown" && <section className="countdown-stage"><p>GET READY!</p><strong key={countdown}>{countdown}</strong><span>{you.name} · {drills.find((d) => d.id === drill)?.name}</span></section>}

      {screen === "results" && <section className="panel-screen results-screen"><Brand compact /><div className="winner-title"><span className="winner-rig"><RigIcon tint={yourDrill.tint} spinning /></span><Trophy /><div><small>EXPEDITION COMPLETE</small><h1>{board[0]?.you ? "YOU WIN!" : `${board[0]?.name} WINS!`}</h1></div></div><div className="result-score"><img src={you.art} width={512} height={512} loading="lazy" alt="" className="hud-avatar" /><div><small>FINAL SCORE</small><strong>{stats.score.toLocaleString()}</strong></div><span className="result-rig"><RigIcon tint={yourDrill.tint} spinning /></span></div><div className="result-stats"><div><Star /><strong>{stats.stars}</strong><small>Stars</small></div><div><Gem /><strong>{stats.gems}</strong><small>Gems</small></div><div><ArrowDown /><strong>{stats.depth}m</strong><small>Depth</small></div><div><Magnet /><strong>{stats.boosts + stats.magnets + stats.shields}</strong><small>Power-ups</small></div></div><div className="final-board"><h3>FINAL LEADERBOARD</h3>{board.map((entry, index) => <div key={entry.name} className={entry.you ? "winner-row" : ""}><b>{index + 1}</b><span>{entry.name}</span><strong>{entry.score.toLocaleString()}</strong></div>)}</div><div className="selection-actions"><Button variant="arcade" size="xl" onClick={() => setScreen("countdown")}><RotateCcw /> Race again</Button><Button variant="metal" size="lg" onClick={() => setScreen("drill")}><Settings /> Change drill</Button></div></section>}
    </main>
  );
}
