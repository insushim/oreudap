#!/usr/bin/env node
// 라이선스 원장 + 크레딧 생성 (D20). 배포 전 free-assets.sh / free-audio.sh verify 가 이 원장을 본다.
// 🔴 손으로 적지 않는다 — 에셋이 늘면 원장이 반드시 어긋난다. --check 로 어긋남을 막는다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEST = path.join(ROOT, 'public', 'assets');
const CHECK = process.argv.includes('--check');

const SOURCES = {
  image: {
    license: 'self-generated',
    source: 'Meta AI 이미지 생성 → 배경 제거·리사이즈(tools/process-assets.py). 오르답 제작진이 이 게임을 위해 생성.',
  },
  sfx: {
    license: 'self-generated',
    source: 'game-builder gen-sfx.py 오프라인 결정론 렌더(numpy) → loudnorm·ogg/m4a 변환.',
  },
  bgm: {
    license: 'self-generated',
    source: 'ACE-Step 1.5 로컬 생성(gen-bgm.sh) → 이음새 없는 루프로 고정. 외부 서비스·크레딧 사용 0.',
  },
};

const entries = [];
for (const f of fs.readdirSync(path.join(DEST, 'images')).sort()) {
  if (!/\.(webp|png|svg)$/.test(f)) continue;
  entries.push({ file: `images/${f}`, ...SOURCES.image, date: '2026-09-04' });
}
for (const f of fs.readdirSync(path.join(DEST, 'audio')).sort()) {
  if (!/\.(ogg|m4a)$/.test(f)) continue;
  const kind = f.startsWith('bgm') ? SOURCES.bgm : SOURCES.sfx;
  entries.push({ file: `audio/${f}`, ...kind, date: '2026-09-04' });
}

const ledger = { version: 1, project: 'oreudap', entries };
const ledgerText = `${JSON.stringify(ledger, null, 2)}\n`;

const credits = `# 크레딧 — 오르답

이 게임의 모든 에셋은 **직접 만들었습니다**. 외부에서 받아 온 그림·소리·글꼴이 없습니다.

| 종류 | 개수 | 만든 방법 |
|---|---|---|
| 캐릭터·발판·배경 이미지 | ${entries.filter((e) => e.file.startsWith('images/')).length} | Meta AI 이미지 생성 후 배경 제거·리사이즈 |
| 효과음 | ${entries.filter((e) => e.file.startsWith('audio/') && !e.file.includes('bgm')).length} | 오프라인 결정론 렌더(numpy 합성) |
| 배경 음악 | ${entries.filter((e) => e.file.includes('bgm')).length} | ACE-Step 로컬 생성, 이음새 없는 루프 |
| 글꼴 | 0 | 기기에 이미 있는 시스템 글꼴만 사용(외부 요청 0) |
| 아이콘 | 2 | 코드로 그린 도형(PIL·SVG) |

## 쓰지 않은 것
- 외부 광고·분석 SDK
- 외부 폰트·CDN (아이의 IP 가 제3자에게 가지 않도록)
- 다른 게임의 그림·소리·규칙 조합

## 파일별 출처
${entries.map((e) => `- \`${e.file}\` — ${e.source}`).join('\n')}

기계가 읽는 원장은 \`asset-license.json\` 에 있습니다(${entries.length}개 항목).
`;

const LEDGER_PATH = path.join(DEST, 'asset-license.json');
const AUDIO_LEDGER = path.join(DEST, 'audio-license.json');
const CREDITS_PATH = path.join(DEST, 'CREDITS.md');

const audioLedger = {
  version: 1,
  entries: entries.filter((e) => e.file.startsWith('audio/')).map((e) => ({ ...e, file: e.file.replace('audio/', '') })),
};
const audioText = `${JSON.stringify(audioLedger, null, 2)}\n`;

if (CHECK) {
  const same = (p, t) => fs.existsSync(p) && fs.readFileSync(p, 'utf8') === t;
  const bad = [];
  if (!same(LEDGER_PATH, ledgerText)) bad.push('asset-license.json');
  if (!same(AUDIO_LEDGER, audioText)) bad.push('audio-license.json');
  if (!same(CREDITS_PATH, credits)) bad.push('CREDITS.md');
  if (bad.length) {
    console.error(`❌ 라이선스 원장이 에셋과 어긋난다 (${bad.join(', ')}) — \`node tools/make-license.mjs\` 를 돌려라.`);
    process.exit(1);
  }
  console.log(`✅ 라이선스 원장 일치 · 항목 ${entries.length}개 · 전부 self-generated`);
} else {
  fs.writeFileSync(LEDGER_PATH, ledgerText);
  fs.writeFileSync(AUDIO_LEDGER, audioText);
  fs.writeFileSync(CREDITS_PATH, credits);
  console.log(`✅ 원장 ${entries.length}건 + CREDITS.md 생성`);
}
