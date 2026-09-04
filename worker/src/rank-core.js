// 일일 등수의 «순수한 부분» — Durable Object 바깥에서 테스트할 수 있게 떼어 놓는다.
// 🔴 판정은 전부 여기 있다. rank.js 는 저장소 배선만 한다.

export const KEEP = 50;              // 오늘 판에 남기는 줄 수
export const YDAY_KEEP = 3;          // 어제 상위 몇 줄을 기념으로 남길지
export const MAX_FLOOR = 500;        // 완벽 플레이 중앙값이 200층이다 — 그 배를 상한으로 둔다
export const NICK_CAP = 12;
export const SUBJECTS = ['gugudan', 'words34', 'words56'];

/** 한국 날짜(UTC+9). Workers 의 시계는 UTC 라 그냥 자르면 **아침 9시에 날이 바뀐다.** */
export function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
}

/**
 * 🔴 이름 수용 규칙 — 이 게이트가 «실명이 서버에 남지 않는다»를 실제로 집행한다.
 *    오르답은 싱글 플레이라 서버가 원래 이름을 알 이유가 전혀 없다.
 *    그래서 기기가 가려서 보내고, 서버는 «가려지지 않은 직접 이름»을 받지 않는다.
 *    - 자동 생성 이름(빠른여우07)  → 그대로 받는다. 3만 가지 중 하나이고 사람을 안 가리킨다.
 *    - 직접 지은 이름            → 반드시 별표가 있어야 받는다(김*수). 없으면 거부.
 */
export function acceptName(n, isGenerated) {
  if (typeof n !== 'string') return null;
  const s = n.normalize('NFC').slice(0, NICK_CAP);
  if (!s) return null;
  if (!/^[가-힣a-zA-Z0-9*]+$/.test(s)) return null;    // 낱자·공백·특수문자 차단
  if (isGenerated(s)) return s;
  if (!s.includes('*')) return null;                   // 가려지지 않은 직접 이름은 받지 않는다
  if (s.replace(/\*/g, '').length < 1) return null;    // 별표만 있는 이름
  return s;
}

/** 들어온 줄 하나를 «저장해도 되는 모양»으로. 못 쓰면 null. */
export function clean(r, isGenerated) {
  const n = acceptName(r && r.n, isGenerated);
  const s = Math.round(Number(r && r.s) || 0);
  if (!n || !(s > 0) || s > MAX_FLOOR) return null;
  const sub = SUBJECTS.includes(r.sub) ? r.sub : SUBJECTS[0];
  return { n, s, sub };
}

/** 날이 바뀌었으면 오늘 판을 비우고 «어제 상위»만 남긴다. */
export function rollover(b, day) {
  if (b && b.day === day) return b;
  return { day, rows: [], yday: b ? { day: b.day, rows: (b.rows || []).slice(0, YDAY_KEEP) } : null };
}

/** 판 + 새 줄 → 새 판. 원본을 건드리지 않는다.
 *  🔴 같은 이름은 «최고 기록 한 줄»만 남긴다 — 한 아이가 열 판 하면 판이 그 아이로 도배된다. */
export function merge(board, row, day, isGenerated) {
  const b = rollover(board, day);
  const add = clean(row, isGenerated);
  return add ? { ...b, rows: dedupe([...b.rows, add]) } : b;
}

/** 이름별 최고 기록만 남기고 내림차순 정렬 */
export function dedupe(rows) {
  const best = new Map();
  for (const r of rows) {
    const k = `${r.n}|${r.sub}`;
    const cur = best.get(k);
    if (!cur || r.s > cur.s) best.set(k, r);
  }
  return [...best.values()].sort((x, y) => y.s - x.s).slice(0, KEEP);
}

/** 내 기록이 오늘 판에서 몇 등인가(1부터). 판 밖이면 null. */
export function rankOf(rows, score) {
  if (!(score > 0)) return null;
  const better = rows.filter((r) => r.s > score).length;
  return better + 1;
}
