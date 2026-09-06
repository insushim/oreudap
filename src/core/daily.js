// 오늘의 계단 — 「내일 또 올 이유」.
//
// 🔴 이 파일의 전부가 «결정론»이다. 날짜와 과목만 주면 목표층·규칙·별 문턱이 정해진다.
//    그래서 서버도 계정도 필요 없다 — 전국 어디서 실행해도 같은 날이면 같은 판이 나온다.
//    (D37 이 이걸 기계로 잰다. 기기가 하나뿐이라 눈으로는 확인할 수 없는 성질이다.)
//
// 🔴 Date.now() 를 이 파일 안에서 부르지 않는다. 시각은 «주입»받는다 —
//    안 그러면 테스트가 자정에만 깨지는 종류의 결함이 생기고, 그건 재현이 거의 불가능하다.

import { DAILY } from './balance.js';
import { makeRng } from './rng.js';
import { dayKey } from './srs.js';

/** 오늘의 규칙 — 판을 «다르게» 만들되 학습을 해치지 않는 것만 */
const RULES = [
  { id: 'dan7',  label: '7단이 자주 나와요',        scope: [7] },
  { id: 'dan8',  label: '8단이 자주 나와요',        scope: [8] },
  { id: 'dan69', label: '6단과 9단이 자주 나와요',  scope: [6, 9] },
  { id: 'hard',  label: '어려운 단만 나와요',       scope: [6, 7, 8, 9] },
  { id: 'all',   label: '모든 단이 골고루 나와요',  scope: null },
];

/**
 * 날짜 문자열을 숫자 시드로. 🔴 문자열을 그대로 넘기지 않는다 —
 * makeRng 가 숫자를 기대하고, 문자열이 들어가면 조용히 같은 시드가 되어 «매일 같은 판»이 된다.
 */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 오늘의 계단 한 판의 «설계도». 같은 (day, subject) 면 언제나 같은 값이다.
 * @param {string} day 'YYYY-MM-DD'
 * @param {string} subject 'gugudan' | 'words34' | 'words56'
 */
export function dailyPlan(day, subject) {
  const seed = hashSeed(`${day}|${subject}`);
  const rng = makeRng(seed);
  const span = DAILY.GOAL_MAX - DAILY.GOAL_MIN;
  // 🔴 5의 배수로 떨군다 — 「목표 47층」보다 「목표 45층」이 아이에게 목표처럼 읽힌다.
  const goal = DAILY.GOAL_MIN + Math.round((rng() * span) / 5) * 5;
  // 규칙은 구구단에만 뜻이 있다(영단어는 scope 가 없다) — 없는 규칙을 지어내지 않는다.
  const rule = subject === 'gugudan' ? RULES[Math.floor(rng() * RULES.length)] : null;
  return {
    day,
    subject,
    seed,
    goal,
    rule: rule ? { id: rule.id, label: rule.label } : null,
    scope: rule ? rule.scope : null,
    stars: {
      one: Math.max(1, Math.round(goal * DAILY.STAR2_RATIO)),
      two: goal,
      threeAcc: DAILY.ACC_STAR,
    },
  };
}

/** 오늘 날짜의 설계도 (시각 주입) */
export function planForNow(subject, now = Date.now()) {
  return dailyPlan(dayKey(now), subject);
}

/**
 * 한 판의 결과로 별 몇 개인가. 0~3.
 * 🔴 별 3개는 «목표 달성 + 정확도»다. 정확도만으로는 3개가 안 된다 —
 *    두 문제만 풀고 100% 를 만드는 길을 열어 두면 그게 최적 전략이 되어 학습이 줄어든다.
 */
export function starsFor(plan, { floor, accuracy }) {
  const f = Number(floor) || 0;
  const acc = Number(accuracy) || 0;
  let s = 0;
  if (f >= plan.stars.one) s = 1;
  if (f >= plan.stars.two) s = 2;
  if (s === 2 && acc >= plan.stars.threeAcc) s = 3;
  return s;
}

/**
 * 깃발 도감에 오늘 결과를 적는다. 원본을 건드리지 않고 새 객체를 돌려준다.
 *
 * 🔴 «더 좋은 결과만» 남긴다. 하루에 여러 판 해도 그날의 최고가 남는다 —
 *    나중에 못 한 판이 앞의 별을 지우면 아이는 다시 하기를 무서워하게 된다.
 * 🔴 지난 날을 벌하지 않는다. 안 한 날은 그냥 «없음»이고, 진행도를 깎지 않는다.
 */
export function recordFlag(flags, plan, stars) {
  const next = { ...(flags || {}) };
  const key = `${plan.day}|${plan.subject}`;
  const prev = Number(next[key]) || 0;
  if (stars > prev) next[key] = stars;
  // 오래된 것부터 버려 상한을 지킨다(로컬 저장이 무한히 자라지 않게)
  const keys = Object.keys(next).sort();
  while (keys.length > DAILY.FLAG_KEEP) delete next[keys.shift()];
  return next;
}

/** 도감에 찍힌 깃발 수와 별 합계 */
export function flagSummary(flags) {
  const vals = Object.values(flags || {}).map((v) => Number(v) || 0).filter((v) => v > 0);
  return { days: vals.length, stars: vals.reduce((a, b) => a + b, 0) };
}

/** 오늘 이미 판정을 받았는가 (있으면 별 몇 개) */
export function todayStars(flags, plan) {
  return Number((flags || {})[`${plan.day}|${plan.subject}`]) || 0;
}

