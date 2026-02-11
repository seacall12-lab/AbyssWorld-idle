import { clamp, safeJsonParse, rand01 } from "./utils.js";

  const loadImage = (url) => new Promise((res, rej)=>{
    const im = new Image();
    im.onload = ()=>res(im);
    im.onerror = rej;
    im.src = url;
  });

import { baseState, loadState, saveState, logPush, STORAGE_KEY } from "./state.js";
import { ensureStageEnemy, computeDerived, addExp, respawnEnemy, dealDamage, onKill } from "./combat.js";
import { tryEnhance, sellItem, equipItem, unequip, toggleSynthMode, toggleSynthSelect, doSynthesis, makeItem } from "./items.js";
import { castSkill, autoCastSkills, tickSkillCooldowns } from "./skills.js";
import { unlockPetSlot, levelUpPet, setPetForSlot, tickPetSkills } from "./pets.js";
import { createUi } from "./canvasui.js";
import { createFx } from "./canvasfx.js";
import { petUnlockCost, petLevelUpCost, setMonsterTable } from "./balance.js";

const fmt = (n) => {
  const x = Math.floor(n||0);
  if (x >= 1_000_000_000) return (x/1_000_000_000).toFixed(2)+"B";
  if (x >= 1_000_000) return (x/1_000_000).toFixed(2)+"M";
  if (x >= 10_000) return (x/1_000).toFixed(1)+"K";
  return x.toLocaleString();
};
const pct = (p) => `${Math.round((p||0)*100)}%`;

const rarityColor = (rar) => {
  if (rar==="E") return "rgba(167,139,250,.95)";
  if (rar==="R") return "rgba(59,130,246,.95)";
  if (rar==="U") return "rgba(34,197,94,.95)";
  return "rgba(148,163,184,.9)";
};

const loadJson = async (url) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load: ${url}`);
  return await res.json();
};

const upgradeDefs = [
  { key:"atk",  name:"근력", desc:"+2 공격력", cost:(lvl)=>Math.floor(20 * Math.pow(1.18, lvl)) },
  { key:"aspd", name:"민첩", desc:"+0.08 공격속도", cost:(lvl)=>Math.floor(30 * Math.pow(1.22, lvl)) },
  { key:"crit", name:"치명 단련", desc:"+1% 치명타 확률", cost:(lvl)=>Math.floor(30 * Math.pow(1.20, lvl)) },
  { key:"gold", name:"행운의 손", desc:"+3% 골드 보너스", cost:(lvl)=>Math.floor(25 * Math.pow(1.19, lvl)) },
];

const buyUpgrade = (S, key) => {
  const def = upgradeDefs.find(x=>x.key===key);
  if (!def) return false;
  const lvl = S.upgrades[key] || 0;
  const cost = def.cost(lvl);
  if (S.gold < cost) return false;
  S.gold -= cost;
  S.upgrades[key] = lvl + 1;
  saveState(S);
  return true;
};

const clampScroll = (i, min, max) => Math.max(min, Math.min(max, i));

(async () => {
  const canvas = document.getElementById("game");
  if (!canvas) throw new Error("canvas not found");

  // create UI+FX
  const { ui, panel, text, button, pill, bar } = createUi(canvas);
  const fx = createFx();

  // table loading
  const tables = {
    weapons: await loadJson("./data/weapons.json"),
    armors:  await loadJson("./data/armors.json"),
    rings:   await loadJson("./data/rings.json"),
    pets:    await loadJson("./data/pets.json"),
    petSkills: await loadJson("./data/pet_skills.json"),
    monsters: await loadJson("./data/monsters.json"),
    skills: await loadJson("./data/skills.json"),
    classes: await loadJson("./data/classes.json"),
  };

  // SD sprite atlas (dark fantasy SD style)
  const sdAtlas = { img: await loadImage("./assets/sd_atlas.png"), meta: await loadJson("./assets/sd_atlas.json") };

  if (tables.monsters && tables.monsters.monsters) setMonsterTable(tables.monsters.monsters);

  const petsById = new Map(tables.pets.map(p=>[p.id,p]));
  const petSkillsById = new Map(tables.petSkills.map(p=>[p.id,p]));

  // state
  const S = loadState((s)=>computeDerived(s, tables));
  ensureStageEnemy(S);

  if (S._offlineExpGain) {
    addExp(S, S._offlineExpGain, logPush);
    delete S._offlineExpGain;
    saveState(S);
  }

  // local UI state (not saved)
  const U = {
    tab: "battle", // battle | items | pets | skills | settings
    invScroll: 0,
    invSel: null,
    toast: { t:0, msg:"" },
    autoVisPulse: 0,
    autoFxAcc: 0,
    needRerender: true
  };

  const toast = (msg, sec=1.2) => { U.toast.msg = msg; U.toast.t = sec; };

  // canvas sizing (draw in CSS pixels; devicePixelRatio handled by transform)
  const resize = () => {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ui.ctx.setTransform(dpr,0,0,dpr,0,0);
    ui.setSize(rect.width, rect.height, dpr);
  };
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  // prevent iOS rubber band / double-tap zoom quirks
  canvas.addEventListener("touchstart", (e)=>e.preventDefault(), { passive:false });

  const dealDamageFx = (S, dmg, meta) => {
    const before = S.enemy.hp;
    dealDamage(S, dmg, meta);
    const dealt = Math.max(0, before - S.enemy.hp);
    if (dealt > 0.05) {
      // we will spawn effects in render using latest layout positions
      fx.onHit({ dmg: dealt, crit: !!meta?.crit, big: !!meta?.big }, layout.enemyCenter);
    }
  };

  const castSkillFx = (key, d) => {
    castSkill({S, key, d, dealDamage: dealDamageFx, logPush, saveState, fx:{
      onSkillCast: (meta)=>fx.onSkillCast(meta, layout.enemyCenter, layout.playerCenter)
    }});
  };

  // input
  const pointerXY = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    const {x,y} = pointerXY(e);
    ui.pointer.x = x; ui.pointer.y = y; ui.pointer.down = true;

    // begin drag scroll on inventory list
    if (U.tab === "items" && layout.itemsListRect){
      const r = layout.itemsListRect;
      if (x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h){
        U.invDrag.active = true;
        U.invDrag.y0 = y;
        U.invDrag.scroll0 = U.invScroll;
      }
    }

    // taps
    const z = ui.hit(x,y);
    if (z && typeof z.fn === "function") {
      z.fn({x,y});
      U.needRerender = true;
    }
  };

  const handlePointerMove = (e) => {
    const {x,y} = pointerXY(e);
    ui.pointer.x = x; ui.pointer.y = y;

    if (ui.pointer.down && U.invDrag.active){
      const dy = y - U.invDrag.y0;
      const step = Math.max(18, (layout.itemsRowH||46));
      const deltaRows = Math.floor(dy / step);
      const invLen = (S.inventory||[]).length;
      const visible = layout.itemsVisible||8;
      const maxScroll = Math.max(0, invLen - visible);
      U.invScroll = clamp(U.invDrag.scroll0 + deltaRows, 0, maxScroll);
    }
  };

  const handlePointerUp = (e) => {
    ui.pointer.down = false;
    U.invDrag.active = false;
  };
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);

  // autosave
  setInterval(()=>saveState(S), 5000);

  // layout object updated each frame
  const layout = {
    pad: 12,
    topH: 64,
    bottomH: 78,
    enemyCenter: {x:0,y:0},
    playerCenter:{x:0,y:0},
    battleRect: {x:0,y:0,w:0,h:0}
  };

  const drawTopBar = (d) => {
    const w = ui.w, h = ui.h;
    const p = layout.pad;
    panel(p, p, w-2*p, layout.topH, 18, "rgba(15,23,42,.82)", "rgba(148,163,184,.22)");
    text("AbyssWorld Idle", p+16, p+24, 16, "#e8eef6", "left", "middle", 900);

    // gold + stage
    text(`G ${fmt(S.gold)}`, w-p-16, p+22, 16, "rgba(251,191,36,.95)", "right", "middle", 900);
    text(`STAGE ${S.stage}`, w-p-16, p+44, 12, "rgba(148,163,184,.95)", "right", "middle", 800);

    // small status
    text(`Lv.${S.player.level} · DPS ${fmt(d.dpsTotal)}`, p+16, p+46, 12, "rgba(148,163,184,.95)", "left", "middle", 750);
  };

  const drawBottomTabs = () => {
    const w = ui.w, h = ui.h;
    const p = layout.pad;
    const y = h - layout.bottomH - p;
    panel(p, y, w-2*p, layout.bottomH, 18, "rgba(15,23,42,.84)", "rgba(148,163,184,.22)");

    const tabs = [
      { key:"battle", label:"전투" },
      { key:"items", label:"장비" },
      { key:"pets", label:"펫" },
      { key:"skills", label:"스킬" },
      { key:"settings", label:"설정" },
    ];
    const bw = (w-2*p - 16) / tabs.length;
    for (let i=0;i<tabs.length;i++){
      const t = tabs[i];
      const x = p+8 + i*bw;
      const active = U.tab === t.key;
      button(t.label, x, y+10, bw-8, layout.bottomH-20, {
        fill: active ? "rgba(59,130,246,.35)" : "rgba(17,24,39,.45)",
        stroke: active ? "rgba(59,130,246,.55)" : "rgba(148,163,184,.22)",
        size: 14,
        onTap: ()=>{ U.tab = t.key; }
      });
    }
  };

  const drawEnemyArea = (d) => {
    const w = ui.w, h = ui.h;
    const p = layout.pad;
    const y0 = p + layout.topH + 10;
    const availableH = h - (p + layout.topH + layout.bottomH + p) - 20;
    const bh = clamp(availableH * 0.45, 210, 320);
    const br = { x:p, y:y0, w:w-2*p, h:bh };
    layout.battleRect = br;

    // centers
    layout.playerCenter = { x: br.x + br.w*0.28, y: br.y + br.h*0.62 };
    layout.enemyCenter  = { x: br.x + br.w*0.72, y: br.y + br.h*0.52 };

    panel(br.x, br.y, br.w, br.h, 22, "rgba(15,23,42,.6)", "rgba(148,163,184,.18)");

    // stage name
    text(`${S.enemy.boss ? "BOSS" : "MON" } · ${S.enemy.name}`, br.x+18, br.y+20, 14, S.enemy.boss?"rgba(251,191,36,.95)":"rgba(148,163,184,.95)", "left", "middle", 900);

    // hp bar
    const hpP = (S.enemy.hpMax>0) ? (S.enemy.hp / S.enemy.hpMax) : 0;
    bar(br.x+18, br.y+32, br.w-36, 10, hpP, S.enemy.boss ? "rgba(251,191,36,.85)" : "rgba(59,130,246,.85)");
    text(`${Math.floor(S.enemy.hp)} / ${Math.floor(S.enemy.hpMax)}`, br.x+br.w-18, br.y+20, 12, "rgba(148,163,184,.95)", "right", "middle", 800);

    // SD sprite rendering (atlas). Fallback to shapes if atlas missing.
    const pc = layout.playerCenter;
    const ec = layout.enemyCenter;

    const drawAtlas = (key, x, y, size) => {
      const f = sdAtlas?.meta?.frames?.[key];
      if (!f) return false;
      ui.ctx.drawImage(sdAtlas.img, f.x, f.y, f.w, f.h, x-size/2, y-size/2, size, size);
      return true;
    };

    const pSize = 92;
    const eSize = S.enemy.boss ? 120 : 104;

    if (!drawAtlas("player", pc.x, pc.y, pSize)) {
      ui.ctx.save();
      ui.ctx.translate(pc.x, pc.y);
      ui.ctx.fillStyle = "rgba(59,130,246,.9)";
      ui.ctx.beginPath(); ui.ctx.roundRect(-26, -18, 52, 54, 18); ui.ctx.fill();
      ui.ctx.restore();
    }

    const ek = S.enemy.sprite || (S.enemy.boss ? "lich" : "slime");
    if (!drawAtlas(ek, ec.x, ec.y, eSize)) {
      ui.ctx.save();
      ui.ctx.translate(ec.x, ec.y);
      ui.ctx.fillStyle = S.enemy.boss ? "rgba(251,191,36,.85)" : "rgba(148,163,184,.85)";
      ui.ctx.beginPath(); ui.ctx.arc(0, 0, 32, 0, Math.PI*2); ui.ctx.fill();
      ui.ctx.restore();
    }

    // Add hotspots for clicking enemy area = HIT
    ui.addHot(br.x, br.y, br.w, br.h, ()=>clickAttack(d));

    // tips
    text("탭: HIT · 하단 탭에서 장비/펫/스킬", br.x+18, br.y+br.h-18, 12, "rgba(148,163,184,.85)", "left", "middle", 700);
  };

  const clickAttack = (d) => {
    const critRoll = Math.random() < d.crit;
    const dmg = d.atk * 1.6 * (critRoll ? d.critMul : 1);
    dealDamageFx(S, dmg, { source: "click", crit: critRoll, big: critRoll });
    if (S.enemy.hp <= 0) onKill(S, tables, d, logPush, saveState);
  };

  const drawBattleControls = (d) => {
    const p = layout.pad;
    const br = layout.battleRect;
    const y = br.y + br.h + 12;
    const w = ui.w;

    // action row
    const x0 = p;
    const bw = (w - 2*p - 12) / 2;
    button("HIT", x0, y, bw, 56, {
      fill:"rgba(59,130,246,.55)", stroke:"rgba(59,130,246,.75)", size:18,
      onTap: ()=>clickAttack(d)
    });
    button(S.auto ? "AUTO ON" : "AUTO OFF", x0 + bw + 12, y, bw, 56, {
      fill: S.auto ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.25)",
      stroke: S.auto ? "rgba(34,197,94,.55)" : "rgba(239,68,68,.45)",
      onTap: ()=>{ S.auto = !S.auto; saveState(S); toast(S.auto?"AUTO 켜짐":"AUTO 꺼짐"); }
    });

    // stage row
    const y2 = y + 66;
    const bw3 = (w - 2*p - 16) / 3;
    button("STAGE -", x0, y2, bw3, 46, {
      onTap: ()=>{
        S.stage = Math.max(1, S.stage - 1);
        respawnEnemy(S);
        saveState(S);
      }
    });
    button("STAGE +", x0 + bw3 + 8, y2, bw3, 46, {
      onTap: ()=>{
        S.stage += 1;
        respawnEnemy(S);
        saveState(S);
      }
    });
    button(S.autoAdvance ? "자동진행 ON" : "자동진행 OFF", x0 + (bw3+8)*2, y2, bw3, 46, {
      fill: S.autoAdvance ? "rgba(34,197,94,.28)" : "rgba(17,24,39,.45)",
      onTap: ()=>{
        S.autoAdvance = !S.autoAdvance;
        saveState(S);
      }
    });

    // skill row (5)
    const y3 = y2 + 56;
    const gap = 8;
    const sw = (w - 2*p - gap*4) / 5;
    const keys = ["power","execute","berserk","haste","lucky"];
    for (let i=0;i<keys.length;i++){
      const key = keys[i];
      const st = S.skills[key];
      const x = p + i*(sw+gap);
      drawSkillButton(key, st, x, y3, sw, 56, d);
    }

    // auto skill toggle
    const y4 = y3 + 66;
    button(S.autoSkills ? "스킬 자동사용 ON" : "스킬 자동사용 OFF", p, y4, w-2*p, 44, {
      fill: S.autoSkills ? "rgba(34,197,94,.28)" : "rgba(17,24,39,.45)",
      onTap: ()=>{ S.autoSkills = !S.autoSkills; saveState(S); }
    });

    // log lines
    const y5 = y4 + 54;
    panel(p, y5, w-2*p, 120, 18, "rgba(15,23,42,.55)", "rgba(148,163,184,.18)");
    text("로그", p+14, y5+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);
    const lines = (S.log||[]).slice(0,4);
    for (let i=0;i<lines.length;i++){
      text(lines[i], p+14, y5+40+i*18, 12, "rgba(232,238,246,.88)", "left", "middle", 650);
    }
  };

  const drawSkillButton = (key, st, x,y,w,h, d) => {
    const cd = Math.max(0, st?.cd || 0);
    const ready = cd <= 0.01;

    const label = key==="power" ? "파워"
                : key==="execute" ? "처형"
                : key==="berserk" ? "광폭"
                : key==="haste" ? "가속"
                : "행운";

    // main button
    button(label, x,y,w,h, {
      fill: ready ? "rgba(17,24,39,.55)" : "rgba(17,24,39,.35)",
      stroke: ready ? "rgba(148,163,184,.28)" : "rgba(148,163,184,.18)",
      onTap: ()=>{ if (ready) castSkillFx(key, d); else toast(`쿨다운 ${cd.toFixed(1)}s`); }
    });

    // cooldown overlay
    if (!ready){
      ui.ctx.save();
      ui.ctx.globalAlpha = 0.55;
      ui.ctx.fillStyle = "rgba(11,15,20,1)";
      ui.ctx.beginPath();
      ui.ctx.roundRect(x, y, w, h, 14);
      ui.ctx.fill();
      ui.ctx.globalAlpha = 1;
      text(cd.toFixed(1), x+w/2, y+h/2, 14, "rgba(232,238,246,.9)", "center", "middle", 900);
      ui.ctx.restore();
    }

    // auto toggle corner
    const ax = x+6, ay = y+6, aw = 22, ah = 22;
    panel(ax, ay, aw, ah, 8, st?.auto ? "rgba(34,197,94,.9)" : "rgba(148,163,184,.28)", null);
    text("A", ax+aw/2, ay+ah/2+0.5, 12, st?.auto ? "#0b0f14" : "rgba(232,238,246,.85)", "center", "middle", 900);
    ui.addHot(ax, ay, aw, ah, ()=>{
      st.auto = !st.auto;
      saveState(S);
      toast(`${label} 자동 ${st.auto?"ON":"OFF"}`);
    });
  };

  const drawItemsTab = (d) => {
    const p = layout.pad;
    const w = ui.w, h = ui.h;
    const y0 = p + layout.topH + 10;
    const bottomY = h - layout.bottomH - p - 10;

    // equipment panel
    panel(p, y0, w-2*p, 120, 18, "rgba(15,23,42,.6)", "rgba(148,163,184,.18)");
    text("장비", p+14, y0+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    const eq = S.equipment;
    const inv = S.inventory;
    const getItem = (id) => inv.find(x=>x.id===id) || null;

    const slots = [
      { type:"weapon", label:"무기" },
      { type:"armor", label:"갑옷" },
      { type:"ring", label:"반지" },
    ];

    for (let i=0;i<slots.length;i++){
      const s = slots[i];
      const it = eq[s.type] ? getItem(eq[s.type]) : null;
      const x = p+14 + i*((w-2*p-28)/3);
      const ww = (w-2*p-28)/3 - 10;
      panel(x, y0+32, ww, 74, 16, "rgba(17,24,39,.55)", "rgba(148,163,184,.18)");
      text(s.label, x+10, y0+52, 12, "rgba(148,163,184,.95)", "left", "middle", 800);
      if (it){
        text(`${it.name} +${it.enh||0}`, x+10, y0+74, 12, rarityColor(it.rar), "left", "middle", 900);
        const stat = it.type==="ring" ? `골드 +${Math.floor(it.gold)}%` : `ATK +${Math.floor(it.atk)}`;
        text(stat, x+10, y0+92, 12, "rgba(232,238,246,.9)", "left", "middle", 700);
        ui.addHot(x, y0+32, ww, 74, ()=>{ unequip(S, it.type, logPush, saveState); toast(`${s.label} 해제`); });
      } else {
        text("비어있음", x+10, y0+78, 12, "rgba(148,163,184,.75)", "left", "middle", 700);
      }
    }

    // synth controls
    const y1 = y0 + 132;
    panel(p, y1, w-2*p, 56, 18, "rgba(15,23,42,.6)", "rgba(148,163,184,.18)");
    const synthOn = !!S.synth.mode;
    button(synthOn ? "합성 모드 ON" : "합성 모드 OFF", p+14, y1+10, 160, 36, {
      fill: synthOn ? "rgba(34,197,94,.28)" : "rgba(17,24,39,.55)",
      onTap: ()=>{ toggleSynthMode(S, logPush, saveState); }
    });
    const sel = (S.synth.selected||[]).length;
    text(`선택 ${sel}/3 (같은 타입/등급)`, p+190, y1+28, 12, "rgba(148,163,184,.95)", "left", "middle", 800);
    button("합성", w-p-14-120, y1+10, 120, 36, {
      fill: sel===3 ? "rgba(59,130,246,.45)" : "rgba(17,24,39,.35)",
      disabled: sel!==3,
      onTap: ()=>{ doSynthesis(S, tables, logPush, saveState); toast("합성 시도"); }
    });

    // inventory list
    const listY = y1 + 70;
    const listH = bottomY - listY - 70;
    const listX = p;
    const listW = w-2*p;
    panel(listX, listY, listW, listH, 18, "rgba(15,23,42,.55)", "rgba(148,163,184,.18)");
    text(`인벤토리 (${inv.length}/70)`, p+14, listY+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    const rowH = 48;
    const visible = Math.floor((listH-34)/rowH);
    layout.itemsRowH = rowH;
    layout.itemsVisible = visible;
    const maxScroll = Math.max(0, inv.length - visible);
    U.invScroll = clampScroll(U.invScroll, 0, maxScroll);

    // inventory drag scroll region
    layout.itemsListRect = { x: listX, y: listY, w: listW, h: listH };
    text("드래그로 스크롤", listX+12, listY+16, 12, "rgba(100,116,139,.9)", "left", "middle", 700);

    // rows
    for (let i=0;i<visible;i++){
      const idx = U.invScroll + i;
      if (idx >= inv.length) break;
      const it = inv[idx];
      const y = listY + 30 + i*rowH;
      const x = p+14;
      const ww = w-2*p-28-54;
      const selected = (U.invSel === it.id);
      panel(x, y, ww, rowH-6, 14, selected?"rgba(59,130,246,.18)":"rgba(17,24,39,.45)", "rgba(148,163,184,.16)");
      const tag = `${it.rar}`;
      panel(x+10, y+10, 22, 22, 8, rarityColor(it.rar), null);
      text(tag, x+21, y+21, 12, "#0b0f14", "center", "middle", 900);
      text(`${it.name} +${it.enh||0}`, x+42, y+22, 12, rarityColor(it.rar), "left", "middle", 900);

      const stat = it.type==="ring" ? `골드 +${Math.floor(it.gold)}%` : `ATK +${Math.floor(it.atk)}`;
      text(stat, x+ww-10, y+22, 12, "rgba(232,238,246,.9)", "right", "middle", 800);

      // synth selection marker
      const inSel = (S.synth.selected||[]).includes(it.id);
      if (inSel){
        panel(x+ww-46, y+10, 28, 22, 10, "rgba(34,197,94,.85)", null);
        text("✓", x+ww-32, y+21, 14, "#0b0f14", "center", "middle", 900);
      }

      ui.addHot(x, y, ww, rowH-6, ()=>{
        U.invSel = it.id;
        if (S.synth.mode) toggleSynthSelect(S, it.id, logPush, saveState);
      });
    }

    // actions for selected item
    const selItem = U.invSel ? inv.find(x=>x.id===U.invSel) : null;
    const actY = bottomY - 60;
    panel(p, actY, w-2*p, 56, 18, "rgba(15,23,42,.6)", "rgba(148,163,184,.18)");
    if (!selItem){
      text("아이템을 선택하세요", p+14, actY+30, 12, "rgba(148,163,184,.9)", "left", "middle", 800);
    } else {
      text(`${selItem.name} +${selItem.enh||0}`, p+14, actY+20, 12, rarityColor(selItem.rar), "left", "middle", 900);
      const stat = selItem.type==="ring" ? `골드 +${Math.floor(selItem.gold)}%` : `ATK +${Math.floor(selItem.atk)}`;
      text(stat, p+14, actY+40, 12, "rgba(232,238,246,.9)", "left", "middle", 750);

      const ax = w-p-14;
      const bw = 88;
      button("판매", ax-bw, actY+10, bw, 36, {
        fill:"rgba(239,68,68,.22)",
        onTap: ()=>{ sellItem(S, selItem.id, logPush, saveState); toast("판매"); if (U.invSel===selItem.id) U.invSel=null; }
      });
      button("강화", ax-bw*2-10, actY+10, bw, 36, {
        fill:"rgba(251,191,36,.18)",
        onTap: ()=>{ tryEnhance(S, selItem.id, logPush, saveState); }
      });

      const equippedId = S.equipment[selItem.type];
      const eqLabel = equippedId === selItem.id ? "해제" : "장착";
      button(eqLabel, ax-bw*3-20, actY+10, bw, 36, {
        fill:"rgba(59,130,246,.20)",
        onTap: ()=>{
          if (equippedId === selItem.id) unequip(S, selItem.type, logPush, saveState);
          else equipItem(S, selItem.id, logPush, saveState);
          toast(eqLabel);
        }
      });
    }
  };

  const drawPetsTab = (d) => {
    const p = layout.pad;
    const w = ui.w, h = ui.h;
    const y0 = p + layout.topH + 10;
    const bottomY = h - layout.bottomH - p - 10;

    panel(p, y0, w-2*p, bottomY-y0, 18, "rgba(15,23,42,.55)", "rgba(148,163,184,.18)");
    text("펫 슬롯 (3)", p+14, y0+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    const cardH = 110;
    for (let i=0;i<3;i++){
      const slot = S.pets.slots[i];
      const y = y0 + 34 + i*(cardH+10);
      panel(p+14, y, w-2*p-28, cardH, 18, "rgba(17,24,39,.45)", "rgba(148,163,184,.16)");

      text(`슬롯 ${i+1}`, p+30, y+22, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

      if (!slot.unlocked){
        text("잠김", p+30, y+50, 14, "rgba(239,68,68,.85)", "left", "middle", 900);
        const cost = petUnlockCost(i);
        text(`해금 비용: ${fmt(cost)}G`, p+30, y+76, 12, "rgba(148,163,184,.95)", "left", "middle", 800);

        button("해금", w-p-30-120, y+34, 120, 46, {
          fill:"rgba(59,130,246,.20)",
          disabled: (cost > 0 && S.gold < cost),
          onTap: ()=>{ unlockPetSlot(S, i, logPush, saveState); toast("해금"); }
        });
      } else {
        const pet = petsById.get(slot.petId);
        text(pet?.name || "펫", p+30, y+50, 14, "rgba(34,197,94,.85)", "left", "middle", 900);
        text(`레벨 ${slot.level}`, p+30, y+74, 12, "rgba(148,163,184,.95)", "left", "middle", 800);
        const lcost = petLevelUpCost(i, slot.level);
        text(`레벨업 비용: ${fmt(lcost)}G`, p+30, y+94, 12, "rgba(148,163,184,.85)", "left", "middle", 750);

        button("레벨업", w-p-30-120, y+34, 120, 46, {
          fill:"rgba(251,191,36,.18)",
          disabled: S.gold < petLevelUpCost(i, slot.level),
          onTap: ()=>{ levelUpPet(S, i, logPush, saveState); }
        });

        // change pet (cycle)
        button("펫 변경", w-p-30-120, y+84, 120, 20, {
          fill:"rgba(17,24,39,.35)",
          onTap: ()=>{
            const petIds = Array.from(petsById.keys());
            const cur = petIds.indexOf(slot.petId);
            const next = petIds[(cur+1) % petIds.length];
            setPetForSlot(S, i, next, logPush, saveState);
            toast("펫 변경");
          }
        });
      }
    }

    // note
    text("팁: 펫은 DPS 보너스/스킬을 제공합니다.", p+14, bottomY-14, 12, "rgba(148,163,184,.85)", "left", "middle", 700);
  };

  const drawSkillsTab = (d) => {
    const p = layout.pad;
    const w = ui.w, h = ui.h;
    const y0 = p + layout.topH + 10;
    const bottomY = h - layout.bottomH - p - 10;

    panel(p, y0, w-2*p, bottomY-y0, 18, "rgba(15,23,42,.55)", "rgba(148,163,184,.18)");
    text("스킬 (5)", p+14, y0+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    const defs = [
      { key:"power", name:"파워", desc:"큰 피해", kind:"dmg" },
      { key:"execute", name:"처형", desc:"낮은 HP일수록 강함", kind:"dmg" },
      { key:"berserk", name:"광폭", desc:"공격력 증가(버프)", kind:"buff" },
      { key:"haste", name:"가속", desc:"공속 증가(버프)", kind:"buff" },
      { key:"lucky", name:"행운", desc:"드랍/골드(버프)", kind:"buff" },
    ];

    const rowH = 84;
    for (let i=0;i<defs.length;i++){
      const d0 = defs[i];
      const st = S.skills[d0.key];
      const y = y0 + 34 + i*(rowH+10);
      panel(p+14, y, w-2*p-28, rowH, 18, "rgba(17,24,39,.45)", "rgba(148,163,184,.16)");
      text(d0.name, p+30, y+22, 14, "#e8eef6", "left", "middle", 900);
      text(d0.desc, p+30, y+46, 12, "rgba(148,163,184,.95)", "left", "middle", 750);
      const cd = Math.max(0, st.cd||0);
      text(cd<=0.01 ? "READY" : `CD ${cd.toFixed(1)}s`, p+30, y+68, 12, cd<=0.01?"rgba(34,197,94,.85)":"rgba(148,163,184,.85)", "left", "middle", 900);

      button("사용", w-p-30-220, y+22, 90, 44, {
        fill: cd<=0.01 ? "rgba(59,130,246,.20)" : "rgba(17,24,39,.35)",
        disabled: cd>0.01,
        onTap: ()=>castSkillFx(d0.key, d)
      });
      button(st.auto ? "AUTO" : "MAN", w-p-30-120, y+22, 90, 44, {
        fill: st.auto ? "rgba(34,197,94,.28)" : "rgba(148,163,184,.12)",
        onTap: ()=>{ st.auto = !st.auto; saveState(S); }
      });
    }

    button(S.autoSkills ? "스킬 자동사용 ON" : "스킬 자동사용 OFF", p+14, bottomY-54, w-2*p-28, 44, {
      fill: S.autoSkills ? "rgba(34,197,94,.28)" : "rgba(17,24,39,.45)",
      onTap: ()=>{ S.autoSkills = !S.autoSkills; saveState(S); }
    });
  };

  const drawSettingsTab = (d) => {
    const p = layout.pad;
    const w = ui.w, h = ui.h;
    const y0 = p + layout.topH + 10;
    const bottomY = h - layout.bottomH - p - 10;

    panel(p, y0, w-2*p, bottomY-y0, 18, "rgba(15,23,42,.55)", "rgba(148,163,184,.18)");
    text("설정 / 데이터", p+14, y0+18, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    // upgrades section
    panel(p+14, y0+34, w-2*p-28, 190, 18, "rgba(17,24,39,.45)", "rgba(148,163,184,.16)");
    text("업그레이드", p+30, y0+54, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    for (let i=0;i<upgradeDefs.length;i++){
      const def = upgradeDefs[i];
      const lvl = S.upgrades[def.key] || 0;
      const cost = def.cost(lvl);
      const yy = y0 + 70 + i*42;

      text(`${def.name}  Lv.${lvl}`, p+30, yy+16, 12, "#e8eef6", "left", "middle", 900);
      text(def.desc, p+30, yy+32, 11, "rgba(148,163,184,.95)", "left", "middle", 700);

      button(`구매 ${fmt(cost)}G`, w-p-30-160, yy+6, 150, 34, {
        fill: S.gold >= cost ? "rgba(251,191,36,.16)" : "rgba(17,24,39,.35)",
        disabled: (cost > 0 && S.gold < cost),
        onTap: ()=>{
          const ok = buyUpgrade(S, def.key);
          if (ok) toast(`${def.name} Lv.${lvl+1}`);
        }
      });
    }

    // export/import/reset
    const y2 = y0 + 240;
    panel(p+14, y2, w-2*p-28, 150, 18, "rgba(17,24,39,.45)", "rgba(148,163,184,.16)");
    text("저장 데이터", p+30, y2+20, 12, "rgba(148,163,184,.95)", "left", "middle", 900);

    button("내보내기(복사)", p+30, y2+34, w-2*p-60, 40, {
      fill:"rgba(59,130,246,.18)",
      onTap: async ()=>{
        const txt = JSON.stringify(S, null, 2);
        try{
          await navigator.clipboard.writeText(txt);
          toast("클립보드에 복사됨");
        }catch{
          prompt("아래를 복사하세요:", txt);
        }
      }
    });

    button("가져오기(JSON)", p+30, y2+80, w-2*p-60, 40, {
      fill:"rgba(34,197,94,.16)",
      onTap: ()=>{
        const txt = prompt("JSON을 붙여넣으세요:");
        if (!txt) return;
        const obj = safeJsonParse(txt);
        if (!obj) { toast("JSON 파싱 실패"); return; }
        const fresh = baseState();
        Object.assign(fresh, obj);
        Object.assign(S, fresh);
        saveState(S);
        toast("가져오기 완료");
      }
    });

    button("초기화", p+30, y2+126, w-2*p-60, 40, {
      fill:"rgba(239,68,68,.16)",
      onTap: ()=>{
        if (!confirm("정말 초기화할까요? 저장 데이터가 삭제됩니다.")) return;
        localStorage.removeItem(STORAGE_KEY);
        Object.assign(S, baseState());
        saveState(S);
        toast("초기화 완료");
      }
    });


    // prestige section
    const pg = S.prestige || { times:0, essence:0 };
    panel(p+14, y2+178, w-2*p-28, 118, 18, "rgba(17,24,39,.45)", "rgba(148,163,184,.16)");
    text("환생(프레스티지)", p+30, y2+198, 12, "rgba(148,163,184,.95)", "left", "middle", 900);
    text(`환생 횟수: ${pg.times}회`, p+30, y2+220, 12, "rgba(226,232,240,.95)", "left", "middle", 700);
    text(`정수: ${pg.essence}`, p+30, y2+242, 12, "rgba(226,232,240,.95)", "left", "middle", 700);

    const gain = calcEssenceGain();
    button(gain>0 ? `환생하기 (정수 +${gain})` : "환생하기 (스테이지 30부터)", p+30, y2+258, w-2*p-60, 34, {
      fill: gain>0 ? "rgba(245,158,11,.18)" : "rgba(148,163,184,.10)",
      stroke: gain>0 ? "rgba(245,158,11,.35)" : "rgba(148,163,184,.18)",
      disabled: gain<=0,
      onTap: ()=>{ U.modal = { type:"prestige", gain }; }
    });

    text("PWA 팁: 업데이트가 안 보이면 새로고침 또는 앱 재실행", p+14, bottomY-14, 12, "rgba(148,163,184,.85)", "left", "middle", 700);
  };

  const drawToast = () => {
    if (U.toast.t <= 0 || !U.toast.msg) return;
    const w = ui.w, h = ui.h;
    const p = layout.pad;
    const y = h - layout.bottomH - p - 90;
    const msg = U.toast.msg;
    const ww = Math.min(w-2*p, 520);
    const x = (w-ww)/2;
    panel(x, y, ww, 46, 16, "rgba(15,23,42,.92)", "rgba(148,163,184,.22)");
    text(msg, x+ww/2, y+24, 13, "#e8eef6", "center", "middle", 800);
  };

  const autoTick = (dt, d) => {
    if (!S.auto) return;
    // continuous damage
    dealDamage(S, d.dpsTotal * dt, { source:"auto", crit:false, big:false });

    // visual pulse (avoid per-frame spam)
    U.autoFxAcc += dt;
    if (U.autoFxAcc >= 0.36) {
      U.autoFxAcc = 0;
      const approx = d.dpsTotal * 0.36;
      if (approx > 0.2) fx.onHit({ dmg: approx, crit:false, big:false }, layout.enemyCenter);
    }

    if (S.enemy.hp <= 0) onKill(S, tables, d, logPush, saveState);
  };

  // main loop
  let last = performance.now();
  const loop = (t) => {
    const dt = clamp((t-last)/1000, 0, 0.2);
    last = t;

    tickSkillCooldowns(S, dt);

    const d = computeDerived(S, tables);
    S._derived = d;

    // auto skills and pet skills with fx hooks
    autoCastSkills({S, d, dealDamage: dealDamageFx, logPush, saveState, fx:{
      onSkillCast: (meta)=>fx.onSkillCast(meta, layout.enemyCenter, layout.playerCenter)
    }});

    tickPetSkills({S, dt, petsById, petSkillsById, d, dealDamage: dealDamageFx, logPush, saveState, fx:{
      onSkillCast: (meta)=>fx.onSkillCast(meta, layout.enemyCenter, layout.playerCenter)
    }});

    autoTick(dt, d);

    // fx tick
    fx.setEnemy(S.enemy.name, S.enemy.boss);
    fx.tick(dt);

    // render
    render(d);

    // toast timer
    if (U.toast.t > 0) U.toast.t = Math.max(0, U.toast.t - dt);

    requestAnimationFrame(loop);
  };


  const calcEssenceGain = () => {
    const st = S.stage || 1;
    if (st < 30) return 0;
    return Math.max(1, Math.floor((st-1)/25));
  };

  const milestoneBonusEssence = (timesAfter, classesTable) => {
    const ms = (classesTable && classesTable.milestones) ? classesTable.milestones : [];
    const hit = ms.find(x => x.times === timesAfter);
    return hit ? (hit.bonusEssence || 0) : 0;
  };

  const resetForPrestige = (gain) => {
    const prevPrestige = S.prestige || { times:0, essence:0, totalEssence:0 };
    const nextTimes = (prevPrestige.times||0) + 1;
    const bonus = milestoneBonusEssence(nextTimes, tables.classes);
    const nextEss = (prevPrestige.essence||0) + gain + bonus;

    const keepSeed = S.seed || 123456789;
    const next = baseState();
    next.seed = keepSeed;
    next.prestige = { times: nextTimes, essence: nextEss, totalEssence: (prevPrestige.totalEssence||0) + gain + bonus };

    // preserve user toggles
    next.auto = S.auto;
    next.autoAdvance = S.autoAdvance;
    next.autoSkills = S.autoSkills;

    Object.assign(S, next);
    ensureStageEnemy(S);
    logPush(S, `환생! 정수 +${gain}${bonus?` (마일스톤 +${bonus})`:""}`, {cat:"sys"});
    saveState(S);

    U.modal = { type:"toast", msg:`환생 완료 · 정수 ${S.prestige.essence}` };
  };
  const render = (d) => {
    ui.resetHot();
    const ctx = ui.ctx;
    const modalActive = !!U.modal && (U.modal.type === "offline" || U.modal.type === "prestige");

    // layout sizes
    layout.pad = Math.max(10, Math.min(16, ui.w * 0.03));
    layout.topH = 64;
    layout.bottomH = 78;

    // base background
    ctx.fillStyle = "#0b0f14";
    ui.inputEnabled = !modalActive;
    ctx.fillRect(0,0,ui.w,ui.h);
    // subtle glows
    {
      const g1 = ctx.createRadialGradient(ui.w*0.3, ui.h*0.15, 10, ui.w*0.3, ui.h*0.15, Math.max(ui.w,ui.h)*0.7);
      g1.addColorStop(0, "rgba(59,130,246,.12)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0,0,ui.w,ui.h);
      const g2 = ctx.createRadialGradient(ui.w*0.8, ui.h*0.35, 10, ui.w*0.8, ui.h*0.35, Math.max(ui.w,ui.h)*0.6);
      g2.addColorStop(0, "rgba(34,197,94,.08)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0,0,ui.w,ui.h);
    }

    // shake
    ctx.save();
    fx.applyShake(ctx);

    drawTopBar(d);

    // scene content
    if (U.tab === "battle") {
      drawEnemyArea(d);
      drawBattleControls(d);
    } else if (U.tab === "items") {
      drawItemsTab(d);
    } else if (U.tab === "pets") {
      drawPetsTab(d);
    } else if (U.tab === "skills") {
      drawSkillsTab(d);
    } else {
      drawSettingsTab(d);
    }

    // draw FX (over everything)
    fx.render(ctx);

    // modal overlays (block base input)
    if (U.modal && (U.modal.type === "offline" || U.modal.type === "prestige")){
      ui.inputEnabled = true;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0,0,ui.w,ui.h);
      const mw = Math.min(ui.w-40, 360);
      const mh = U.modal.type === "offline" ? 240 : 220;
      const mx = (ui.w-mw)/2;
      const my = (ui.h-mh)/2;
      panel(mx, my, mw, mh, 18, "rgba(15,23,42,.92)", "rgba(148,163,184,.22)");

      if (U.modal.type === "offline"){
        const sum = U.modal.sum;
        text("오프라인 보상", mx+16, my+22, 14, "rgba(226,232,240,.98)", "left", "middle", 900);
        text(`처치: ${sum.kills||0}   골드: +${fmt(sum.gold||0)}G`, mx+16, my+52, 12, "rgba(148,163,184,.95)", "left", "middle", 700);
        text(`환산 골드: +${fmt(sum.convertedGold||0)}G`, mx+16, my+72, 12, "rgba(148,163,184,.95)", "left", "middle", 700);
        text("획득(중요 아이템 R+):", mx+16, my+100, 12, "rgba(148,163,184,.95)", "left", "middle", 900);
        const list = (sum.awarded||[]);
        for (let i=0;i<Math.min(5,list.length);i++){
          const it = list[i];
          text(`• ${it.name}`, mx+20, my+122+i*18, 12, it.rar==="E" ? "rgba(251,191,36,.95)" : "rgba(96,165,250,.95)", "left", "middle", 700);
        }
        if (!list.length) text("• 없음", mx+20, my+122, 12, "rgba(100,116,139,.9)", "left", "middle", 700);

        button("확인", mx+mw-110, my+mh-52, 94, 36, { fill:"rgba(59,130,246,.25)", stroke:"rgba(59,130,246,.35)", onTap: ()=>{ U.modal=null; } });
      }

      if (U.modal.type === "prestige"){
        const gain = U.modal.gain || 0;
        const nextTimes = (S.prestige?.times||0) + 1;
        const ms = (tables.classes && tables.classes.milestones) ? tables.classes.milestones : [];
        const hit = ms.find(x=>x.times===nextTimes);
        const bonus = hit ? (hit.bonusEssence||0) : 0;
        const title = hit ? (hit.title||"") : "";

        text("환생 확인", mx+16, my+22, 14, "rgba(226,232,240,.98)", "left", "middle", 900);
        text(`스테이지/골드/장비/펫/강화/합성은 초기화됩니다.`, mx+16, my+52, 12, "rgba(148,163,184,.95)", "left", "middle", 700);
        text(`정수 +${gain}${bonus?` (+${bonus} 마일스톤)`:""}`, mx+16, my+78, 12, "rgba(245,158,11,.95)", "left", "middle", 900);
        if (title) text(`칭호: ${title}`, mx+16, my+98, 12, "rgba(148,163,184,.95)", "left", "middle", 700);

        button("취소", mx+16, my+mh-52, 94, 36, { fill:"rgba(148,163,184,.12)", stroke:"rgba(148,163,184,.22)", onTap: ()=>{ U.modal=null; } });
        button("환생", mx+mw-110, my+mh-52, 94, 36, { fill:"rgba(245,158,11,.22)", stroke:"rgba(245,158,11,.35)", onTap: ()=>{ const g=calcEssenceGain(); U.modal=null; resetForPrestige(g); } });
