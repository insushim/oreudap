// 저장 — 키는 «게임ID:용도» 네임스페이스, 값은 {version, data} 래퍼 + 마이그레이션 체인.
// 🔴 개인정보는 저장하지 않는다. 저장하는 것: 코인·해금·최고기록·오답노트 박스·미션 진행뿐.
// localStorage 접근은 전부 try/catch — 사생활 보호 모드·차단 설정에서 접근 자체가 throw 한다.

import { SAVE, SHOP } from './balance.js';

export function emptySave() {
  return {
    coins: 0,
    skin: 'fox',
    theme: 'dawn',
    ownedSkins: ['fox'],
    ownedThemes: ['dawn'],
    best: {},          // subject -> 최고 층
    notes: {},         // 영속 오답노트 박스
    missions: { day: '', progress: {}, claimed: [] },
    totals: { runs: 0, correct: 0, asked: 0 },
    settings: { sound: true, reducedMotion: false, colorSafe: false },
  };
}

/** v1 → v2: ownedThemes/settings 추가, best 를 객체로 */
const MIGRATIONS = {
  1: (data) => ({
    ...emptySave(),
    ...data,
    best: typeof data.best === 'number' ? { gugudan: data.best } : (data.best || {}),
    ownedThemes: data.ownedThemes || ['dawn'],
    settings: { sound: true, reducedMotion: false, colorSafe: false, ...(data.settings || {}) },
  }),
};

export function migrate(version, data) {
  let v = version;
  let d = data;
  while (v < SAVE.VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return emptySave();
    d = step(d);
    v += 1;
  }
  return d;
}

/** 저장 데이터 정합화 — 알 수 없는 id·음수 코인을 정리한다 */
export function sanitize(data) {
  const base = emptySave();
  const out = { ...base, ...data };
  out.coins = Math.max(0, Math.floor(Number(out.coins) || 0));
  const skinIds = SHOP.SKINS.map((s) => s.id);
  const themeIds = SHOP.THEMES.map((s) => s.id);
  out.ownedSkins = Array.from(new Set(['fox', ...(out.ownedSkins || [])])).filter((id) => skinIds.includes(id));
  out.ownedThemes = Array.from(new Set(['dawn', ...(out.ownedThemes || [])])).filter((id) => themeIds.includes(id));
  if (!out.ownedSkins.includes(out.skin)) out.skin = 'fox';
  if (!out.ownedThemes.includes(out.theme)) out.theme = 'dawn';
  out.best = out.best && typeof out.best === 'object' ? out.best : {};
  out.notes = out.notes && typeof out.notes === 'object' ? out.notes : {};
  out.settings = { ...base.settings, ...(out.settings || {}) };
  out.missions = { ...base.missions, ...(out.missions || {}) };
  out.totals = { ...base.totals, ...(out.totals || {}) };
  return out;
}

export function load(store) {
  const ls = store || safeLocalStorage();
  if (!ls) return emptySave();
  let raw = null;
  try { raw = ls.getItem(SAVE.KEY); } catch { return emptySave(); }
  if (!raw) return emptySave();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptySave();
    const version = Number(parsed.version) || 1;
    const data = parsed.data || {};
    return sanitize(version === SAVE.VERSION ? data : migrate(version, data));
  } catch {
    return emptySave();
  }
}

export function save(data, store) {
  const ls = store || safeLocalStorage();
  if (!ls) return false;
  try {
    ls.setItem(SAVE.KEY, JSON.stringify({ version: SAVE.VERSION, data: sanitize(data) }));
    return true;
  } catch {
    return false;
  }
}

export function safeLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__oreudap_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
