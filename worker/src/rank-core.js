// 일일 등수의 «순수한 부분» — Durable Object 바깥에서 테스트할 수 있게 떼어 놓는다.
// 🔴 판정은 전부 여기 있다. rank.js 는 저장소 배선만 한다.

export const KEEP = 50;              // 오늘 판에 남기는 줄 수
export const YDAY_KEEP = 3;          // 어제 상위 몇 줄을 기념으로 남길지
export const MAX_FLOOR = 500;        // 완벽 플레이 중앙값이 200층이다 — 그 배를 상한으로 둔다
export const NICK_CAP = 12;
export const SUBJECT_IDS = ['gugudan', 'words34', 'words56'];
export const MODE_IDS = ['classic', 'thrill', 'sprint'];
// 🔴 표는 «같은 규칙끼리»만 줄 세워야 뜻이 있다. 60초 질주 55층과 무한 78층을 한 표에 넣으면
//    등수가 실력이 아니라 모드 선택을 재게 된다. 그래서 과목이 아니라 «과목:모드» 가 표의 단위다.
//    옛 클라이언트가 보내는 모드 없는 값은 클래식으로 읽는다(호환).
export const SUBJECTS = SUBJECT_IDS.flatMap((s) => MODE_IDS.map((m) => `${s}:${m}`));

/**
 * «과목» 과 «모드» 를 표의 키 하나로 합친다.
 * 🔴 두 필드를 따로 받는 이유는 배포 순서다. 클라이언트가 `sub:'words56:sprint'` 를 보내면
 *    아직 옛 워커가 돌고 있는 동안 그 값이 화이트리스트에 없어 SUBJECTS[0](구구단)으로 떨어진다 —
 *    즉 영단어 기록이 구구단 표에 실린다. 필드를 나눠 두면 옛 워커는 mode 를 무시하고
 *    과목만 제대로 쓰므로, 클라이언트를 먼저 배포해도 아무것도 망가지지 않는다.
 */
export function normSub(v, mode) {
  const raw = typeof v === 'string' ? v : '';
  const [subject, inlineMode] = raw.split(':');
  const sub = SUBJECT_IDS.includes(subject) ? subject : SUBJECT_IDS[0];
  const m = typeof mode === 'string' && MODE_IDS.includes(mode) ? mode
    : (MODE_IDS.includes(inlineMode) ? inlineMode : 'classic');
  return `${sub}:${m}`;
}

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
  const sub = normSub(r && r.sub, r && r.m);
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
