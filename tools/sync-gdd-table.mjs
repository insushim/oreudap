#!/usr/bin/env node
// GDD §1-4-2 봇 격자 표를 «게임 코드를 import 하는 프로브»의 출력으로 재생성한다.
// --check 면 재생성 결과와 문서가 다를 때 exit 1 (손계산 전사 방지, L-070).
//
// 🔴 표를 손으로 고치지 마라. 수치가 바뀌면 이 스크립트를 돌려라.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GDD = resolve(HERE, '../docs/GDD.md');
const PROBE = resolve(HERE, 'probe-grid.mjs');
const CHECK = process.argv.includes('--check');
const N = 300;

function probe(extra = []) {
  const out = execFileSync(process.execPath, [PROBE, `N=${N}`, '--json', ...extra], { encoding: 'utf8' });
  return JSON.parse(out);
}

const main = probe();
const fast = probe(['P=1.0', 'MU=0.7', 'SD=0.15']);
const slow = probe(['P=1.0', 'MU=1.1', 'SD=0.25']);

const label = (p) => (p === 0 ? '0 (순수 찍기)' : String(p));
const rows = [];
rows.push('| 아는 확률 p | 중앙값 층 | p10 | p90 | 코인 중앙값 | 실제 정답률 | 시간초과율 |');
rows.push('|---|---|---|---|---|---|---|');
for (const r of main) {
  rows.push(`| ${label(r.p)} | ${r.median} | ${r.p10} | ${r.p90} | ${r.coinMedian} | ${(r.realAccuracy * 100).toFixed(1)}% | ${(r.timeoutRate * 100).toFixed(1)}% |`);
}
rows.push(`| 1.0 · 반응 N(0.70, 0.15) | ${fast[0].median} | ${fast[0].p10} | ${fast[0].p90} | ${fast[0].coinMedian} | ${(fast[0].realAccuracy * 100).toFixed(1)}% | ${(fast[0].timeoutRate * 100).toFixed(1)}% |`);
rows.push(`| 1.0 · 반응 N(1.10, 0.25) | ${slow[0].median} | ${slow[0].p10} | ${slow[0].p90} | ${slow[0].coinMedian} | ${(slow[0].realAccuracy * 100).toFixed(1)}% | ${(slow[0].timeoutRate * 100).toFixed(1)}% |`);

const block = [
  '<!-- PROBE-TABLE:BEGIN 자동 생성 — tools/sync-gdd-table.mjs. 손으로 고치지 말 것 -->',
  `공통난수 시드 1..${N}, 반응시간 N(0.85s, 0.20s), 모르면 남은 선택지 균등 추측. 과목=구구단.`,
  'p = «아는 확률»이고 실제 정답률은 추측 성공분이 더해진 값이다(같은 행의 «실제 정답률» 칸).',
  '',
  ...rows,
  '<!-- PROBE-TABLE:END -->',
].join('\n');

const src = readFileSync(GDD, 'utf8');
const re = /<!-- PROBE-TABLE:BEGIN[\s\S]*?<!-- PROBE-TABLE:END -->/;
if (!re.test(src)) {
  console.error('❌ GDD.md 에 PROBE-TABLE 마커가 없다.');
  process.exit(2);
}
const next = src.replace(re, block);

if (CHECK) {
  if (next !== src) {
    console.error('❌ GDD §1-4-2 표가 프로브 출력과 다르다 — `node tools/sync-gdd-table.mjs` 로 재생성하라.');
    process.exit(1);
  }
  console.log('✅ GDD 표 = 프로브 출력 일치');
} else {
  writeFileSync(GDD, next);
  console.log('✅ GDD §1-4-2 표 재생성 완료');
}
