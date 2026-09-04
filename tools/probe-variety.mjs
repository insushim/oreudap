#!/usr/bin/env node
/**
 * 다양성 프로브 (D30) — 「다시 시작하면 다른 문제가 나오는가」.
 *
 * 🔴 아이는 한 판에 20~40문항을 본다. 다시 시작했을 때 같은 문항이 또 앞줄에 오면
 *    «게임»이 아니라 «순서 외우기»가 된다. 그건 학습으로도 최악이다.
 *    그래서 실제로 여러 판을 돌려 ① 판마다 몇 종이 나오는지 ② 두 판이 얼마나 겹치는지 잰다.
 *
 *   node tools/probe-variety.mjs [--runs 30] [--q 25] [--gate]
 */
import { GameCore } from '../src/core/game.js';
import { PersistentNotes } from '../src/core/srs.js';
import { SUBJECTS, buildBank, tierOf, maxTierFor } from '../src/core/questions.js';

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? Number(A[i + 1]) : d; };
const RUNS = opt('--runs', 30);
const Q = opt('--q', 25);
const GATE = A.includes('--gate');

function playIds(subject, seed, n) {
  const core = new GameCore({ seed, subject, notes: new PersistentNotes({}), now: () => 1700000000000 });
  core.start();
  const ids = [];
  for (let i = 0; i < n; i++) {
    if (!core.question) break;
    ids.push(core.question.id);
    core.input(core.question.answerIndex);   // 항상 정답 — 층이 계속 오른다
    core.advance(400);
  }
  return ids;
}

const fails = [];
console.log(`── 다양성 프로브 (D30) · ${RUNS}판 × ${Q}문항 ──`);
for (const subject of Object.keys(SUBJECTS)) {
  const bank = buildBank(subject);
  const runs = [];
  for (let r = 0; r < RUNS; r++) runs.push(playIds(subject, 1000 + r * 7919, Q));

  const perRun = runs.map((ids) => new Set(ids).size);
  const minDistinct = Math.min(...perRun);
  // 🔴 «몇 종이 나왔나»보다 «한 문항이 몇 번 나왔나»가 체감을 정한다.
  //    구구단은 은행이 72종뿐이라 25문항 중 겹침 자체는 불가피하고, 그건 연습이다.
  //    문제는 같은 문항이 한 판에 세 번씩 나오는 것이다.
  const maxRepeat = Math.max(...runs.map((ids) => {
    const c = {}; for (const id of ids) c[id] = (c[id] || 0) + 1;
    return Math.max(...Object.values(c));
  }));
  const union = new Set(runs.flat()).size;

  // 두 판 사이 겹침 비율(자카드) — 낮을수록 «다른 판»이다
  let sum = 0; let pairs = 0;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = new Set(runs[i]); const b = new Set(runs[j]);
      const inter = [...a].filter((x) => b.has(x)).length;
      sum += inter / new Set([...a, ...b]).size; pairs += 1;
    }
  }
  const jac = sum / pairs;

  // 앞 5문항이 판마다 같은가 — 여기가 같으면 아이는 «시작이 늘 똑같다»고 느낀다
  const firstFive = new Set(runs.map((r) => r.slice(0, 5).join('|')));

  const openTier1 = bank.filter((it) => tierOf(it) <= maxTierFor(1)).length;
  console.log(`  · ${SUBJECTS[subject].label}: 은행 ${bank.length}종 · 1층 시점 열린 문항 ${openTier1}종`);
  console.log(`    한 판 최소 ${minDistinct}종 / ${Q}문항 · 한 문항 최다 ${maxRepeat}회 · ${RUNS}판 합집합 ${union}종 · 판간 겹침 ${(jac * 100).toFixed(1)}%`);
  console.log(`    시작 5문항 조합 ${firstFive.size}/${RUNS}가지`);

  if (GATE) {
    if (maxRepeat > 2) fails.push(`${subject}: 한 판에서 같은 문항이 ${maxRepeat}번 나왔다 — 2회까지가 연습, 그 이상은 반복이다`);
    if (jac > 0.35) fails.push(`${subject}: 판간 겹침 ${(jac * 100).toFixed(1)}% — 다시 해도 비슷한 문제가 나온다`);
    if (firstFive.size < RUNS * 0.9) fails.push(`${subject}: 시작 5문항이 ${firstFive.size}가지뿐 — 시작이 늘 비슷하다`);
    if (openTier1 < 20) fails.push(`${subject}: 1층에서 열린 문항이 ${openTier1}종뿐 — 초반이 단조롭다`);
  }
}
if (GATE) {
  if (fails.length) { console.log(''); for (const f of fails) console.log(`  ❌ ${f}`); process.exit(1); }
  console.log('\n✅ 다양성 게이트 PASS');
}
