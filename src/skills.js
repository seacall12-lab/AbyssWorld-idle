import { nowMs } from "./utils.js";

export const SKILLS = [
  {
    key:"power",
    name:"파워 스트라이크",
    kind:"dmg",
    cdMax: 8,
    desc:"즉발 강타(ATK×4).",
    condition: (S) => S.enemy.hp > 0,
    cast: ({S, d, dealDamage, logPush}) => {
      dealDamage(S, d.atk * 4.0, true);
      logPush(S, "스킬: 파워 스트라이크");
    }
  },
  {
    key:"execute",
    name:"처형",
    kind:"dmg",
    cdMax: 16,
    desc:"체력 낮을수록 강함(최대 ATK×10).",
    condition: (S) => (S.enemy.hp / S.enemy.hpMax) < 0.45,
    cast: ({S, d, dealDamage, logPush}) => {
      const ratio = Math.max(0, Math.min(0.9, 1 - (S.enemy.hp / S.enemy.hpMax)));
      const mult = 3.0 + ratio * 7.0;
      dealDamage(S, d.atk * mult, true);
      logPush(S, "스킬: 처형");
    }
  },
  {
    key:"berserk",
    name:"광폭화",
    kind:"buff",
    cdMax: 30,
    desc:"10초간 ATK +35%.",
    condition: (S) => nowMs() > (S.buffs.expires.berserk||0),
    cast: ({S, logPush}) => {
      S.buffs.expires.berserk = nowMs() + 10000;
      logPush(S, "버프: 광폭화(ATK↑)");
    }
  },
  {
    key:"haste",
    name:"가속",
    kind:"buff",
    cdMax: 30,
    desc:"10초간 공격속도 +50%.",
    condition: (S) => nowMs() > (S.buffs.expires.haste||0),
    cast: ({S, logPush}) => {
      S.buffs.expires.haste = nowMs() + 10000;
      logPush(S, "버프: 가속(ASPD↑)");
    }
  },
  {
    key:"lucky",
    name:"행운",
    kind:"util",
    cdMax: 45,
    desc:"10초간 골드 +50% / 드랍 +8%p.",
    condition: (S) => nowMs() > (S.buffs.expires.lucky||0),
    cast: ({S, logPush}) => {
      S.buffs.expires.lucky = nowMs() + 10000;
      logPush(S, "유틸: 행운(골드/드랍↑)");
    }
  }
];

export const canCast = (S, key) => (S.skills[key]?.cd || 0) <= 0;

export const castSkill = ({S, key, d, dealDamage, logPush, saveState}) => {
  const sk = SKILLS.find(x=>x.key===key);
  if (!sk) return;
  if (!canCast(S, key)) return;

  sk.cast({S, d, dealDamage, logPush});
  S.skills[key].cd = sk.cdMax;
  saveState(S);
};

export const autoCastSkills = ({S, d, dealDamage, logPush, saveState}) => {
  if (!S.autoSkills) return;

  for (const sk of SKILLS) {
    const st = S.skills[sk.key];
    if (!st || st.cd > 0 || !st.auto) continue;
    if (sk.condition(S, d)) {
      sk.cast({S, d, dealDamage, logPush});
      st.cd = sk.cdMax;
      saveState(S);
      break;
    }
  }
};

export const tickSkillCooldowns = (S, dt) => {
  for (const k of Object.keys(S.skills)) {
    S.skills[k].cd = Math.max(0, (S.skills[k].cd || 0) - dt);
  }
};
