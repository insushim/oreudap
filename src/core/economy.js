// 코인·상점·일일 미션 — GDD §1-4-3
// 🔴 일일 미션은 «학습 행위»에만 결부한다. 런 횟수·앱 실행으로 달성되면
//    코인 경제가 «공부 안 해도 도는» 구조가 되어 §1-2 원칙이 우회된다(D27).

import { MISSIONS, SHOP } from './balance.js';
import { dayKey } from './srs.js';

export function todayMissions(saveData, nowTs) {
  const key = dayKey(nowTs);
  // 🔴 기기 시계를 어제로 되돌려 같은 보상을 다시 받는 경로를 막는다 —
  //    «본 적 있는 가장 나중 날짜»보다 이른 날짜로는 초기화하지 않는다.
  const seen = saveData.missions.maxDay || saveData.missions.day || '';
  if (key < seen) return snapshotMissions(saveData);
  if (saveData.missions.day !== key) {
    saveData.missions = { day: key, maxDay: key, progress: {}, claimed: [] };
  } else if (saveData.missions.maxDay !== key) {
    saveData.missions.maxDay = key;
  }
  return snapshotMissions(saveData);
}

function snapshotMissions(saveData) {
  const progress = saveData.missions.progress || {};
  const claimed = Array.isArray(saveData.missions.claimed) ? saveData.missions.claimed : [];
  return MISSIONS.map((m) => ({
    ...m,
    done: (progress[m.id] || 0) >= m.goal,
    claimed: claimed.includes(m.id),
    value: Math.min(m.goal, progress[m.id] || 0),
  }));
}

/**
 * 런 결과를 미션 진행에 반영한다.
 * @param {object} saveData
 * @param {{correct:number, bestStreak:number, reviewCorrect:number}} run
 * @returns {{gained:number, completed:string[]}}
 */
export function applyRun(saveData, run, nowTs) {
  todayMissions(saveData, nowTs); // 날짜가 바뀌었으면 여기서 초기화된다
  const p = saveData.missions.progress;
  p.correct30 = (p.correct30 || 0) + run.correct;
  p.streak10 = (p.streak10 || 0) + (run.bestStreak >= 10 ? 1 : 0);
  p.review5 = (p.review5 || 0) + run.reviewCorrect;

  let gained = 0;
  const completed = [];
  for (const m of MISSIONS) {
    if ((p[m.id] || 0) >= m.goal && !saveData.missions.claimed.includes(m.id)) {
      saveData.missions.claimed.push(m.id);
      gained += m.reward;
      completed.push(m.id);
    }
  }
  saveData.coins += gained;
  return { gained, completed };
}

const KINDS = { skin: 'SKINS', theme: 'THEMES' };

export function priceOf(kind, id) {
  if (!KINDS[kind]) return null;      // 알 수 없는 kind 가 theme 으로 취급되던 경로를 막는다
  const found = SHOP[KINDS[kind]].find((x) => x.id === id);
  return found ? found.price : null;
}

/** @returns {{ok:boolean, reason?:string}} */
export function buy(saveData, kind, id) {
  if (!KINDS[kind]) return { ok: false, reason: 'unknown' };
  const price = priceOf(kind, id);
  if (price === null) return { ok: false, reason: 'unknown' };
  const owned = kind === 'skin' ? saveData.ownedSkins : saveData.ownedThemes;
  if (owned.includes(id)) return { ok: false, reason: 'owned' };
  if (saveData.coins < price) return { ok: false, reason: 'poor' };
  saveData.coins -= price;
  owned.push(id);
  return { ok: true };
}

export function equip(saveData, kind, id) {
  if (!KINDS[kind]) return false;
  const owned = kind === 'skin' ? saveData.ownedSkins : saveData.ownedThemes;
  if (!owned.includes(id)) return false;
  if (kind === 'skin') saveData.skin = id; else saveData.theme = id;
  return true;
}
