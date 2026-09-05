#!/usr/bin/env node
/**
 * 영어 낱말 발음 음성을 EchoTale(iwenglish) 자산에서 가져와 오르답용으로 다시 굳힌다.
 *
 * 🔴 원본을 그대로 복사하지 않는 이유: 128kbps 스테레오급 mp3 가 낱말 하나에 25KB 다.
 *    943개면 19.5MB — dist 전체 예산 8MB 를 혼자 두 배 넘긴다. 낱말 발음은 24kHz 모노
 *    한 단어짜리 음성이라 32kbps AAC 로 충분하고, 앞뒤 무음을 자르면 다시 절반이 된다.
 *    (실측 25.7KB → 3.7KB)
 * 🔴 무음 제거는 «너무 자르면» 첫 자음이 날아간다 — 임계를 -50dB 로 낮추고 0.08초를 남긴다.
 *    산출물이 0.25초 미만이면 과다 절단으로 보고 그 낱말은 원본을 다시 인코딩만 한다.
 *
 *   node tools/import-word-audio.mjs [--src <EchoTale public/seed/_words>] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WORDS_G34 } from '../src/data/words-g34.js';
import { WORDS_G56 } from '../src/data/words-g56.js';

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const SRC = opt('--src', '/Users/iw-lab/Documents/dev/iwenglish/public/seed/_words');
const LIMIT = Number(opt('--limit', 0));
const OUT = path.resolve('public/assets/say');

const TRIM = 'silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB:detection=peak,'
  + 'areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB:detection=peak,areverse,'
  + 'loudnorm=I=-16:TP=-1.5:LRA=11';

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', f]).toString().trim());

function encode(src, dst, filter) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src,
    ...(filter ? ['-af', filter] : []), '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-ar', '24000', dst]);
}

function main() {
  if (!fs.existsSync(SRC)) { console.error(`❌ 원본 폴더 없음: ${SRC}`); process.exit(3); }
  fs.mkdirSync(OUT, { recursive: true });

  const words = [...new Set([...WORDS_G34, ...WORDS_G56].map((w) => w.w))];
  const have = new Set(fs.readdirSync(SRC).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4).toLowerCase()));

  const made = [];
  const missing = [];
  let retrimmed = 0;
  let bytes = 0;
  for (const w of (LIMIT ? words.slice(0, LIMIT) : words)) {
    const key = w.toLowerCase();
    if (!have.has(key)) { missing.push(w); continue; }
    const src = path.join(SRC, `${key}.mp3`);
    const dst = path.join(OUT, `${key}.m4a`);
    encode(src, dst, TRIM);
    if (dur(dst) < 0.25) { encode(src, dst, null); retrimmed += 1; }   // 과다 절단 — 자르지 않고 다시
    bytes += fs.statSync(dst).size;
    made.push(key);
  }

  const index = { version: 1, format: 'm4a', dir: 'assets/say', words: made.sort() };
  fs.writeFileSync(path.resolve('src/data/say-index.js'),
    `// 생성 파일 — 고치지 마라. \`node tools/import-word-audio.mjs\` 가 만든다.\n`
    + `// 낱말 발음이 «파일로 있는» 낱말 목록. 없는 낱말은 브라우저 음성으로 읽는다(src/ui/say.js).\n`
    + `export const SAY_WORDS = new Set(${JSON.stringify(index.words)});\n`);
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  console.log(`\n── 낱말 발음 반입 ──`);
  console.log(`  · 오르답 낱말 ${words.length}개 · 음성 확보 ${made.length}개 (${(made.length / words.length * 100).toFixed(1)}%)`);
  console.log(`  · 합계 ${(bytes / 1024 / 1024).toFixed(2)}MB · 평균 ${Math.round(bytes / made.length / 1024 * 10) / 10}KB`);
  if (retrimmed) console.log(`  · 과다 절단으로 무음제거 없이 다시 인코딩 ${retrimmed}개`);
  console.log(`  · 파일 없는 낱말 ${missing.length}개 — 브라우저 음성(speechSynthesis)이 읽는다`);
  if (missing.length) console.log(`    예: ${missing.slice(0, 12).join(', ')}`);
}
main();
