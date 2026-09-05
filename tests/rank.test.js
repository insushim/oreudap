// 일일 등수 — 서버가 «받아도 되는 것»만 받는지. 판정은 전부 rank-core 에 있다.
import { describe, it, expect } from 'vitest';
import { acceptName, clean, merge, dedupe, rankOf, rollover, MAX_FLOOR, KEEP, normSub } from '../worker/src/rank-core.js';
import { isGeneratedNick, makeNick, maskNick, isUsableNick } from '../src/core/nickname.js';

const G = isGeneratedNick;

describe('이름 수용 규칙 — 실명이 서버에 남지 않는다 [D29]', () => {
  it('가려지지 않은 «직접 지은 이름»은 거부한다', () => {
    for (const raw of ['김철수', '이하늘', '박민준', 'Minjun']) {
      expect(acceptName(raw, G), raw).toBeNull();
    }
  });

  it('가린 이름은 받는다 — 그리고 그것이 화면에 뜨는 모양이다', () => {
    expect(maskNick('김철수')).toBe('김*수');
    expect(acceptName('김*수', G)).toBe('김*수');
    expect(acceptName('남**수', G)).toBe('남**수');
  });

  it('자동 생성 이름은 가리지 않고 그대로 받는다 (사람을 가리키지 않는다)', () => {
    for (let i = 0; i < 50; i++) {
      const n = makeNick();
      expect(maskNick(n)).toBe(n);
      expect(acceptName(n, G)).toBe(n);
    }
  });

  it('별표만 있는 이름·스크립트·낱자·공백은 거부한다', () => {
    for (const bad of ['***', '<script>', 'ㅅㅂ', '김 철수', '', null, 42, '김철수\n']) {
      expect(acceptName(bad, G), String(bad)).toBeNull();
    }
  });

  it('아이가 직접 지은 이름은 가려서 보내면 서버가 받는다 (왕복 계약)', () => {
    for (const raw of ['하늘별', '축구왕', '김철수', 'Sky']) {
      expect(isUsableNick(raw), raw).toBe(true);
      expect(acceptName(maskNick(raw), G), raw).not.toBeNull();
    }
  });
});

describe('판 정리 [D29]', () => {
  const day = '2026-09-04';
  it('층 상한을 넘거나 0 이하인 기록은 버린다', () => {
    expect(clean({ n: '김*수', s: MAX_FLOOR + 1, sub: 'gugudan' }, G)).toBeNull();
    expect(clean({ n: '김*수', s: 0, sub: 'gugudan' }, G)).toBeNull();
    // 🔴 모드 없는 옛 형식은 «클래식»으로 읽힌다 — 표는 «과목:모드» 단위다(같은 규칙끼리 줄 세운다).
    expect(clean({ n: '김*수', s: 12, sub: 'gugudan' }, G)).toEqual({ n: '김*수', s: 12, sub: 'gugudan:classic' });
  });

  it('같은 이름은 최고 기록 한 줄만 남는다 — 한 아이가 판을 도배하지 못한다', () => {
    let b = null;
    for (const s of [5, 30, 12, 30, 8]) b = merge(b, { n: '김*수', s, sub: 'gugudan' }, day, G);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].s).toBe(30);
  });

  it('과목이 다르면 같은 이름이라도 다른 줄이다', () => {
    let b = null;
    b = merge(b, { n: '김*수', s: 10, sub: 'gugudan' }, day, G);
    b = merge(b, { n: '김*수', s: 20, sub: 'words34' }, day, G);
    expect(b.rows).toHaveLength(2);
  });

  it('판은 KEEP 줄을 넘지 않는다', () => {
    let b = null;
    for (let i = 0; i < KEEP + 20; i++) b = merge(b, { n: `아*${i}`, s: i + 1, sub: 'gugudan' }, day, G);
    expect(b.rows.length).toBeLessThanOrEqual(KEEP);
    expect(b.rows[0].s).toBeGreaterThan(b.rows[b.rows.length - 1].s);
  });

  it('날이 바뀌면 오늘 판을 비우고 어제 상위만 남긴다', () => {
    let b = null;
    for (const s of [30, 20, 10]) b = merge(b, { n: `아*${s}`, s, sub: 'gugudan' }, day, G);
    const next = rollover(b, '2026-09-05');
    expect(next.rows).toHaveLength(0);
    expect(next.yday.day).toBe(day);
    expect(next.yday.rows.length).toBeGreaterThan(0);
  });

  it('등수는 «나보다 높은 사람 수 + 1» 이다', () => {
    const rows = dedupe([30, 20, 20, 10].map((s, i) => ({ n: `아*${i}`, s, sub: 'gugudan' })));
    expect(rankOf(rows, 31)).toBe(1);
    expect(rankOf(rows, 20)).toBe(2);   // 공동 2위
    expect(rankOf(rows, 5)).toBe(5);
    expect(rankOf(rows, 0)).toBeNull();
  });
});

describe('모드별 표 분리', () => {
  const G = isGeneratedNick;
  it('같은 이름이라도 모드가 다르면 다른 줄이다 — 규칙이 다른 기록은 섞이지 않는다', () => {
    const day = '2026-09-05';
    let b = rollover(null, day);
    b = merge(b, { n: '김*수', s: 40, sub: 'gugudan', m: 'classic' }, day, G);
    b = merge(b, { n: '김*수', s: 12, sub: 'gugudan', m: 'sprint' }, day, G);
    expect(b.rows.length).toBe(2);
    expect(new Set(b.rows.map((r) => r.sub))).toEqual(new Set(['gugudan:classic', 'gugudan:sprint']));
  });
  it('낯선 모드는 클래식으로 떨어진다(서버도 신뢰 경계 밖이다)', () => {
    expect(normSub('gugudan', '해킹')).toBe('gugudan:classic');
    expect(normSub(null)).toBe('gugudan:classic');
  });
  it('과목과 모드를 따로 받는다 — 합쳐 보내면 배포 순서에 물린다', () => {
    // 🔴 옛 워커가 도는 동안 클라이언트가 'words56:sprint' 를 보내면 화이트리스트에 없어
    //    첫 과목(구구단)으로 떨어진다 = 영단어 기록이 구구단 표에 실린다. 나눠 받으면 안 물린다.
    expect(normSub('words56', 'sprint')).toBe('words56:sprint');
    expect(normSub('words56')).toBe('words56:classic');          // 모드 모르는 옛 클라이언트
    expect(normSub('words56:thrill')).toBe('words56:thrill');    // 합쳐 온 값도 읽는다
    expect(clean({ n: '김*수', s: 9, sub: 'words56', m: 'thrill' }, G))
      .toEqual({ n: '김*수', s: 9, sub: 'words56:thrill' });
  });
});
