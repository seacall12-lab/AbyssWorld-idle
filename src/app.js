import { clamp, safeJsonParse } from "./utils.js";
import { baseState, loadState, saveState, logPush } from "./state.js";
import { ensureStageEnemy, computeDerived, clickAttack, autoTick, addExp, respawnEnemy, dealDamage } from "./combat.js";
import { tryEnhance, sellItem, equipItem, unequip, toggleSynthMode, toggleSynthSelect, doSynthesis } from "./items.js";
import { castSkill, autoCastSkills, tickSkillCooldowns } from "./skills.js";
import { unlockPetSlot, levelUpPet, setPetForSlot, tickPetSkills } from "./pets.js";
import { uiRefs, render } from "./ui.js";

const loadJson = async (path) => {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load: ${path}`);
  return await res.json();
};

const buildIndex = (arr) => new Map(arr.map(x=>[x.id,x]));

const upgradeDefs = [
  { key:"atk",  name:"공격력 훈련", desc:"+2 공격력(기본)", cost:(lvl)=>Math.floor(12 * Math.pow(1.17, lvl)) },
  { key:"aspd", name:"연타 훈련", desc:"+0.08 공격속도/초", cost:(lvl)=>Math.floor(18 * Math.pow(1.18, lvl)) },
  { key:"crit", name:"치명 단련", desc:"+1% 치명타 확률", cost:(lvl)=>Math.floor(30 * Math.pow(1.20, lvl)) },
  { key:"gold", name:"행운의 손", desc:"+3% 골드 보너스", cost:(lvl)=>Math.floor(25 * Math.pow(1.19, lvl)) },
];

const buyUpgrade = (S, key) => {
  const def = upgradeDefs.find(x=>x.key===key);
  if (!def) return;
  const lvl = S.upgrades[key] || 0;
  const cost = def.cost(lvl);
  if (S.gold < cost) return;
  S.gold -= cost;
  S.upgrades[key] = lvl + 1;
  saveState(S);
};

const showIO = (refs, mode) => {
  refs.ioArea.style.display = "block";
  refs.ioArea.dataset.mode = mode;
};
const hideIO = (refs) => {
  refs.ioArea.style.display = "none";
  refs.ioArea.dataset.mode = "";
  refs.ioText.value = "";
};

(async () => {
  const tables = {
    weapons: await loadJson("./data/weapons.json"),
    armors:  await loadJson("./data/armors.json"),
    rings:   await loadJson("./data/rings.json"),
    pets:    await loadJson("./data/pets.json"),
    petSkills: await loadJson("./data/pet_skills.json"),
  };
  const petsById = buildIndex(tables.pets);
  const petSkillsById = buildIndex(tables.petSkills);

  const S = loadState((tmpS)=>computeDerived(tmpS, tables));
  ensureStageEnemy(S);

  if (S._offlineExpGain) {
    addExp(S, S._offlineExpGain, logPush);
    delete S._offlineExpGain;
    saveState(S);
  }

  const refs = uiRefs();

  const handlers = {
    getUpgradeDefs: () => upgradeDefs,

    onBuyUpgrade: (key) => { buyUpgrade(S, key); rerender(); },

    onEquip: (itemId, type, equipped) => {
      if (equipped) unequip(S, type, saveState);
      else equipItem(S, itemId, logPush, saveState);
      rerender();
    },

    onSell: (itemId) => { sellItem(S, itemId, logPush, saveState); rerender(); },

    onEnhance: (itemId) => { tryEnhance(S, itemId, logPush, saveState); rerender(); },

    onSynthMode: () => { toggleSynthMode(S, saveState); rerender(); },
    onSynthSelect: (itemId) => { toggleSynthSelect(S, itemId, saveState); rerender(); },
    onSynthesize: () => { doSynthesis(S, tables, logPush, saveState); rerender(); },

    onSkillCast: (key) => {
      const d = computeDerived(S, tables);
      castSkill({S, key, d, dealDamage, logPush, saveState});
      rerender();
    },
    onSkillAutoToggle: (key, enabled) => { S.skills[key].auto = enabled; saveState(S); rerender(); },

    onUnlockPetSlot: (i) => { unlockPetSlot(S, i, logPush, saveState); rerender(); },
    onLevelUpPet: (i) => { levelUpPet(S, i, logPush, saveState); rerender(); },
    onSetPet: (i, petId) => { setPetForSlot(S, i, petId, saveState); rerender(); },
  };

  refs.btnHit.addEventListener("click", ()=>{
    const d = computeDerived(S, tables);
    clickAttack(S, d, logPush, saveState, tables);
    rerender();
  });

  refs.btnAuto.addEventListener("click", ()=>{
    S.auto = !S.auto;
    saveState(S);
    rerender();
  });

  refs.chkAutoAdvance.addEventListener("change", (e)=>{
    S.autoAdvance = e.target.checked;
    saveState(S);
    rerender();
  });

  refs.btnStageUp.addEventListener("click", ()=>{
    S.stage += 1;
    respawnEnemy(S);
    saveState(S);
    rerender();
  });
  refs.btnStageDown.addEventListener("click", ()=>{
    S.stage = Math.max(1, S.stage - 1);
    respawnEnemy(S);
    saveState(S);
    rerender();
  });

  refs.chkAutoSkills.addEventListener("change", (e)=>{
    S.autoSkills = e.target.checked;
    saveState(S);
    rerender();
  });

  refs.btnSynthMode.addEventListener("click", handlers.onSynthMode);
  refs.btnSynth.addEventListener("click", handlers.onSynthesize);

  refs.btnReset.addEventListener("click", ()=>{
    if (!confirm("정말 초기화할까요? 저장 데이터가 삭제됩니다.")) return;
    localStorage.removeItem("idle_rpg_pwa_v1");
    Object.assign(S, baseState());
    saveState(S);
    rerender();
  });

  refs.btnExport.addEventListener("click", ()=>{
    refs.ioText.value = JSON.stringify(S, null, 2);
    showIO(refs, "export");
  });
  refs.btnImport.addEventListener("click", ()=>{
    refs.ioText.value = "";
    showIO(refs, "import");
  });
  refs.btnCloseIO.addEventListener("click", ()=>hideIO(refs));
  refs.btnApplyImport.addEventListener("click", ()=>{
    if (refs.ioArea.dataset.mode !== "import") return;
    const obj = safeJsonParse(refs.ioText.value);
    if (!obj) { alert("JSON 형식이 올바른지 확인하세요."); return; }
    const fresh = baseState();
    Object.assign(fresh, obj);
    Object.assign(S, fresh);
    saveState(S);
    rerender();
    alert("가져오기 완료");
    hideIO(refs);
  });

  const rerender = () => {
    ensureStageEnemy(S);
    const d = computeDerived(S, tables);
    render({S, d, refs, tables, handlers});
  };

  if (!S.log?.length) logPush(S, "시작! (보스는 10스테이지마다)");
  saveState(S);
  rerender();

  let last = performance.now();
  const loop = (t) => {
    const dt = clamp((t-last)/1000, 0, 0.2);
    last = t;

    tickSkillCooldowns(S, dt);

    const d = computeDerived(S, tables);

    autoCastSkills({S, d, dealDamage, logPush, saveState});

    tickPetSkills({S, dt, petsById, petSkillsById, d, dealDamage, logPush, saveState});

    autoTick(S, dt, d, logPush, saveState, tables);

    refs.hpText.textContent = `${Math.floor(S.enemy.hp)} / ${Math.floor(S.enemy.hpMax)}`;
    refs.hpBar.style.width = `${(S.enemy.hp / S.enemy.hpMax)*100}%`;
    refs.expText.textContent = `${Math.floor(S.player.exp)} / ${Math.floor(S.player.expNeed)}`;
    refs.expBar.style.width = `${(S.player.exp / S.player.expNeed)*100}%`;

    requestAnimationFrame(loop);
  };

  setInterval(()=>saveState(S), 5000);
  requestAnimationFrame(loop);
})().catch((e)=>{
  console.error(e);
  alert("초기 로딩 실패: 콘솔(F12) 에러를 확인하세요.");
});
