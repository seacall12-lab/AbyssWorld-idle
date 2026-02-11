import { clamp, pickWeighted, pickWeightedByRand, rand01, uid } from "./utils.js";
import { RARITY, boostedRarityWeights, rarityIndex, nextRarityKey, ENH_MAX, enhanceChance } from "./balance.js";

export const ITEM_TYPES = [
  { type:"weapon", name:"무기", stat:"atk" },
  { type:"armor",  name:"갑옷", stat:"atk" },
  { type:"ring",   name:"반지", stat:"gold" },
];

export const statWithEnh = (value, enh, kind) => {
  if (!value) return 0;
  if (kind === "atk")  return Math.floor(value * (1 + 0.10*enh));
  if (kind === "gold") return Math.round(value * (1 + 0.08*enh) * 100) / 100;
  return value;
};

export const enhanceCost = (item) => {
  const rMul = 1.0 + rarityIndex(item.rar)*0.55;
  const enh = item.enh || 0;
  const base = 40 + (item.stage||1) * 2.0;
  return Math.floor(base * Math.pow(1.28, enh) * rMul);
};

export const tryEnhance = (S, itemId, logPush, saveState) => {
  const it = S.inventory.find(x => x.id === itemId);
  if (!it) return;
  const enh = it.enh || 0;
  if (enh >= ENH_MAX) return;

  const cost = enhanceCost(it);
  if (S.gold < cost) return;

  S.gold -= cost;
  const ok = Math.random() < enhanceChance(enh);
  if (ok) {
    it.enh = enh + 1;
    logPush(S, `강화 성공: ${it.name} +${it.enh}`);
  } else {
    logPush(S, `강화 실패: ${it.name} (+${enh} 유지)`);
  }
  saveState(S);
};

const rarityByKey = (k) => RARITY[Math.max(0, RARITY.findIndex(x=>x.key===k))];

const pickRarity = (S, rarityBoost=false) => {
  if (!rarityBoost){
    return S ? pickWeightedByRand(RARITY, rand01(S), "weight") : pickWeighted(RARITY, "weight");
  }
  const picked = S ? pickWeightedByRand(boostedRarityWeights, rand01(S), "weight") : pickWeighted(boostedRarityWeights, "weight");
  return rarityByKey(picked.key);
};

export const makeItem = (tables, stage, S=null, forcedType=null, forcedRar=null, rarityBoost=false) => {
  const rarity = forcedRar ? rarityByKey(forcedRar) : pickRarity(S, rarityBoost);
  const t = forcedType ? ITEM_TYPES.find(x=>x.type===forcedType) : ITEM_TYPES[Math.floor((S?rand01(S):Math.random())*ITEM_TYPES.length)];

  let baseDef = null;
  if (t.type === "weapon") baseDef = tables.weapons[Math.floor((S?rand01(S):Math.random())*tables.weapons.length)];
  if (t.type === "armor")  baseDef = tables.armors[Math.floor((S?rand01(S):Math.random())*tables.armors.length)];
  if (t.type === "ring")   baseDef = tables.rings[Math.floor((S?rand01(S):Math.random())*tables.rings.length)];

  const roll = 0.85 + (S?rand01(S):Math.random())*0.45;
  const id = uid("it");

  let atk = 0, gold = 0;
  if (t.stat === "atk") {
    const raw = (baseDef.baseAtk + stage*baseDef.atkScale) * rarity.mult * roll;
    atk = Math.max(1, Math.floor(raw));
  } else {
    const raw = (baseDef.baseGold + stage*baseDef.goldScale) * rarity.mult * roll;
    gold = clamp(Math.round(raw*100)/100, 0.01, 1.50);
  }

  const sell = Math.floor(rarity.sell * rarity.mult * (1 + stage*0.02));
  const name = `${baseDef.name} · ${rarity.name}`;

  return {
    id,
    baseId: baseDef.id,
    type: t.type,
    name,
    rar: rarity.key,
    tagClass: rarity.tagClass,
    atk, gold,
    sell,
    stage,
    enh: 0
  };
};

export const sellItem = (S, itemId, logPush, saveState) => {
  const idx = S.inventory.findIndex(x => x.id === itemId);
  if (idx < 0) return;
  const it = S.inventory[idx];

  if (S.equipment[it.type] === it.id) S.equipment[it.type] = null;
  S.synth.selected = (S.synth.selected || []).filter(x => x !== it.id);

  S.inventory.splice(idx, 1);
  S.gold += it.sell;

  logPush(S, `판매: +${it.sell}G`);
  saveState(S);
};

export const equipItem = (S, itemId, logPush, saveState) => {
  const it = S.inventory.find(x => x.id === itemId);
  if (!it) return;
  S.equipment[it.type] = it.id;
  logPush(S, `장착: ${it.name} +${it.enh||0}`);
  saveState(S);
};

export const unequip = (S, type, saveState) => {
  S.equipment[type] = null;
  saveState(S);
};

export const pruneInventory = (S, max=70) => {
  if (S.inventory.length <= max) return;
  S.inventory.sort((a,b)=> (a.sell - b.sell));
  while (S.inventory.length > max) {
    const it = S.inventory.shift();
    if (S.equipment[it.type] === it.id) {
      S.inventory.push(it);
      break;
    }
    S.gold += it.sell;
  }
};

export const toggleSynthMode = (S, saveState) => {
  S.synth.mode = !S.synth.mode;
  S.synth.selected = [];
  S.synth.lockType = null;
  S.synth.lockRar = null;
  saveState(S);
};

export const toggleSynthSelect = (S, itemId, saveState) => {
  const it = S.inventory.find(x=>x.id===itemId);
  if (!it) return;

  const selected = S.synth.selected || [];
  const has = selected.includes(itemId);

  if (has) {
    S.synth.selected = selected.filter(x=>x!==itemId);
    if (S.synth.selected.length === 0) {
      S.synth.lockType = null;
      S.synth.lockRar = null;
    }
    saveState(S);
    return;
  }

  if (selected.length >= 3) return;

  if (!S.synth.lockType && !S.synth.lockRar) {
    S.synth.lockType = it.type;
    S.synth.lockRar = it.rar;
  } else {
    if (it.type !== S.synth.lockType || it.rar !== S.synth.lockRar) return;
  }

  S.synth.selected.push(itemId);
  saveState(S);
};

export const doSynthesis = (S, tables, logPush, saveState) => {
  if (!S.synth.mode || (S.synth.selected||[]).length !== 3) return;

  const items = S.synth.selected
    .map(id => S.inventory.find(x => x.id === id))
    .filter(Boolean);

  if (items.length !== 3) return;

  const type = items[0].type;
  const rar = items[0].rar;
  if (!items.every(x=>x.type===type && x.rar===rar)) return;

  const outRar = nextRarityKey(rar);
  const outStage = Math.max(...items.map(x=>x.stage||1));
  const out = makeItem(tables, outStage, S, type, outRar, false);

  for (const it of items) {
    if (S.equipment[it.type] === it.id) S.equipment[it.type] = null;
    const idx = S.inventory.findIndex(x=>x.id===it.id);
    if (idx>=0) S.inventory.splice(idx,1);
  }

  S.inventory.push(out);
  pruneInventory(S, 70);

  logPush(S, `합성 성공: ${type}/${rar}×3 → ${out.rar} 1개`);
  S.synth.selected = [];
  S.synth.lockType = null;
  S.synth.lockRar = null;
  saveState(S);
};
