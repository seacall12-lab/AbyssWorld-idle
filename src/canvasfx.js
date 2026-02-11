// Minimal 2D FX system for Canvas UI (no external assets)
const TAU = Math.PI * 2;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rnd = (a,b)=>a+Math.random()*(b-a);

const makeSpark = (x,y,color,speed=240)=>({
  k:"spark", x,y,
  vx:rnd(-1,1)*speed,
  vy:rnd(-1.2,-0.2)*speed,
  t:0, life:rnd(0.25,0.55),
  size:rnd(1.5,3.4),
  color
});
const makeText = (x,y,text,color,big=false)=>({
  k:"text", x,y,
  vx:rnd(-25,25),
  vy:rnd(-95,-130),
  t:0, life: big?0.95:0.8,
  text, color, big
});
const makeSlash = (x,y,color,thick=10)=>({
  k:"slash", x,y,
  rot:rnd(-0.85,0.85),
  t:0, life:0.18,
  color, thick
});
const makeRing = (x,y,color)=>({
  k:"ring", x,y,
  t:0, life:0.35,
  r0:rnd(8,14),
  r1:rnd(42,64),
  color
});

export const createFx = () => {
  const P = [];
  const state = {
    shakeT:0, shakePow:0,
    flash:0,
    enemyName:"",
    enemyBoss:false,
    autoPulse:0
  };

  const themeForEnemy = (name) => {
    if (!name) return { body:"#3b82f6", accent:"#93c5fd" };
    if (name.includes("슬라임")) return { body:"#3b82f6", accent:"#93c5fd" };
    if (name.includes("고블린")) return { body:"#22c55e", accent:"#86efac" };
    if (name.includes("늑대")) return { body:"#94a3b8", accent:"#e2e8f0" };
    if (name.includes("스켈레톤")) return { body:"#e5e7eb", accent:"#9ca3af" };
    if (name.includes("오크")) return { body:"#84cc16", accent:"#bef264" };
    if (name.includes("다크메이지")) return { body:"#a78bfa", accent:"#ddd6fe" };
    if (name.includes("가고일")) return { body:"#94a3b8", accent:"#cbd5e1" };
    if (name.includes("리치")) return { body:"#f59e0b", accent:"#fde68a" };
    return { body:"#3b82f6", accent:"#93c5fd" };
  };

  const onHit = (meta, pos) => {
    const dmg = meta?.dmg ?? 0;
    const crit = !!meta?.crit;
    const big = !!meta?.big;
    const color = crit ? "#fbbf24" : "#e8eef6";
    const x = pos?.x ?? 0;
    const y = pos?.y ?? 0;

    state.shakePow = Math.min(10, state.shakePow + (crit?5:2.5));
    state.shakeT = 0.08;
    state.flash = Math.min(1, state.flash + (crit?0.55:0.25));

    const sparks = crit ? 16 : 10;
    for (let i=0;i<sparks;i++) P.push(makeSpark(x+rnd(-10,10), y+rnd(-10,10), crit?"#fbbf24":"#93c5fd", crit?340:260));
    P.push(makeSlash(x+rnd(-8,8), y+rnd(-8,8), crit?"#fbbf24":"rgba(147,197,253,.95)", crit?14:10));
    const txt = Math.max(0, dmg) >= 1000 ? `${Math.floor(dmg).toLocaleString()}` : `${Math.floor(dmg)}`;
    P.push(makeText(x+rnd(-8,8), y+rnd(-8,8), (crit?"CRIT ":"")+txt, color, big || crit));
  };

  const onSkillCast = (meta, pos, playerPos) => {
    const key = meta?.key || "";
    const kind = meta?.kind || "";
    const x = pos?.x ?? 0;
    const y = pos?.y ?? 0;
    const px = playerPos?.x ?? x;
    const py = playerPos?.y ?? y;

    if (kind === "dmg" || key==="power" || key==="execute" || key==="pet_burst") {
      state.flash = Math.min(1, state.flash + 0.35);
      state.shakePow = Math.min(12, state.shakePow + 4);
      state.shakeT = 0.11;
      P.push(makeRing(x,y,"rgba(251,191,36,.85)"));
      P.push(makeSlash(x,y,"rgba(251,191,36,.95)", 16));
      for (let i=0;i<14;i++) P.push(makeSpark(x,y,"#fbbf24", 360));
    } else {
      // buffs / utility
      const col = key==="lucky" ? "rgba(251,191,36,.85)"
                : key==="haste" ? "rgba(34,197,94,.85)"
                : key==="berserk" ? "rgba(239,68,68,.85)"
                : "rgba(59,130,246,.85)";
      P.push(makeRing(px,py,col));
      for (let i=0;i<10;i++) P.push(makeSpark(px,py,col, 260));
      P.push(makeText(px,py-20, key.toUpperCase(), col, true));
    }
  };

  const tick = (dt) => {
    // decay shake/flash
    state.shakeT = Math.max(0, state.shakeT - dt);
    state.shakePow = state.shakePow * Math.pow(0.001, dt); // fast decay
    state.flash = Math.max(0, state.flash - dt*1.6);

    for (let i=P.length-1;i>=0;i--){
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life){ P.splice(i,1); continue; }
      if (p.k==="spark" || p.k==="text"){
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        if (p.k==="spark") p.vy += 520*dt;
      } else if (p.k==="ring"){
        // nothing
      }
    }
  };

  const applyShake = (ctx) => {
    if (state.shakeT <= 0 || state.shakePow < 0.2) return;
    const mag = state.shakePow * (state.shakeT/0.11);
    ctx.translate(rnd(-mag, mag), rnd(-mag, mag));
  };

  const render = (ctx) => {
    // particles are drawn in current canvas space
    for (const p of P){
      const k = p.k;
      const a = clamp(1 - p.t/p.life, 0, 1);
      if (k==="spark"){
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (k==="text"){
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.font = `${p.big?18:14}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else if (k==="slash"){
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-42, -p.thick/2, 84, p.thick, p.thick/2);
        ctx.fill();
        ctx.restore();
      } else if (k==="ring"){
        const t = p.t/p.life;
        const r = p.r0 + (p.r1 - p.r0) * t;
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  };

  const renderFlash = (ctx, w, h) => {
    if (state.flash <= 0) return;
    ctx.globalAlpha = clamp(state.flash, 0, 0.35);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha = 1;
  };

  return {
    setEnemy: (name,boss)=>{ state.enemyName = name||""; state.enemyBoss = !!boss; },
    onHit,
    onSkillCast,
    tick,
    applyShake,
    render,
    renderFlash
  };
};
