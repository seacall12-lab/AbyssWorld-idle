import { fmt } from "./utils.js";
import { enhanceChance, ENH_MAX, petUnlockCost, petLevelUpCost, petPassiveBonusFromLevel } from "./balance.js";
import { enhanceCost, statWithEnh } from "./items.js";
import { SKILLS } from "./skills.js";

const $ = (id) => document.getElementById(id);

export const uiRefs = () => ({
  gold: $("gold"), level: $("level"), stage: $("stage"),
  atk: $("atk"), dps: $("dps"), goldBonus: $("goldBonus"),
  enemyName: $("enemyName"), bossTag: $("bossTag"),
  hpText: $("hpText"), hpBar: $("hpBar"),
  expText: $("expText"), expBar: $("expBar"),
  kills: $("kills"), drops: $("drops"),
  eqWeapon: $("eqWeapon"), eqArmor: $("eqArmor"), eqRing: $("eqRing"),
  aspd: $("aspd"), crit: $("crit"), critMul: $("critMul"),
  dropChance: $("dropChance"), petDps: $("petDps"),

  btnHit: $("btnHit"), btnAuto: $("btnAuto"),
  chkAutoAdvance: $("chkAutoAdvance"),
  btnStageUp: $("btnStageUp"), btnStageDown: $("btnStageDown"),
  chkAutoSkills: $("chkAutoSkills"),
  skills: $("skills"),
  upgrades: $("upgrades"),
  pets: $("pets"),
  btnSynthMode: $("btnSynthMode"),
  btnSynth: $("btnSynth"),
  synthStatus: $("synthStatus"),
  inventory: $("inventory"),
  log: $("log"),

  btnReset: $("btnReset"),
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  ioArea: $("ioArea"),
  ioText: $("ioText"),
  btnApplyImport: $("btnApplyImport"),
  btnCloseIO: $("btnCloseIO"),
});

export const render = ({S, d, refs, tables, handlers}) => {
  refs.gold.textContent = fmt(S.gold);
  refs.level.textContent = S.player.level;
  refs.stage.textContent = S.stage;

  refs.atk.textContent = fmt(d.atk);
  refs.dps.textContent = fmt(d.dpsTotal);
  refs.goldBonus.textContent = `${Math.round(d.goldBonus*100)}%`;

  refs.enemyName.textContent = S.enemy.name;
  refs.bossTag.style.display = S.enemy.boss ? "inline-block" : "none";

  refs.hpText.textContent = `${fmt(S.enemy.hp)} / ${fmt(S.enemy.hpMax)}`;
  refs.hpBar.style.width = `${(S.enemy.hp / S.enemy.hpMax)*100}%`;

  refs.expText.textContent = `${fmt(S.player.exp)} / ${fmt(S.player.expNeed)}`;
  refs.expBar.style.width = `${(S.player.exp / S.player.expNeed)*100}%`;

  refs.kills.textContent = fmt(S.kills);
  refs.drops.textContent = fmt(S.drops);

  refs.aspd.textContent = d.aspd.toFixed(2);
  refs.crit.textContent = `${Math.round(d.crit*100)}%`;
  refs.critMul.textContent = d.critMul.toFixed(1);
  refs.dropChance.textContent = `${Math.round(d.dropChance*100)}%`;
  refs.petDps.textContent = fmt(d.dpsPets);

  refs.btnAuto.textContent = `자동 전투: ${S.auto ? "ON" : "OFF"}`;
  refs.chkAutoAdvance.checked = !!S.autoAdvance;
  refs.chkAutoSkills.checked = !!S.autoSkills;

  const inv = S.inventory;
  const getItem = (id) => inv.find(x=>x.id===id) || null;
  const w = S.equipment.weapon ? getItem(S.equipment.weapon) : null;
  const a = S.equipment.armor  ? getItem(S.equipment.armor)  : null;
  const r = S.equipment.ring   ? getItem(S.equipment.ring)   : null;
  refs.eqWeapon.textContent = w ? `${w.name} +${w.enh||0}` : "없음";
  refs.eqArmor.textContent  = a ? `${a.name} +${a.enh||0}` : "없음";
  refs.eqRing.textContent   = r ? `${r.name} +${r.enh||0}` : "없음";

  renderSkills({S, refs, handlers});
  renderUpgrades({S, refs, handlers});
  renderPets({S, refs, tables, handlers});
  renderInventory({S, refs, handlers});
  renderLog({S, refs});

  refs.btnSynthMode.textContent = `합성 모드: ${S.synth.mode ? "ON" : "OFF"}`;
  refs.synthStatus.textContent = `${(S.synth.selected||[]).length}/3`;
  refs.btnSynth.disabled = !(S.synth.mode && (S.synth.selected||[]).length === 3);
};

const renderSkills = ({S, refs, handlers}) => {
  refs.skills.innerHTML = "";
  for (const sk of SKILLS){
    const st = S.skills[sk.key];
    const cd = st ? st.cd : 0;
    const ready = cd <= 0;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div style="min-width:0;">
        <div class="name">${sk.name}</div>
        <div class="meta">${sk.desc}</div>
        <div class="tiny mono">CD: ${ready ? "READY" : cd.toFixed(1)+"s"}</div>
        <label class="row tiny" style="gap:8px; margin-top:6px;">
          <input type="checkbox" ${st && st.auto ? "checked":""} />
          자동 사용
        </label>
      </div>
      <div class="right">
        <button class="btn-primary" ${ready ? "" : "disabled"}>사용</button>
      </div>
    `;

    const chk = div.querySelector("input[type=checkbox]");
    const btn = div.querySelector("button");

    chk.addEventListener("change", (e)=>handlers.onSkillAutoToggle(sk.key, e.target.checked));
    btn.addEventListener("click", ()=>handlers.onSkillCast(sk.key));

    refs.skills.appendChild(div);
  }
};

const renderUpgrades = ({S, refs, handlers}) => {
  refs.upgrades.innerHTML = "";
  const defs = handlers.getUpgradeDefs();
  for (const def of defs){
    const lvl = S.upgrades[def.key] || 0;
    const cost = def.cost(lvl);
    const can = S.gold >= cost;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <div class="name">${def.name} <span class="tiny mono">Lv.${lvl}</span></div>
        <div class="meta">${def.desc}</div>
      </div>
      <div class="right">
        <div class="tiny">비용</div>
        <div class="mono" style="font-weight:850;">${fmt(cost)} G</div>
        <div style="margin-top:6px;">
          <button ${can?"":"disabled"} class="btn-primary">구매</button>
        </div>
      </div>
    `;
    div.querySelector("button").addEventListener("click", ()=>handlers.onBuyUpgrade(def.key));
    refs.upgrades.appendChild(div);
  }
};

const renderPets = ({S, refs, tables, handlers}) => {
  refs.pets.innerHTML = "";
  const pets = tables.pets;

  for (let i=0;i<3;i++){
    const slot = S.pets.slots[i];
    const div = document.createElement("div");
    div.className = "item";

    if (!slot.unlocked){
      const cost = petUnlockCost(i);
      const can = S.gold >= cost;
      div.innerHTML = `
        <div>
          <div class="name">슬롯 ${i+1} <span class="tag boss">LOCK</span></div>
          <div class="meta">해금 비용: ${fmt(cost)}G</div>
        </div>
        <div class="right">
          <button class="btn-primary" ${can?"":"disabled"}>해금</button>
        </div>
      `;
      div.querySelector("button").addEventListener("click", ()=>handlers.onUnlockPetSlot(i));
    } else {
      const lvl = slot.level || 1;
      const bonus = petPassiveBonusFromLevel(lvl);
      const cost = petLevelUpCost(i, lvl);
      const can = S.gold >= cost;

      const options = pets.map(p => `<option value="${p.id}" ${p.id===slot.petId?"selected":""}>${p.name}</option>`).join("");

      div.innerHTML = `
        <div style="min-width:0;">
          <div class="name">펫 슬롯 ${i+1} <span class="tiny mono">Lv.${lvl}</span></div>
          <div class="meta">패시브: 플레이어 DPS 약 ${Math.round(bonus*100)}% (슬롯 가중치 적용)</div>
          <div class="tiny">펫 선택</div>
          <select>${options}</select>
          <div class="tiny">펫 스킬은 자동 발동(쿨다운)</div>
        </div>
        <div class="right">
          <div class="tiny">성장 비용</div>
          <div class="mono" style="font-weight:850;">${fmt(cost)} G</div>
          <div style="margin-top:6px;"><button class="btn-good" ${can?"":"disabled"}>레벨업</button></div>
        </div>
      `;

      const sel = div.querySelector("select");
      const btn = div.querySelector("button");

      sel.addEventListener("change", (e)=>handlers.onSetPet(i, e.target.value));
      btn.addEventListener("click", ()=>handlers.onLevelUpPet(i));
    }

    refs.pets.appendChild(div);
  }
};

const renderInventory = ({S, refs, handlers}) => {
  refs.inventory.innerHTML = "";
  const list = [...S.inventory].sort((a,b)=> (b.sell - a.sell));

  if (list.length === 0){
    const empty = document.createElement("div");
    empty.className = "tiny";
    empty.textContent = "인벤토리가 비어있습니다. 적 처치/보스 상자에서 아이템을 얻습니다.";
    refs.inventory.appendChild(empty);
    return;
  }

  for (const it of list){
    const equipped = S.equipment[it.type] === it.id;
    const synthMode = !!S.synth.mode;
    const checked = (S.synth.selected||[]).includes(it.id);

    const enh = it.enh || 0;
    const p = enh < ENH_MAX ? enhanceChance(enh) : 0;
    const eCost = enh < ENH_MAX ? enhanceCost(it) : 0;
    const canEnh = enh < ENH_MAX && S.gold >= eCost;

    const statParts = [];
    if (it.atk) statParts.push(`ATK +${statWithEnh(it.atk, enh, "atk")}`);
    if (it.gold) statParts.push(`골드 +${Math.round(statWithEnh(it.gold, enh, "gold")*100)}%`);

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div style="min-width:0;">
        <div class="name">
          ${synthMode ? `<input type="checkbox" ${checked?"checked":""} style="margin-right:8px;">` : ""}
          <span class="tag ${it.tagClass}">${it.rar}</span>
          ${it.name} <span class="tiny">(${it.type})</span>
          <span class="tag" style="margin-left:6px;">+${enh}</span>
          ${equipped ? `<span class="tag" style="margin-left:6px;">장착중</span>` : ""}
        </div>
        <div class="meta">${statParts.join(" · ") || "-"} <span class="tiny">· 판매 ${fmt(it.sell)}G</span></div>
        <div class="tiny">강화: 성공 ${Math.round(p*100)}% · 비용 ${enh<ENH_MAX ? fmt(eCost) : "MAX"}G</div>
      </div>
      <div class="row">
        <button class="btn-good">${equipped ? "해제" : "장착"}</button>
        <button class="btn-primary" ${canEnh ? "" : "disabled"}>강화</button>
        <button class="btn-warn">판매</button>
      </div>
    `;

    if (synthMode){
      const cb = div.querySelector("input[type=checkbox]");
      cb.addEventListener("change", ()=>handlers.onSynthSelect(it.id));
    }

    const [btnEquip, btnEnh, btnSell] = div.querySelectorAll("button");
    btnEquip.addEventListener("click", ()=>handlers.onEquip(it.id, it.type, equipped));
    btnEnh.addEventListener("click", ()=>handlers.onEnhance(it.id));
    btnSell.addEventListener("click", ()=>handlers.onSell(it.id));

    refs.inventory.appendChild(div);
  }
};

const renderLog = ({S, refs}) => {
  refs.log.innerHTML = "";
  const lines = S.log.length ? S.log : ["(로그 없음)"];
  for (const l of lines){
    const div = document.createElement("div");
    div.className = "logline mono";
    div.textContent = l;
    refs.log.appendChild(div);
  }
};
