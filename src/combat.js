import { nowMs, clamp, rand01 } from "./utils.js";
import { dropChanceBase, computeEnemyForStage } from "./balance.js";
import { statWithEnh, makeItem, pruneInventory } from "./items.js";
import { computePetDpsBonus } from "./pets.js";

export const ensureStageEnemy = (S) => {
  const expected = computeEnemyForStage(S.stage);
  if (!S.enemy || !S.enemy.hpMax || S.enemy.hpMax !== expected.hpMax || !!S.enemy.boss !== !!expected.boss) {
    S.enemy = expected;
  }
};

export const addExp = (S, amount, logPush) => {
  S.player.exp += amount;
  while (S.player.exp >= S.player.expNeed) {
    S.player.exp -= S.player.expNeed;
    S.player.level += 1;
    S.player.baseAtk += 1;
    S.player.expNeed = Math.floor(S.player.expNeed * 1.22 + 8);
    logPush(S, `레벨업! Lv.${S.player.level}`);
  }
};

export const updateBuffsFromSkills = (S) => {
  const t = nowMs();
  let atkMul = 1.0, aspdMul = 1.0, goldMul = 1.0, dropAdd = 0.0;

  if (t < (S.buffs.expires.berserk||0)) atkMul *= 1.35;
  if (t < (S.buffs.expires.haste||0))   aspdMul *= 1.50;
  if (t < (S.buffs.expires.lucky||0)) { goldMul *= 1.50; dropAdd += 0.08; }

  if (t < (S.buffs.expires.pet||0) && S.buffs._petBuff) {
    const pb = S.buffs._petBuff;
    if (pb.kind === "buff_aspd") aspdMul *= (1 + (pb.value||0));
    if (pb.kind === "buff_atk")  atkMul *= (1 + (pb.value||0));
    if (pb.kind === "buff_gold") goldMul *= (1 + (pb.value||0));
    if (pb.kind === "buff_drop") dropAdd += (pb.value||0);
  }

  S.buffs.atkMul = atkMul;
  S.buffs.aspdMul = aspdMul;
  S.buffs.goldMul = goldMul;
  S.buffs.dropAdd = dropAdd;
};

export const computeDerived = (S, tables) => {
  updateBuffsFromSkills(S);

  const upAtk = S.upgrades.atk;
  const upAspd = S.upgrades.aspd;
  const upCrit = S.upgrades.crit;
  const upGold = S.upgrades.gold;

  const inv = S.inventory;
  const getItem = (id) => inv.find(x => x.id === id) || null;

  const w0 = S.equipment.weapon ? getItem(S.equipment.weapon) : null;
  const a0 = S.equipment.armor  ? getItem(S.equipment.armor ) : null;
  const r0 = S.equipment.ring   ? getItem(S.equipment.ring  ) : null;

  const wAtk = w0 ? statWithEnh(w0.atk, w0.enh||0, "atk") : 0;
  const aAtk = a0 ? statWithEnh(a0.atk, a0.enh||0, "atk") : 0;
  const rGold = r0 ? statWithEnh(r0.gold, r0.enh||0, "gold") : 0;

  let atk = (S.player.baseAtk + (upAtk*2) + wAtk + aAtk) * (S.buffs.atkMul || 1);
  const aspd = (S.player.aspd + (upAspd*0.08)) * (S.buffs.aspdMul || 1);

  const crit = clamp(S.player.crit + (upCrit*0.01), 0, 0.75);
  const critMul = S.player.critMul;

  let goldBonus = clamp(S.player.goldBonus + (upGold*0.03) + rGold, 0, 5);
  goldBonus *= (S.buffs.goldMul || 1);

  let dropChance = clamp(dropChanceBase(S.stage) + (S.buffs.dropAdd||0), 0.05, 0.60);


  
  // prestige (essence) bonuses (stable, small)
  const ess = Math.max(0, (S.prestige && S.prestige.essence) ? S.prestige.essence : 0);
  const atkMulEss = 1 + 0.02 * ess;
  const goldAddEss = 0.015 * ess;
  const dropAddEss = 0.002 * ess; // +0.2%p each essence

  atk *= atkMulEss;
  goldBonus = clamp(goldBonus + goldAddEss, 0, 5);
  dropChance = Math.min(0.60, dropChance + dropAddEss);

  const dpsPlayer = atk * aspd * (1 + crit*(critMul-1));
  const petBonus = computePetDpsBonus(S);
  const dpsPets = dpsPlayer * petBonus;

  return { atk, aspd, crit, critMul, goldBonus, dropChance, dpsPlayer, dpsPets, dpsTotal: dpsPlayer + dpsPets };
};


export const dealDamage = (S, amount) => {
  const dmg = Math.max(0, amount);
  S.enemy.hp = Math.max(0, S.enemy.hp - dmg);
  return dmg;
};

export const respawnEnemy = (S) => {
  S.enemy = computeEnemyForStage(S.stage);
};

export const bossChestReward = (S, tables, d, logPush) => {
  const bonusGold = Math.floor(S.enemy.gold * (1 + d.goldBonus) * 1.5);
  S.gold += bonusGold;

  const it = makeItem(tables, S.stage, S, null, null, true);
  S.inventory.push(it);
  S.drops += 1;
  pruneInventory(S, 70);

  logPush(S, `보스 상자! +${bonusGold}G, 아이템 1개(희귀확률↑)`);
};

export const onKill = (S, tables, d, logPush, saveState) => {
  S.kills += 1;

  const goldGain = Math.floor(S.enemy.gold * (1 + d.goldBonus));
  S.gold += goldGain;

  addExp(S, S.enemy.exp, logPush);

  if (rand01(S) < d.dropChance) {
    const it = makeItem(tables, S.stage, S);
    S.inventory.push(it);
    S.drops += 1;
    pruneInventory(S, 70);
  }

  if (S.enemy.boss) bossChestReward(S, tables, d, logPush);

  if (S.autoAdvance) S.stage += 1;
  respawnEnemy(S);
  saveState(S);
};

export const clickAttack = (S, d, logPush, saveState, tables) => {
  const critRoll = rand01(S) < d.crit;
  const dmg = d.atk * 1.6 * (critRoll ? d.critMul : 1);
  dealDamage(S, dmg);
  if (S.enemy.hp <= 0) onKill(S, tables, d, logPush, saveState);
};

export const autoTick = (S, dt, d, logPush, saveState, tables) => {
  if (!S.auto) return;
  dealDamage(S, d.dpsTotal * dt);
  if (S.enemy.hp <= 0) onKill(S, tables, d, logPush, saveState);
};
