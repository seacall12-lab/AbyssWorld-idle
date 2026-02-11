import { nowMs, clamp } from "./utils.js";
import { computeEnemyForStage } from "./balance.js";

export const STORAGE_KEY = "abyssworld_idle_v4";

export const baseState = () => ({
  t: nowMs(),
  seed: Math.floor(Math.random()*2147483647) || 123456789,
  gold: 0,
  kills: 0,
  drops: 0,
  stage: 1,
  auto: true,
  autoAdvance: true,
  autoSkills: true,

  prestige: { times: 0, essence: 0, totalEssence: 0 },

  player: {
    level: 1,
    exp: 0,
    expNeed: 25,
    baseAtk: 2,
    aspd: 1.00,
    crit: 0.05,
    critMul: 1.50,
    goldBonus: 0.00,
  },

  upgrades: { atk: 0, aspd: 0, crit: 0, gold: 0 },

  equipment: { weapon: null, armor: null, ring: null },
  inventory: [],

  synth: { mode: false, selected: [], lockType: null, lockRar: null },

  buffs: {
    atkMul: 1.0,
    aspdMul: 1.0,
    goldMul: 1.0,
    dropAdd: 0.0,
    expires: { berserk: 0, haste: 0, lucky: 0, pet: 0 }
  },

  skills: {
    power:   { cd: 0, auto: true },
    execute: { cd: 0, auto: true },
    berserk: { cd: 0, auto: true },
    haste:   { cd: 0, auto: true },
    lucky:   { cd: 0, auto: true },
  },

  pets: {
    slots: [
      { unlocked: true,  level: 1, petId: "p_wolf", skillCd: 0 },
      { unlocked: false, level: 0, petId: "p_wolf", skillCd: 0 },
      { unlocked: false, level: 0, petId: "p_wolf", skillCd: 0 },
    ]
  },

  enemy: computeEnemyForStage(1),

  log: []
});

export const logPush = (S, msg, meta={}) => {
  // meta: {cat:"sys|drop|enh|synth|combat", rar:"C|U|R|E"}
  const item = {
    t: nowMs(),
    cat: meta.cat || "sys",
    rar: meta.rar || null,
    msg: String(msg)
  };
  S.log.unshift(item);
  if (S.log.length > 60) S.log.length = 60;
};

const assign = (dst, src) => Object.assign(dst, src || {});

export const loadState = (computeDerivedForOffline) => {
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return baseState();
    const s = JSON.parse(raw);
    const b = baseState();
    const merged = structuredClone(b);

    Object.assign(merged, s);
    merged.player = assign(b.player, s.player);
    merged.upgrades = assign(b.upgrades, s.upgrades);
    merged.equipment = assign(b.equipment, s.equipment);
    merged.enemy = assign(b.enemy, s.enemy);
    merged.inventory = Array.isArray(s.inventory) ? s.inventory : [];
    merged.synth = assign(b.synth, s.synth);
    merged.buffs = assign(b.buffs, s.buffs);
    merged.buffs.expires = assign(b.buffs.expires, s.buffs?.expires);
    merged.skills = assign(b.skills, s.skills);
    merged.pets = assign(b.pets, s.pets);
    merged.pets.slots = Array.isArray(s.pets?.slots) ? s.pets.slots : b.pets.slots;
    merged.log = Array.isArray(s.log) ? s.log.slice(0,10) : [];

    const now = nowMs();
    const dt = clamp((now - (s.t||now)) / 1000, 0, 6*3600);
    merged.t = now;

    if (dt > 5 && typeof computeDerivedForOffline === "function") {
      const d = computeDerivedForOffline(merged);
      const dps = d.dpsTotal;
      const hp = merged.enemy.hpMax;
      const timePerKill = hp / Math.max(0.1, dps);
      const kills = Math.floor(dt / Math.max(1.0, timePerKill));
      if (kills > 0) {
        const goldGain = kills * merged.enemy.gold * (1 + d.goldBonus);
        const expGain  = kills * merged.enemy.exp;
        merged.gold += goldGain;
        merged.kills += kills;
        logPush(merged, `오프라인 보상: ${kills} 처치, +${Math.floor(goldGain)}G`);
        merged._offlineSummary = { kills, gold: Math.floor(goldGain), exp: expGain, startedAt: raw.t, endedAt: nowMs() };
      }
    }
    return merged;
  }catch{
    return baseState();
  }
};

export const saveState = (S) => {
  S.t = nowMs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
};
