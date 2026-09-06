// 저장 — 키는 «게임ID:용도» 네임스페이스, 값은 {version, data} 래퍼 + 마이그레이션 체인.
// 🔴 개인정보는 저장하지 않는다. 저장하는 것: 코인·해금·최고기록·오답노트 박스·미션 진행뿐.
// localStorage 접근은 전부 try/catch — 사생활 보호 모드·차단 설정에서 접근 자체가 throw 한다.

import { SAVE, SHOP, SRS, MODES, DEFAULT_MODE, DAILY } from './balance.js';
import { MASTERY_WINDOW } from './mastery.js';

/** 숙련도 칸 키 모양 — mastery.bucketOf 가 만드는 것만 통과시킨다 */
const MASTERY_KEY_RE = /^(gugudan:[2-9]|words34|words56)$/;

const SRS_MAX_BOX = SRS.MAX_BOX;

export function emptySave() {
  return {
    coins: 0,
    skin: 'fox',
    theme: 'dawn',
    ownedSkins: ['fox'],
    ownedThemes: ['dawn'],
    best: {},          // subject -> 최고 층
    notes: {},         // 영속 오답노트 박스
    missions: { day: '', maxDay: '', progress: {}, claimed: [] },
    totals: { runs: 0, correct: 0, asked: 0 },
    settings: { sound: true, reducedMotion: false, colorSafe: false },
    mode: DEFAULT_MODE,   // 마지막으로 고른 모드
    seenHow: false,       // 놀이 방법 안내를 이미 봤는가
    // ── v4 (2026-09-06) ──
    // 🔴 여정 해금은 «저장하지 않는다». journey.js 가 최고 기록에서 매번 유도한다 —
    //    저장하면 손으로 고쳐 넣어 건너뛸 수 있다(D38). 위조할 값을 만들지 않는 것이 방어다.
    flags: {},            // 오늘의 계단 깃발 — 'YYYY-MM-DD|과목' -> 별(1~3)
    week: { week: '', days: [], claimed: false },   // 이번 주 도장(누적·연속 아님)
    mastery: {},          // 숙련도 — 'gugudan:7' | 'words34' -> {c, a}
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
  /** v2 → v3: 최고 기록을 «과목:모드» 로 나눈다.
   *  🔴 모드마다 층수의 뜻이 다르다(클래식 78층 · 60초 질주 55층). 한 칸에 섞으면 기록이
   *     아니라 잡음이 된다. 기존 값은 전부 클래식에서 세운 것이므로 그리로 옮긴다. */
  2: (data) => {
    const d = { ...emptySave(), ...(data && typeof data === 'object' ? data : {}) };
    const old = d.best && typeof d.best === 'object' ? d.best : {};
    const best = {};
    for (const [k, v] of Object.entries(old)) best[k.includes(':') ? k : `${k}:classic`] = v;
    return { ...d, best, mode: MODES[d.mode] ? d.mode : DEFAULT_MODE };
  },
  /** v3 → v4: 여정·오늘의 계단·주간 도장·숙련도 칸을 «비워서» 연다.
   *  🔴 옛 저장에서 이 값들을 «유추하지» 않는다. 최고 기록이 80층이라고 지난 날짜에
   *     깃발을 소급해 찍으면, 아이가 하지 않은 날을 했다고 말하는 셈이다.
   *     여정 진행도만은 최고 기록에서 그때그때 유도되므로 옮길 것이 없다(journey.js). */
  3: (data) => {
    const d = { ...emptySave(), ...(data && typeof data === 'object' ? data : {}) };
    return { ...d, flags: {}, week: { week: '', days: [], claimed: false }, mastery: {} };
  },
};

export function migrate(version, data) {
  // 미래 버전·음수 버전은 «이 코드가 모르는 형식»이다 — 현행처럼 받아들이지 않는다.
  if (!Number.isInteger(version) || version < 1 || version > SAVE.VERSION) return emptySave();
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

const MAX_COINS = 9_999_999;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 유한한 0 이상 정수로 강제. "Infinity"·NaN·문자열·객체를 전부 걸러 낸다. */
function intOrZero(v, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

function plainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * 저장 데이터 정합화.
 * 🔴 localStorage 는 신뢰 경계 «밖»이다 — 타입까지 강제해야 한다.
 *    「배열인 줄 알았는데 객체」 하나가 includes/spread 에서 TypeError 를 내고,
 *    load() 의 catch 가 코인·최고기록·오답노트를 통째로 날린다.
 */
export function sanitize(data) {
  const base = emptySave();
  const out = { ...base, ...plainObject(data) };

  out.coins = intOrZero(out.coins, MAX_COINS);

  const skinIds = SHOP.SKINS.map((s) => s.id);
  const themeIds = SHOP.THEMES.map((s) => s.id);
  const asIdList = (v, valid, fallback) => Array.from(new Set([
    fallback,
    ...(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []),
  ])).filter((id) => valid.includes(id));
  out.ownedSkins = asIdList(out.ownedSkins, skinIds, 'fox');
  out.ownedThemes = asIdList(out.ownedThemes, themeIds, 'dawn');
  if (!out.ownedSkins.includes(out.skin)) out.skin = 'fox';
  if (!out.ownedThemes.includes(out.theme)) out.theme = 'dawn';

  // 🔴 모드는 화이트리스트로만 통과시킨다 — localStorage 는 신뢰 경계 밖이라
  //    낯선 값이 들어오면 MODES[mode] 가 undefined 가 되어 rules 참조에서 그 자리에 죽는다.
  if (!MODES[out.mode]) out.mode = DEFAULT_MODE;
  out.seenHow = out.seenHow === true;

  const best = plainObject(out.best);
  out.best = {};
  for (const [k, v] of Object.entries(best)) out.best[k] = intOrZero(v, 1_000_000);

  const notes = plainObject(out.notes);
  out.notes = {};
  for (const [id, rec] of Object.entries(notes)) {
    const r = plainObject(rec);
    const box = Number(r.box);
    if (!Number.isInteger(box) || box < 0 || box > SRS_MAX_BOX) continue;   // 손상 항목은 버린다
    if (typeof r.due !== 'string' || !DAY_RE.test(r.due)) continue;
    out.notes[id] = { box, due: r.due };
  }

  out.settings = { ...base.settings };
  for (const k of Object.keys(base.settings)) {
    const v = plainObject(data).settings ? plainObject(plainObject(data).settings)[k] : undefined;
    if (typeof v === 'boolean') out.settings[k] = v;
  }

  const m = plainObject(out.missions);
  const day = typeof m.day === 'string' && DAY_RE.test(m.day) ? m.day : '';
  const maxDay = typeof m.maxDay === 'string' && DAY_RE.test(m.maxDay) ? m.maxDay : day;
  const progress = {};
  for (const [k, v] of Object.entries(plainObject(m.progress))) progress[k] = intOrZero(v, 1_000_000);
  out.missions = {
    day, maxDay, progress,
    claimed: Array.isArray(m.claimed) ? m.claimed.filter((x) => typeof x === 'string') : [],
  };

  const t = plainObject(out.totals);
  out.totals = {
    runs: intOrZero(t.runs, 1_000_000),
    correct: intOrZero(t.correct, 10_000_000),
    asked: intOrZero(t.asked, 10_000_000),
  };

  // ── v4 칸 ─────────────────────────────────────────────────────
  // 🔴 여기도 신뢰 경계 밖이다. 모양이 어긋난 항목은 «고치지 말고 버린다» —
  //    반쯤 고친 값이 들어오면 나중에 그게 진짜였는지 알 수 없게 된다(notes 와 같은 원칙).
  const flags = plainObject(out.flags);
  out.flags = {};
  for (const [k, v] of Object.entries(flags)) {
    const m = String(k).split('|');
    if (m.length !== 2 || !DAY_RE.test(m[0])) continue;
    const stars = Number(v);
    if (!Number.isInteger(stars) || stars < 1 || stars > 3) continue;
    out.flags[k] = stars;
  }
  // 상한을 넘겨 들어온 저장은 오래된 것부터 버린다(무한히 자라지 않게)
  const fkeys = Object.keys(out.flags).sort();
  while (fkeys.length > DAILY.FLAG_KEEP) delete out.flags[fkeys.shift()];

  const w = plainObject(out.week);
  const days = Array.isArray(w.days)
    ? [...new Set(w.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  out.week = {
    week: typeof w.week === 'string' && DAY_RE.test(w.week) ? w.week : '',
    days: out.week && typeof w.week === 'string' && DAY_RE.test(w.week) ? days : [],
    claimed: w.claimed === true,
  };

  const mast = plainObject(out.mastery);
  out.mastery = {};
  for (const [k, v] of Object.entries(mast)) {
    if (!MASTERY_KEY_RE.test(String(k))) continue;
    const r = plainObject(v);
    const a = Number(r.a);
    const c = Number(r.c);
    if (!Number.isInteger(a) || a < 0 || a > MASTERY_WINDOW) continue;
    if (!Number.isInteger(c) || c < 0 || c > a) continue;    // 맞힌 수가 푼 수보다 많을 수 없다
    out.mastery[k] = { c, a };
  }
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
