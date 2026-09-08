import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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

type Screen = "menu" | "howto" | "settings" | "character" | "drill" | "countdown" | "game" | "results";
type CharacterId = "alex" | "mia" | "robo";
type DrillId = "mini" | "speed" | "power";

const characters = [
  { id: "alex" as const, name: "Alex", art: alexArt, trait: "Brave explorer", perk: "+10% star value", color: "bg-amber" },
  { id: "mia" as const, name: "Mia", art: miaArt, trait: "Treasure hunter", perk: "+12% movement", color: "bg-coral" },
  { id: "robo" as const, name: "Robo", art: roboArt, trait: "Built for the deep", perk: "Starts with a shield", color: "bg-cyan" },
];

const drills = [
  { id: "mini" as const, name: "Mini Drill", icon: "🚜", trait: "Balanced and reliable", speed: 3, power: 3, control: 4 },
  { id: "speed" as const, name: "Speed Drill", icon: "🏎️", trait: "Fast and agile", speed: 5, power: 2, control: 4 },
  { id: "power" as const, name: "Power Drill", icon: "⚙️", trait: "Crushes tough rock", speed: 2, power: 5, control: 3 },
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

function GameCanvas({ selectedCharacter, selectedDrill, paused, onStats, onFinish }: {
  selectedCharacter: CharacterId;
  selectedDrill: DrillId;
  paused: boolean;
  onStats: (stats: GameStats) => void;
  onFinish: (stats: GameStats) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ left: false, right: false, up: false, down: false });
  // Analog stick vector, -1..1 on each axis. Touch and keyboard both feed movement.
  const stick = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const finishRef = useRef(false);

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
    const rivals = characters
      .filter((item) => item.id !== selectedCharacter)
      .map((item, index) => ({
        name: item.name.toUpperCase(),
        x: index ? 0.76 : 0.24,
        depth: index ? 4 : 8,
        speed: index ? 4.3 : 4.9,
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
    let spawnedTo = 6;
    const pickups: Pickup[] = [];
    const pops: { x: number; y: number; life: number; text: string; color: string }[] = [];

    const spawnAhead = () => {
      while (spawnedTo < player.depth + 120) {
        spawnedTo += 3 + Math.random() * 2.4;
        const roll = Math.random();
        const zoneDeep = spawnedTo > 72;
        let type: PickupType = "star";
        if (roll > 0.94) type = "shield";
        else if (roll > 0.88) type = "magnet";
        else if (roll > 0.81) type = "boost";
        else if (roll > (zoneDeep ? 0.66 : 0.74)) type = "bomb";
        else if (roll > (zoneDeep ? 0.42 : 0.56)) type = "gem";
        pickups.push({ depth: spawnedTo, x: 0.12 + Math.random() * 0.76, type, taken: false });
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

      // Loose dirt sprays from behind the tracks while the rig is moving.
      if (moving && !paused) {
        for (let i = 0; i < 5; i++) {
          const phase = ((now / 5 + i * 29) % 120) / 120;
          const side = i % 2 ? 1 : -1;
          ctx.globalAlpha = (1 - phase) * .42;
          ctx.fillStyle = i % 3 ? "#c69055" : "#745035";
          ctx.beginPath();
          ctx.arc(side * (18 + phase * 24), -31 - phase * 28, 3 + phase * 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (isPlayer) { ctx.shadowColor = color; ctx.shadowBlur = 19; }
      ctx.fillStyle = "rgba(2,10,22,.55)";
      ctx.beginPath(); ctx.ellipse(0, 7, 34, 43, 0, 0, Math.PI * 2); ctx.fill();

      // Heavy crawler tracks and compact drilling body.
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111a25"; rounded(-34, -35, 18, 58, 8); rounded(16, -35, 18, 58, 8);
      ctx.strokeStyle = "#657183"; ctx.lineWidth = 3;
      for (const side of [-25, 25]) {
        ctx.beginPath(); ctx.moveTo(side, -27); ctx.lineTo(side, 15); ctx.stroke();
        for (let tread = -22; tread <= 12; tread += 11) {
          ctx.beginPath(); ctx.arc(side, tread, 4, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.fillStyle = color; rounded(-22, -39, 44, 57, 9);
      ctx.fillStyle = "#18283b"; rounded(-14, -31, 28, 20, 5);
      ctx.fillStyle = "#bcecff"; rounded(-10, -28, 20, 12, 4);
      ctx.fillStyle = "#d8e1e8"; rounded(-13, 14, 26, 12, 4);

      // A large animated auger points in the actual travel direction.
      const spin = now / 55;
      ctx.fillStyle = "#eef2f4";
      ctx.beginPath(); ctx.moveTo(-20, 25); ctx.lineTo(0, 68); ctx.lineTo(20, 25); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#66788b"; ctx.lineWidth = 4;
      for (let ring = 0; ring < 3; ring++) {
        const yy = 31 + ring * 10;
        const half = 17 - ring * 4;
        ctx.beginPath();
        ctx.moveTo(-half, yy + Math.sin(spin + ring) * 3);
        ctx.lineTo(half, yy - Math.sin(spin + ring) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 23, 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Labels remain readable while the machine turns.
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = isPlayer ? "#ffc400" : "#07182f"; rounded(-32, -62, 64, 17, 7);
      ctx.fillStyle = isPlayer ? "#10203a" : "#f4f8ff"; ctx.font = "800 10px Arial"; ctx.textAlign = "center"; ctx.fillText(label.toUpperCase(), 0, -50); ctx.restore();
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
          pops.push({ x: screenX, y: screenY, life: 1, text: "SHIELD!", color: "#40d8ff" });
          return;
        }
        stats.hit = true;
        stunTime = 1.1;
        stats.combo = 1;
        stats.score = Math.max(0, stats.score - 60);
        pops.push({ x: screenX, y: screenY, life: 1, text: "-60", color: "#ff5a3d" });
        return;
      }
      comboTime = 3;
      stats.combo = Math.min(8, stats.combo + 1);
      if (pickup.type === "star") {
        stats.stars += 1;
        const gain = Math.round(10 * stats.combo * starBonus);
        stats.score += gain;
        pops.push({ x: screenX, y: screenY, life: 1, text: `+${gain}`, color: "#ffd12a" });
      } else if (pickup.type === "gem") {
        stats.gems += 1;
        const gain = 100 + stats.combo * 5;
        stats.score += gain;
        pops.push({ x: screenX, y: screenY, life: 1, text: `+${gain}`, color: "#3ad7ff" });
      } else if (pickup.type === "boost") {
        stats.boosts += 1; boostTime = 4.5;
        pops.push({ x: screenX, y: screenY, life: 1, text: "TURBO!", color: "#ffd12a" });
      } else if (pickup.type === "magnet") {
        stats.magnets += 1; magnetTime = 6;
        pops.push({ x: screenX, y: screenY, life: 1, text: "MAGNET!", color: "#ff5a80" });
      } else {
        stats.shields += 1;
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
        const edge = Math.min(0.3, 52 / Math.max(w, 1));
        player.x = Math.max(edge, Math.min(1 - edge, player.x + player.vx * dt * (.19 + drill.speed * .017) * speedMul));
        player.targetDepth = Math.max(0, player.targetDepth + player.vy * dt * (7 + drill.power * 1.1) * speedMul);
        if (!horizontal && !vertical && stunTime <= 0) player.targetDepth += dt * 2.1;
        player.depth += (player.targetDepth - player.depth) * Math.min(1, dt * 6);

        stats.depth = Math.floor(player.depth);
        stats.score += dt * 4; // depth pressure keeps the race moving

        rivals.forEach((rival, index) => {
          const lateral = Math.sin(now / 1400 + index * 3) * .015;
          rival.depth += dt * rival.speed * (index ? .95 : 1.05) + Math.sin(now / 900 + index) * dt;
          const rivalEdge = Math.min(0.3, 52 / Math.max(w, 1));
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

        if (Math.floor(now / 200) % 2 === 0) onStats({ ...stats, score: Math.floor(stats.score) });
        if (timeLeft <= 0 && !finishRef.current) {
          finishRef.current = true;
          onFinish({ ...stats, score: Math.floor(stats.score) });
          return;
        }
      }

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

  useEffect(() => {
    if (screen !== "countdown") return;
    setCountdown(3);
    let value = 3;
    const timer = window.setInterval(() => {
      value -= 1;
      if (value <= 0) { window.clearInterval(timer); setStats(emptyStats()); setRunId((id) => id + 1); setScreen("game"); }
      else setCountdown(value);
    }, 850);
    return () => window.clearInterval(timer);
  }, [screen]);

  const finishGame = useCallback((finalStats: GameStats) => { setStats(finalStats); setScreen("results"); setPaused(false); }, []);
  const updateStats = useCallback((next: GameStats) => setStats(next), []);
  const begin = () => setScreen("character");
  const you = characters.find((item) => item.id === character) ?? characters[0]!;

  const board = [
    { name: `YOU · ${you.name.toUpperCase()}`, score: stats.score, you: true },
    ...stats.rivals.map((rival) => ({ name: rival.name, score: rival.score, you: false })),
  ].sort((a, b) => b.score - a.score);

  if (screen === "game") {
    return (
      <main className="game-screen">
        <GameCanvas key={runId} selectedCharacter={character} selectedDrill={drill} paused={paused} onStats={updateStats} onFinish={finishGame} />
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
        {paused && <div className="modal-scrim"><div className="game-modal"><span className="modal-icon">⛏️</span><h2>PAUSED</h2><p>Catch your breath. The treasure will wait.</p><Button variant="arcade" size="xl" onClick={() => setPaused(false)}><Play /> Resume</Button><Button variant="metal" size="lg" onClick={() => { setPaused(false); setScreen("menu"); }}><Home /> Quit to menu</Button></div></div>}
      </main>
    );
  }

  return (
    <main className="arcade-shell">
      <img src={menuArt} width={1536} height={1024} alt="Three Drill War racers charging through a crystal cavern" className="menu-art" />
      <div className="art-vignette" />
      {screen === "menu" && <section className="menu-stage"><Brand /><p className="tagline">DIG DEEP <i /> COLLECT <i /> CONQUER</p><div className="menu-actions"><Button variant="arcade" size="hero" onClick={begin}><Play /> Start game</Button><div><Button variant="metal" size="lg" onClick={() => setScreen("howto")}><BookOpen /> How to play</Button><Button variant="metal" size="lg" onClick={() => setScreen("settings")}><Settings /> Settings</Button></div></div><span className="version">ARCADE EDITION · v1.0</span></section>}

      {screen === "howto" && <section className="panel-screen"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => setScreen("menu")} aria-label="Back to menu"><Home /></Button></div><h1>HOW TO PLAY</h1><div className="howto-grid">
        <article><span className="key-cluster">W<br />A S D</span><h3>Move & drill</h3><p>Use WASD, arrow keys, or the touch controls to race underground.</p></article>
        <article><span className="how-icon">⭐ 💎</span><h3>Grab treasure</h3><p>Stars are worth 10 × your combo, gems are worth 100. Keep collecting to hold the combo.</p></article>
        <article><span className="how-icon">⚡ 🧲 🛡</span><h3>Use power-ups</h3><p>Turbo speeds you up, the magnet vacuums treasure, a shield absorbs one blast.</p></article>
        <article><span className="how-icon">💣 🔥</span><h3>Dodge danger</h3><p>Bombs cost 60 points, break your combo and stun the drill for a second.</p></article>
      </div><div className="tip-strip"><Zap /> The final 10 seconds trigger a cave collapse. Keep moving!</div><Button variant="arcade" size="xl" onClick={() => setScreen("menu")}><Home /> Back to menu</Button></section>}

      {screen === "settings" && <section className="panel-screen settings-panel"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => setScreen("menu")} aria-label="Back to menu"><Home /></Button></div><h1>SETTINGS</h1><div className="settings-list"><button className="setting-control" onClick={() => setSound((value) => !value)}><span>{sound ? <Volume2 /> : <VolumeX />}</span><div><strong>Sound effects</strong><small>Drills, gems, hazards and countdowns</small></div><i className={sound ? "toggle active" : "toggle"} /></button><div className="setting-control"><span><Gauge /></span><div><strong>Game speed</strong><small>Arcade — fast, fair and competitive</small></div><b>ARCADE</b></div></div><Button variant="arcade" size="xl" onClick={() => setScreen("menu")}><Home /> Done</Button></section>}

      {screen === "character" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 1 OF 2</span></div><h1>CHOOSE YOUR DRILLER</h1><p className="screen-subtitle">Every racer has a different edge underground.</p><div className="selection-grid">{characters.map((item) => <button key={item.id} className={`select-card ${character === item.id ? "selected" : ""}`} onClick={() => setCharacter(item.id)}><span className={`character-portrait ${item.color}`}><img src={item.art} width={512} height={512} loading="lazy" alt={`${item.name}, a Drill War racer`} /></span><h2>{item.name}</h2><p>{item.trait}</p><strong>{item.perk}</strong><span className="selected-label">{character === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => setScreen("menu")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => setScreen("drill")}>Choose drill <ArrowRight /></Button></div></section>}

      {screen === "drill" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 2 OF 2</span></div><h1>CHOOSE YOUR DRILL</h1><p className="screen-subtitle">Pick a machine built for your racing style.</p><div className="selection-grid">{drills.map((item) => <button key={item.id} className={`select-card drill-card ${drill === item.id ? "selected" : ""}`} onClick={() => setDrill(item.id)}><span className="drill-portrait">{item.icon}</span><h2>{item.name}</h2><p>{item.trait}</p><div className="drill-stats"><label>Speed <StatPips value={item.speed} /></label><label>Power <StatPips value={item.power} /></label><label>Control <StatPips value={item.control} /></label></div><span className="selected-label">{drill === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => setScreen("character")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => setScreen("countdown")}><Play /> Start race</Button></div></section>}

      {screen === "countdown" && <section className="countdown-stage"><p>GET READY!</p><strong key={countdown}>{countdown}</strong><span>{you.name} · {drills.find((d) => d.id === drill)?.name}</span></section>}

      {screen === "results" && <section className="panel-screen results-screen"><Brand compact /><div className="winner-title"><Trophy /><div><small>EXPEDITION COMPLETE</small><h1>{board[0]?.you ? "YOU WIN!" : `${board[0]?.name} WINS!`}</h1></div></div><div className="result-score"><img src={you.art} width={512} height={512} loading="lazy" alt="" className="hud-avatar" /><div><small>FINAL SCORE</small><strong>{stats.score.toLocaleString()}</strong></div></div><div className="result-stats"><div><Star /><strong>{stats.stars}</strong><small>Stars</small></div><div><Gem /><strong>{stats.gems}</strong><small>Gems</small></div><div><ArrowDown /><strong>{stats.depth}m</strong><small>Depth</small></div><div><Magnet /><strong>{stats.boosts + stats.magnets + stats.shields}</strong><small>Power-ups</small></div></div><div className="final-board"><h3>FINAL LEADERBOARD</h3>{board.map((entry, index) => <div key={entry.name} className={entry.you ? "winner-row" : ""}><b>{index + 1}</b><span>{entry.name}</span><strong>{entry.score.toLocaleString()}</strong></div>)}</div><div className="selection-actions"><Button variant="arcade" size="xl" onClick={() => setScreen("countdown")}><RotateCcw /> Race again</Button><Button variant="metal" size="lg" onClick={() => setScreen("drill")}><Settings /> Change drill</Button></div></section>}
    </main>
  );
}
