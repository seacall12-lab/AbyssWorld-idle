import { clamp } from "./utils.js";

let monsterTable = null;
export const setMonsterTable = (tbl) => { monsterTable = tbl; };

export const RARITY = [
  { key:"C", name:"일반", tagClass:"c", weight: 70, mult: 1.00, sell:  8 },
  { key:"U", name:"고급", tagClass:"u", weight: 22, mult: 1.35, sell: 20 },
  { key:"R", name:"희귀", tagClass:"r", weight:  7, mult: 1.80, sell: 55 },
  { key:"E", name:"영웅", tagClass:"e", weight:  1, mult: 2.50, sell: 140 },
];

export const boostedRarityWeights = [
  { key:"C", weight: 45 },
  { key:"U", weight: 32 },
  { key:"R", weight: 18 },
  { key:"E", weight:  5 },
];

export const rarityIndex = (k) => Math.max(0, RARITY.findIndex(x=>x.key===k));
export const nextRarityKey = (k) => RARITY[Math.min(RARITY.length-1, rarityIndex(k)+1)].key;

export const ENEMIES = ["슬라임","고블린","늑대","스켈레톤","오크","다크메이지","가고일","리치"];

export const isBossStage = (stage) => stage % 10 === 0;

export const computeEnemyForStage = (stage) => {
  const boss = isBossStage(stage);

  // If a monster table is provided, use it (SD sprite keys, names)
  if (monsterTable && Array.isArray(monsterTable) && monsterTable.length){
    const pick = monsterTable[(stage-1) % monsterTable.length];
    const idx = (stage-1) % monsterTable.length;
    let hp   = Math.floor((pick.hp||18)   * Math.pow(1.16, stage-1));
    let atk  = Math.floor((pick.atk||2)   * Math.pow(1.10, stage-1));
    let gold = Math.floor((pick.gold||5)  * Math.pow(1.11, stage-1));
    let exp  = Math.floor((pick.exp||5)   * Math.pow(1.09, stage-1));

    if (boss){
      hp = Math.floor(hp * 4.5);
      gold = Math.floor(gold * 3.0);
      exp = Math.floor(exp * 2.2);
    }
    return {
      name: pick.name || `몹 ${idx+1}`,
      sprite: pick.sprite || null,
      hpMax: Math.max(5, hp),
      hp: Math.max(5, hp),
      atk: Math.max(1, atk),
      exp: Math.max(1, exp),
      gold: Math.max(1, gold),
      boss
    };
  }

  // fallback procedural
  const idx = Math.floor((stage-1)/10) % ENEMIES.length;
  const name = ENEMIES[idx];
  const baseHP = 18;

  let hp = Math.floor(baseHP * Math.pow(1.18, stage-1) * (1 + 0.08*idx));
  let gold = Math.floor(3 * Math.pow(1.12, stage-1));
  let exp  = Math.floor(5 * Math.pow(1.10, stage-1));

  if (boss) {
    hp = Math.floor(hp * 5.0);
    gold = Math.floor(gold * 3.0);
    exp = Math.floor(exp * 2.2);
  }

  return {
    name: boss ? `${name} (보스)` : name,
    sprite: null,
    hpMax: Math.max(5, hp),
    hp: Math.max(5, hp),
    atk: Math.max(1, Math.floor(2 * Math.pow(1.08, stage-1))),
    exp: Math.max(1, exp),
    gold: Math.max(1, gold),
    boss
  };
};


export const dropChanceBase = (stage) => clamp(0.10 + stage*0.002, 0.10, 0.35);

export const ENH_MAX = 10;
export const enhanceChance = (enh) => {
  const table = [0.90,0.82,0.74,0.64,0.52,0.40,0.28,0.18,0.12,0.08,0.05];
  const i = clamp(enh, 0, ENH_MAX);
  return table[i] ?? 0.05;
};

export const petUnlockCost = (slotIndex) => {
  if (slotIndex === 1) return 500;
  if (slotIndex === 2) return 2500;
  return 0;
};
export const petLevelUpCost = (slotIndex, level) => {
  const base = 120 * (slotIndex+1);
  return Math.floor(base * Math.pow(1.30, Math.max(0, level-1)));
};
export const petPassiveBonusFromLevel = (level) => clamp(0.05 + level*0.01, 0.05, 0.25);
export const petSlotWeight = (slotIndex) => (slotIndex===0?1.0:slotIndex===1?0.85:0.70);
