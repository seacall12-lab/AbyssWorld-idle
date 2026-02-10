import { nowMs } from "./utils.js";
import { petUnlockCost, petLevelUpCost, petPassiveBonusFromLevel, petSlotWeight } from "./balance.js";

export const unlockPetSlot = (S, slotIndex, logPush, saveState) => {
  const slot = S.pets.slots[slotIndex];
  if (!slot || slot.unlocked) return;
  const cost = petUnlockCost(slotIndex);
  if (S.gold < cost) return;
  S.gold -= cost;
  slot.unlocked = true;
  slot.level = 1;
  slot.skillCd = 0;
  logPush(S, `펫 슬롯 해금: ${slotIndex+1}번`);
  saveState(S);
};

export const levelUpPet = (S, slotIndex, logPush, saveState) => {
  const slot = S.pets.slots[slotIndex];
  if (!slot || !slot.unlocked) return;
  const lvl = slot.level || 1;
  const cost = petLevelUpCost(slotIndex, lvl);
  if (S.gold < cost) return;
  S.gold -= cost;
  slot.level = lvl + 1;
  logPush(S, `펫 성장: 슬롯${slotIndex+1} Lv.${slot.level}`);
  saveState(S);
};

export const setPetForSlot = (S, slotIndex, petId, saveState) => {
  const slot = S.pets.slots[slotIndex];
  if (!slot) return;
  slot.petId = petId;
  slot.skillCd = slot.skillCd || 0;
  saveState(S);
};

export const computePetDpsBonus = (S) => {
  let bonus = 0;
  for (let i=0;i<3;i++){
    const slot = S.pets.slots[i];
    if (!slot || !slot.unlocked) continue;
    const lvl = slot.level || 1;
    bonus += petPassiveBonusFromLevel(lvl) * petSlotWeight(i);
  }
  return Math.max(0, Math.min(0.60, bonus));
};

export const tickPetSkills = ({S, dt, petsById, petSkillsById, d, dealDamage, logPush, saveState}) => {
  for (let i=0;i<3;i++){
    const slot = S.pets.slots[i];
    if (!slot || !slot.unlocked) continue;

    slot.skillCd = Math.max(0, (slot.skillCd || 0) - dt);

    const pet = petsById.get(slot.petId);
    if (!pet) continue;

    const sk = petSkillsById.get(pet.skillId);
    if (!sk) continue;

    if (slot.skillCd > 0) continue;

    if (sk.kind === "burst_damage") {
      const mult = sk.value || 2.0;
      dealDamage(S, d.atk * mult, true);
      logPush(S, `펫 스킬: ${pet.name} - ${sk.name}`);
    } else {
      S.buffs._petBuff = { kind: sk.kind, value: sk.value || 0, duration: sk.duration || 8 };
      S.buffs.expires.pet = nowMs() + (sk.duration || 8) * 1000;
      logPush(S, `펫 스킬: ${pet.name} - ${sk.name}`);
    }

    slot.skillCd = sk.cooldown || 20;
    saveState(S);
  }
};
