// 오답(distractor) 생성 — GDD §1-3-5
//
// 구구단 후보 = {a×(b±1), (a±1)×b, (a±1)×(b∓1)} ∪ 흔한 오류 사전
// 우선순위 = 흔한 오류 > 교차 후보((a±1)×(b∓1)) > 인접 후보
// 왜 «교차 후보»가 필요한가: 7×8=56 에서 아이가 실제로 자주 쓰는 오답 54(=6×9)는
// 인접 후보만으로는 생성되지 않는다. 후보군이 예시 오답을 못 만들면 D9 가 모순이 된다.

import { commonErrorsFor } from '../data/gugudan-common-errors.js';
import { shuffle } from './rng.js';

/** 구구단 오답 후보 전체(우선순위 순, 중복·정답·0 이하 제거) */
export function gugudanCandidates(a, b) {
  const answer = a * b;
  const common = commonErrorsFor(a, b);
  const cross = [];
  for (const da of [-1, 1]) {
    const db = -da; // (a±1)×(b∓1)
    cross.push((a + da) * (b + db));
  }
  const adjacent = [];
  for (const d of [-1, 1]) {
    adjacent.push(a * (b + d));
    adjacent.push((a + d) * b);
  }
  const out = [];
  for (const v of [...common, ...cross, ...adjacent]) {
    if (!Number.isInteger(v) || v <= 0 || v === answer) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** 구구단 오답 n개. 우선순위대로 뽑되 같은 순위 안에서는 시드 셔플. */
export function gugudanDistractors(a, b, n, rng) {
  const answer = a * b;
  const common = commonErrorsFor(a, b).filter((v) => v > 0 && v !== answer);
  const cross = [];
  for (const da of [-1, 1]) cross.push((a + da) * (b - da));
  const adjacent = [];
  for (const d of [-1, 1]) { adjacent.push(a * (b + d)); adjacent.push((a + d) * b); }

  const tiers = [common, cross, adjacent];
  const out = [];
  for (const tier of tiers) {
    const pool = shuffle(rng, tier.filter((v) => Number.isInteger(v) && v > 0 && v !== answer));
    for (const v of pool) {
      if (out.length >= n) break;
      if (out.includes(v)) continue;   // 티어 «안»에서도 중복이 난다 — 넣기 직전에 본다
      out.push(v);
    }
    if (out.length >= n) break;
  }
  // 후보가 모자라면(작은 단 경계) 정답 근처 값으로 채운다 — 여전히 후보식 안이다.
  let d = 2;
  while (out.length < n) {
    const cands = [answer + d * a, answer - d * a, answer + d, answer - d];
    let added = false;
    for (const v of cands) {
      if (Number.isInteger(v) && v > 0 && v !== answer && !out.includes(v)) { out.push(v); added = true; break; }
    }
    if (!added) d++;
    if (d > 12) break;
  }
  return out.slice(0, n);
}

/**
 * 영단어 오답 — 같은 학년 밴드·같은 품사 안에서 뽑는다.
 * 정답 뜻과 첫 글자가 다른 것을 우선한다(«생김새»로 못 맞히게).
 * @param {{w:string,k:string,pos:string}} item 정답 항목
 * @param {Array} pool 같은 밴드 전체
 * @param {'w2k'|'k2w'} dir 문제 방향
 */
export function wordDistractors(item, pool, dir, n, rng) {
  const samePos = pool.filter((e) => e.pos === item.pos && e.w !== item.w);
  const field = dir === 'w2k' ? 'k' : 'w';
  const answerText = item[field];
  const firstDiff = samePos.filter((e) => e[field][0] !== answerText[0]);
  const rest = samePos.filter((e) => e[field][0] === answerText[0]);
  const out = [];
  for (const tier of [firstDiff, rest]) {
    for (const e of shuffle(rng, tier.slice())) {
      if (out.length >= n) break;
      if (e[field] === answerText) continue;
      if (out.some((o) => o[field] === e[field])) continue;
      out.push(e);
    }
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}
