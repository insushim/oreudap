#!/usr/bin/env node
/**
 * 등재용 썸네일 400×267 을 «게임 자체 에셋»으로 조립한다.
 *
 * 🔴 AI 로 그리지 않는다. 이 그림의 요점은 한글 제목·설명이 «정확히» 읽히는 것이라
 *    생성 모델이 가장 못하는 일이다. 게임에 이미 있는 배경·발판·캐릭터를 쓰면
 *    썸네일과 실제 화면이 같은 그림이 된다 — 아이가 눌렀을 때 «그 게임»이 나온다.
 * 🔴 킹수학 등재 규격(기존 17개 실측): 400×267 webp, 제목 → 노란 한 줄 → 정보 한 줄.
 *
 *   node tools/make-thumb.mjs [out.webp]
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

const OUT = path.resolve(process.argv[2] || 'qa/thumb-oreudap.webp');
// 등재처마다 규격이 다르다 — 킹수학 400×267, 선행 심선생 포트폴리오 1200×750.
const W = Number(process.argv[3] || 400);
const H = Number(process.argv[4] || 267);
const IMG = path.resolve('public/assets/images');
const b64 = (f) => `data:image/webp;base64,${fs.readFileSync(path.join(IMG, f)).toString('base64')}`;

const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: P; src: local("Pretendard"), local("Apple SD Gothic Neo"); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 750px; overflow: hidden;
         font-family: P, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  .wrap { position: relative; width: 1200px; height: 750px; overflow: hidden; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  /* 발판 3개가 «계단»으로 보이게 오른쪽 위로 올라가는 배치 */
  .p { position: absolute; width: 300px; }
  .p1 { left: 90px;  bottom: 60px; }
  .p2 { left: 450px; bottom: 215px; }
  .p3 { left: 810px; bottom: 370px; }
  .ch { position: absolute; width: 155px; left: 165px; bottom: 132px; }
  .txt { position: absolute; left: 0; right: 0; top: 26px; text-align: center; }
  h1 { font-size: 112px; font-weight: 900; color: #fff; letter-spacing: -2px;
       -webkit-text-stroke: 13px #23232b; paint-order: stroke fill; }
  .tag { margin-top: 8px; font-size: 53px; font-weight: 800; color: #ffcf6a;
         -webkit-text-stroke: 10px #23232b; paint-order: stroke fill; }
  .meta { margin-top: 10px; font-size: 39px; font-weight: 700; color: #fff;
          -webkit-text-stroke: 9px #23232b; paint-order: stroke fill; }
</style>
<div class="wrap">
  <img class="bg" src="${b64('bg-dawn.webp')}">
  <img class="p p1" src="${b64('platform-stone.webp')}">
  <img class="p p2" src="${b64('platform-stone.webp')}">
  <img class="p p3" src="${b64('platform-stone.webp')}">
  <img class="ch" src="${b64('char-fox-jump.webp')}">
  <div class="txt">
    <h1>오르답</h1>
    <div class="tag">정답을 밟아야 한 층 오른다</div>
    <div class="meta">2~6학년 · 구구단 영단어 · 모드 3가지</div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(400);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const png = OUT.replace(/\.webp$/, '.png');
await page.screenshot({ path: png });
await browser.close();

// 400×267 webp 로 — 규격은 기존 17개와 같아야 목록에서 튀지 않는다.
const { execFileSync } = await import('node:child_process');
// 🔴 이 맥의 ffmpeg 은 webp 인코더가 꺼져 있다 — cwebp 로 굽는다(리사이즈도 cwebp 가 한다).
execFileSync('cwebp', ['-quiet', '-q', '88', '-resize', String(W), String(H), png, '-o', OUT]);
console.log(`✅ ${OUT}  ${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`);
console.log(`   (미리보기 PNG: ${png})`);
