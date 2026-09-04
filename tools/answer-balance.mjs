#!/usr/bin/env node
// 정답 위치 쏠림 게이트(D8) — 실제 «출제된» 문항을 표본으로 뽑아 스킬 도구에 먹인다.
// 🔴 문항 은행을 재면 안 된다. 은행은 정답을 0번에 들고 있고 위치는 출제 시점에 정해진다.
// 갈래 수(2/3)를 과목처럼 나눠 센다 — 합쳐 세면 한쪽 쏠림이 다른 쪽에 희석돼 통과한다.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { GameCore, PHASE } from '../src/core/game.js';
import { PersistentNotes } from '../src/core/srs.js';

const SUBJECTS = ['gugudan', 'words34', 'words56'];
const PER_CELL = 600;        // 과목×갈래수 셀당 표본
const OUT = 'qa/answer-sample.json';

const rows = [];
for (const subject of SUBJECTS) {
  for (const branches of [2, 3]) {
    for (let seed = 1; rows.filter((r) => r.subject === `${subject}-${branches}way`).length < PER_CELL; seed++) {
      const core = new GameCore({ seed: seed * 7919, subject, notes: new PersistentNotes(), now: () => 1_700_000_000_000 });
      // 갈래 수를 고정해 셀을 분리한다(층에 따라 섞이면 셀 경계가 흐려진다)
      core.floor = branches === 3 ? 80 : 0;
      core.start();
      let guard = 0;
      while (core.phase !== PHASE.OVER && guard++ < 400) {
        const q = core.question;
        if (q && q.choices.length === branches) {
          // answer 는 «인덱스»다(텍스트가 아니다 — 도구가 위치 분포를 센다)
          rows.push({ subject: `${subject}-${branches}way`, answer: q.answerIndex, choices: q.choices.slice() });
          if (rows.filter((r) => r.subject === `${subject}-${branches}way`).length >= PER_CELL) break;
        }
        core.input(core.question.answerIndex);   // 정답을 눌러 계속 진행
        core.advance(300);
        if (branches === 3) core.floor = Math.max(core.floor, 80);
      }
    }
  }
}

mkdirSync('qa', { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
const cells = [...new Set(rows.map((r) => r.subject))];
console.log(`표본 ${rows.length}건 · 셀 ${cells.length}개 (${cells.join(', ')})`);

const tool = `${process.env.HOME}/.claude/skills/game-builder/tools/check-answer-balance.mjs`;
try {
  const out = execFileSync(process.execPath, [tool, '--json', OUT, '--min', '400'], { encoding: 'utf8' });
  console.log(out.trim());
  console.log('✅ 정답 위치 균형 게이트 PASS (D8)');
} catch (e) {
  console.log(e.stdout || '');
  console.error(e.stderr || '');
  console.error(`❌ 정답 위치 균형 게이트 FAIL (rc=${e.status})`);
  process.exit(1);
}
