// Canvas battle + hit/skill FX (mobile-friendly)
// - No external assets required.
// - Draws a small "battle stage" and spawns particles, flashes, screen shake, and damage popups.

const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

const enemyTheme = (name) => {
  // Returns { body, accent }
  if (!name) return { body: "#3b82f6", accent: "#93c5fd" }; // default blue
  if (name.includes("슬라임")) return { body: "#3b82f6", accent: "#93c5fd" };
  if (name.includes("고블린")) return { body: "#22c55e", accent: "#86efac" };
  if (name.includes("늑대")) return { body: "#94a3b8", accent: "#e2e8f0" };
  if (name.includes("스켈레톤")) return { body: "#e5e7eb", accent: "#9ca3af" };
  if (name.includes("오크")) return { body: "#84cc16", accent: "#bef264" };
  if (name.includes("다크메이지")) return { body: "#a78bfa", accent: "#ddd6fe" };
  if (name.includes("가고일")) return { body: "#94a3b8", accent: "#64748b" };
  if (name.includes("리치")) return { body: "#f59e0b", accent: "#fcd34d" };
  return { body: "#3b82f6", accent: "#93c5fd" };
};

const makeSpark = (x, y, color, speed=220) => ({
  kind: "spark",
  x, y,
  vx: rnd(-1, 1) * speed,
  vy: rnd(-1.2, -0.2) * speed,
  life: rnd(0.25, 0.55),
  t: 0,
  size: rnd(1.5, 3.5),
  color,
});

const makeText = (x, y, text, color, big=false) => ({
  kind: "text",
  x, y,
  vx: rnd(-25, 25),
  vy: rnd(-90, -120),
  life: big ? 0.95 : 0.8,
  t: 0,
  text,
  color,
  big
});

const makeSlash = (x, y, color, thick=10) => ({
  kind: "slash",
  x, y,
  rot: rnd(-0.8, 0.8),
  life: 0.18,
  t: 0,
  color,
  thick
});

const makeRing = (x, y, color, r0=10, r1=58, life=0.35) => ({
  kind: "ring",
  x, y,
  r0, r1,
  life,
  t: 0,
  color
});

export const createFxEngine = (canvas) => {
  const ctx = canvas.getContext("2d", { alpha: true });

  // Polyfill for roundRect on older browsers
  if (!ctx.roundRect) {
    ctx.roundRect = function(x, y, w, h, r) {
      const rr = Array.isArray(r) ? r[0] : r;
      const rad = Math.max(0, Math.min(rr || 0, Math.min(w, h) / 2));
      this.beginPath();
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
      return this;
    };
  }

  const state = {
    w: 0, h: 0, dpr: 1,
    time: 0,
    shake: 0,
    flash: 0,
    enemyName: "",
    enemyBoss: false,
    particles: [],
    // for auto dps visual ticks
    autoPulse: 0,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    state.dpr = dpr;
    state.w = Math.floor(rect.width * dpr);
    state.h = Math.floor(rect.height * dpr);
    canvas.width = state.w;
    canvas.height = state.h;
  };

  const clear = () => {
    ctx.clearRect(0, 0, state.w, state.h);
  };

  const spawnHit = ({dmg=0, crit=false, source="auto", skillKey=null, big=false}) => {
    const theme = enemyTheme(state.enemyName);
    const cx = state.w * 0.66;
    const cy = state.h * 0.52;

    // screen shake
    state.shake = Math.max(state.shake, big ? 10 : (crit ? 7 : 4));

    // flash on strong hit
    if (big || crit) state.flash = Math.max(state.flash, 0.22);

    // slash + sparks
    state.particles.push(makeSlash(cx, cy, crit ? "#fde047" : theme.accent, big ? 14 : 10));
    for (let i=0;i<(big?18:(crit?12:8));i++){
      state.particles.push(makeSpark(cx + rnd(-18,18), cy + rnd(-14,14), crit ? "#fde047" : theme.accent, big?320:240));
    }

    // dmg text
    const txt = Math.max(1, Math.floor(dmg)).toLocaleString();
    const col = crit ? "#fde047" : (big ? "#ffffff" : "#e2e8f0");
    state.particles.push(makeText(cx + rnd(-16,16), cy - rnd(10,28), crit ? `CRIT ${txt}` : txt, col, big));

    // skill signature effects
    if (skillKey === "berserk") {
      // shouldn't be dmg skill; ignore
    }
  };

  const spawnSkill = ({key, kind}) => {
    const px = state.w * 0.30;
    const py = state.h * 0.58;
    const ex = state.w * 0.66;
    const ey = state.h * 0.52;

    if (key === "power") {
      state.flash = Math.max(state.flash, 0.18);
      state.shake = Math.max(state.shake, 8);
      state.particles.push(makeSlash(ex, ey, "#e2e8f0", 16));
      state.particles.push(makeRing(ex, ey, "#93c5fd", 8, 70, 0.28));
    } else if (key === "execute") {
      state.flash = Math.max(state.flash, 0.24);
      state.shake = Math.max(state.shake, 11);
      for (let i=0;i<2;i++) state.particles.push(makeSlash(ex + rnd(-10,10), ey + rnd(-8,8), "#fb7185", 18));
      state.particles.push(makeRing(ex, ey, "#fb7185", 10, 86, 0.32));
    } else if (key === "berserk") {
      state.particles.push(makeRing(px, py, "#fb7185", 12, 84, 0.55));
      for (let i=0;i<12;i++) state.particles.push(makeSpark(px + rnd(-8,8), py + rnd(-8,8), "#fb7185", 220));
    } else if (key === "haste") {
      state.particles.push(makeRing(px, py, "#38bdf8", 10, 78, 0.45));
      for (let i=0;i<10;i++) state.particles.push(makeSpark(px + rnd(-8,8), py + rnd(-8,8), "#38bdf8", 260));
    } else if (key === "lucky") {
      state.particles.push(makeRing(px, py, "#fbbf24", 10, 80, 0.55));
      for (let i=0;i<14;i++) state.particles.push(makeSpark(px + rnd(-10,10), py + rnd(-10,10), "#fbbf24", 250));
      state.particles.push(makeText(px, py-34, "LUCKY!", "#fbbf24", true));
    } else {
      // generic
      state.particles.push(makeRing(ex, ey, "#a78bfa", 10, 78, 0.35));
    }
  };

  const tickParticles = (dt) => {
    const keep = [];
    for (const p of state.particles) {
      p.t += dt;
      if (p.t >= p.life) continue;
      const k = 1 - (p.t / p.life);
      if (p.kind === "spark") {
        p.vy += 520 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size = Math.max(0.2, p.size * (0.98 + 0.02*k));
      } else if (p.kind === "text") {
        p.vy += 220 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === "slash") {
        // no movement
      } else if (p.kind === "ring") {
        // no movement
      }
      keep.push(p);
    }
    state.particles = keep;

    state.shake = Math.max(0, state.shake - 18 * dt);
    state.flash = Math.max(0, state.flash - 2.4 * dt);
  };

  const drawBackground = () => {
    // arena backdrop
    const w = state.w, h = state.h;
    // floor
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, h*0.72, w, h*0.28);
    // horizon glow
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.03)");
    g.addColorStop(0.65, "rgba(255,255,255,0.01)");
    g.addColorStop(1, "rgba(0,0,0,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  const drawPlayer = (S) => {
    const w = state.w, h = state.h;
    const x = w*0.30, y = h*0.58;
    // base body
    ctx.save();
    ctx.translate(x, y);

    // buff auras (read from S)
    const t = state.time;
    const tNow = Date.now();
    const berserk = S && (tNow < (S.buffs?.expires?.berserk||0));
        const haste = S && (tNow < (S.buffs?.expires?.haste||0));
        const lucky = S && (tNow < (S.buffs?.expires?.lucky||0));

    if (berserk) {
      ctx.globalAlpha = 0.22 + 0.08*Math.sin(t*6);
      ctx.strokeStyle = "#fb7185";
      ctx.lineWidth = 6 * state.dpr;
      ctx.beginPath(); ctx.arc(0, 0, 34*state.dpr, 0, TAU); ctx.stroke();
    }
    if (haste) {
      ctx.globalAlpha = 0.18 + 0.08*Math.sin(t*10);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 4 * state.dpr;
      for (let i=0;i<5;i++){
        ctx.beginPath();
        ctx.moveTo(-42*state.dpr, (-18+i*9)*state.dpr);
        ctx.lineTo(-18*state.dpr, (-10+i*9)*state.dpr);
        ctx.stroke();
      }
    }
    if (lucky) {
      ctx.globalAlpha = 0.22 + 0.06*Math.sin(t*7);
      ctx.fillStyle = "#fbbf24";
      for (let i=0;i<6;i++){
        const a = t*1.8 + i;
        ctx.beginPath();
        ctx.arc(Math.cos(a)*40*state.dpr, Math.sin(a)*18*state.dpr, 3.5*state.dpr, 0, TAU);
        ctx.fill();
      }
    }

    // character
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(226,232,240,0.92)";
    ctx.beginPath(); ctx.arc(0, -18*state.dpr, 12*state.dpr, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(59,130,246,0.85)";
    ctx.beginPath();
    ctx.roundRect(-16*state.dpr, -6*state.dpr, 32*state.dpr, 36*state.dpr, 10*state.dpr);
    ctx.fill();

    // sword
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.beginPath();
    ctx.moveTo(18*state.dpr, 2*state.dpr);
    ctx.lineTo(40*state.dpr, -12*state.dpr);
    ctx.lineTo(44*state.dpr, -8*state.dpr);
    ctx.lineTo(22*state.dpr, 6*state.dpr);
    ctx.closePath(); ctx.fill();

    ctx.restore();
  };

  const drawEnemy = () => {
    const w = state.w, h = state.h;
    const x = w*0.66, y = h*0.52;
    const theme = enemyTheme(state.enemyName);

    ctx.save();
    ctx.translate(x, y);

    const boss = state.enemyBoss;
    const pulse = 1 + (boss ? 0.03*Math.sin(state.time*5) : 0.02*Math.sin(state.time*4));
    ctx.scale(pulse, pulse);

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.beginPath();
    ctx.ellipse(0, 34*state.dpr, 34*state.dpr, 12*state.dpr, 0, 0, TAU);
    ctx.fill();

    // body
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = theme.body;
    ctx.beginPath();
    ctx.roundRect(-28*state.dpr, -22*state.dpr, 56*state.dpr, 56*state.dpr, 18*state.dpr);
    ctx.fill();

    // face
    ctx.fillStyle = "rgba(11,15,20,0.75)";
    ctx.beginPath(); ctx.arc(-10*state.dpr, -4*state.dpr, 3.5*state.dpr, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(10*state.dpr, -4*state.dpr, 3.5*state.dpr, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(11,15,20,0.55)";
    ctx.lineWidth = 3 * state.dpr;
    ctx.beginPath(); ctx.moveTo(-12*state.dpr, 10*state.dpr); ctx.quadraticCurveTo(0, 16*state.dpr, 12*state.dpr, 10*state.dpr); ctx.stroke();

    // boss crown
    if (boss) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(-18*state.dpr, -30*state.dpr);
      ctx.lineTo(-10*state.dpr, -44*state.dpr);
      ctx.lineTo(0, -30*state.dpr);
      ctx.lineTo(10*state.dpr, -44*state.dpr);
      ctx.lineTo(18*state.dpr, -30*state.dpr);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  };

  const drawParticles = () => {
    for (const p of state.particles) {
      const k = 1 - (p.t / p.life);
      if (p.kind === "spark") {
        ctx.globalAlpha = 0.9 * k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * state.dpr, 0, TAU);
        ctx.fill();
      } else if (p.kind === "text") {
        ctx.globalAlpha = 0.95 * k;
        ctx.fillStyle = p.color;
        ctx.font = `${(p.big ? 18 : 14) * state.dpr}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === "slash") {
        ctx.save();
        ctx.globalAlpha = 0.85 * k;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.thick * state.dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-40*state.dpr, -20*state.dpr);
        ctx.lineTo(40*state.dpr, 20*state.dpr);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "ring") {
        const r = p.r0 + (p.r1 - p.r0) * (p.t / p.life);
        ctx.globalAlpha = 0.55 * k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * state.dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * state.dpr, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  const render = (S) => {
    // resize on demand (cheap check)
    if (canvas.width === 0 || canvas.height === 0) resize();

    clear();

    // camera shake
    const sh = state.shake;
    const sx = (Math.random()*2-1) * sh * state.dpr;
    const sy = (Math.random()*2-1) * sh * state.dpr;

    ctx.save();
    ctx.translate(sx, sy);

    drawBackground();
    drawPlayer(S);
    drawEnemy();
    drawParticles();

    ctx.restore();

    // global flash
    if (state.flash > 0) {
      ctx.globalAlpha = clamp(state.flash, 0, 0.35);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(0, 0, state.w, state.h);
      ctx.globalAlpha = 1;
    }
  };

  const tick = (dt, S) => {
    state.time += dt;

    // visual auto pulse (not tied to exact DPS; just for feedback)
    const autoOn = !!(S && S.auto);
    if (autoOn && S.enemy && S.enemy.hp > 0) {
      state.autoPulse += dt;
      if (state.autoPulse >= 0.38) {
        state.autoPulse = 0;
        // approximate per-pulse damage amount for display
        const approx = (S._derived?.dpsTotal || 0) * 0.38;
        if (approx > 0.2) spawnHit({ dmg: approx, crit: false, source: "auto" });
      }
    } else {
      state.autoPulse = 0;
    }

    tickParticles(dt);
    render(S);
  };

  // public API
  const api = {
    resize,
    setEnemy: (name, boss) => {
      state.enemyName = name || "";
      state.enemyBoss = !!boss;
    },
    onHit: (meta) => spawnHit(meta || {}),
    onSkillCast: (meta) => spawnSkill(meta || {}),
    tick,
  };

  // listen resize
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  return api;
};
