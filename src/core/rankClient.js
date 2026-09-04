// 일일 등수 클라이언트.
//
// 🔴 «가리는 자리»가 보내기 «전»이다. 직접 지은 이름의 원문은 이 기기를 영영 벗어나지 않는다.
//    화면에서만 가리면 서버에는 '김철수' 가 그대로 남는다 — 가린 티만 나고 지켜지는 건 없다.
//    (리로드 아레나는 멀티라 방이 이름을 알 수밖에 없어 서버에서 가린다. 오르답은 싱글이라
//     서버가 이름을 알 이유가 아예 없다 — 그래서 여기서 가린다.)
//
// 🔴 서버는 별표 없는 «직접 이름»을 거부한다(worker/src/rank-core.js 의 acceptName).
//    즉 이 규칙은 예의가 아니라 게이트다.

import { makeNick, isUsableNick, coerceNick, maskNick } from './nickname.js';

export const RANK_API = 'https://oreudap-rank.simssijjang-d79.workers.dev/api/rank';
const NICK_KEY = 'oreudap:nick';
const SENT_KEY = 'oreudap:sent';   // 오늘 이미 올린 최고 기록 — 같은 점수를 반복해 올리지 않는다

function ls() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function todayKey(now = Date.now()) {
  return new Date(now + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
}

/** 저장된 이름. 없거나 못 쓰는 이름이면 새로 지어 «즉시 저장»한다
 *  (저장하지 않으면 새로고침마다 이름이 바뀐다). */
export function getNick() {
  const s = ls();
  let n = null;
  try { n = s && s.getItem(NICK_KEY); } catch { n = null; }
  if (!isUsableNick(n)) {
    n = makeNick();
    try { if (s) s.setItem(NICK_KEY, n); } catch { /* 사생활 보호 모드 */ }
  }
  return n;
}

/** @returns {{ok:boolean, nick?:string, reason?:string}} */
export function setNick(raw) {
  const clean = coerceNick(raw);
  if (!clean) return { ok: false, reason: '이 이름은 쓸 수 없어요. 다른 이름을 지어 주세요.' };
  try { const s = ls(); if (s) s.setItem(NICK_KEY, clean); } catch { /* 무시 */ }
  return { ok: true, nick: clean };
}

export function suggestNick() { return makeNick(); }

/** 화면과 서버에 나갈 «가려진» 이름 */
export function displayNick(n) { return maskNick(n || getNick()); }

function sentBest(now) {
  const s = ls();
  try {
    const raw = s && s.getItem(SENT_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.day === todayKey(now) ? (v.best || {}) : {};
  } catch { return {}; }
}

/** 오늘 판 상위 n줄 */
export async function fetchBoard(n = 10, fetchFn = fetch) {
  const r = await fetchFn(`${RANK_API}?n=${n}`, { method: 'GET' });
  if (!r.ok) throw new Error(`rank ${r.status}`);
  return r.json();
}

/**
 * 기록 올리기. 오늘 이미 올린 내 최고보다 낮으면 «보내지 않는다» —
 * 서버 쓰기를 아끼고(무료 한도), 판도 같은 아이로 도배되지 않는다.
 */
export async function submitScore(subject, floor, opts = {}) {
  const now = opts.now || Date.now();
  const fetchFn = opts.fetch || fetch;
  if (!(floor > 0)) return { skipped: 'zero' };
  const best = sentBest(now);
  if ((best[subject] || 0) >= floor) return { skipped: 'notbest' };

  const body = { n: displayNick(opts.nick), s: floor, sub: subject };
  const r = await fetchFn(RANK_API, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({ ok: false }));
  if (out.ok) {
    try {
      const s = ls();
      if (s) s.setItem(SENT_KEY, JSON.stringify({ day: todayKey(now), best: { ...best, [subject]: floor } }));
    } catch { /* 무시 */ }
  }
  return out;
}
