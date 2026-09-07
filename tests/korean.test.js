// 국어 어휘 과목 — 과목이 늘어나도 배선이 새지 않는가 [D42]
//
// 🔴 이 파일의 절반은 «국어»가 아니라 «과목 추가»를 검수한다. 과목 하나를 늘리려면
//    풀·숙련도·저장·TTS 네 곳이 같이 따라와야 하는데, 한 곳을 빠뜨려도 화면은 멀쩡히 돈다 —
//    새 과목이 조용히 남의 낱말 풀을 쓰거나, 숙련도가 안 쌓이거나, 영어 목소리로 한글을 읽는다.
//    그래서 「korean34 가 되는가」가 아니라 「SUBJECTS 전부가 되는가」로 적는다.
import { describe, it, expect } from 'vitest';
import {
  SUBJECTS, poolOf, isWordSubject, speechLangOf, buildBank, tierOf, describeId, QuestionSource,
} from '../src/core/questions.js';
import { bucketOf, applyAnswers, masteryList } from '../src/core/mastery.js';
import { sanitize } from '../src/core/storage.js';
import { SessionQueue, PersistentNotes } from '../src/core/srs.js';
import { makeRng } from '../src/core/rng.js';
import { KOREAN_G34 } from '../src/data/korean-g34.js';

const WORD_SUBJECTS = Object.keys(SUBJECTS).filter((s) => s !== 'gugudan');
const KO = ['korean34', 'korean56'];

const src = (subject) => new QuestionSource({
  subject,
  rng: makeRng(12345),
  sessionQueue: new SessionQueue(),
  notes: new PersistentNotes({}),
  now: () => 0,
});

describe('과목 배선 — 전부에 대해 [D42]', () => {
  it('🔴 구구단이 아닌 과목은 «자기» 낱말 풀을 가진다 — 남의 풀을 쓰면 여기서 잡힌다', () => {
    const seen = new Map();
    for (const s of WORD_SUBJECTS) {
      const pool = poolOf(s);
      expect(pool, `${s} 에 풀이 없다`).toBeTruthy();
      expect(pool.length).toBeGreaterThan(0);
      // 두 과목이 «같은 배열 객체»를 가리키면 삼항식을 빠뜨린 것이다
      for (const [other, p] of seen) expect(pool, `${s} 와 ${other} 가 같은 풀`).not.toBe(p);
      seen.set(s, pool);
      expect(isWordSubject(s)).toBe(true);
    }
    expect(isWordSubject('gugudan')).toBe(false);
    expect(poolOf('gugudan')).toBeNull();
  });

  it('은행 id 가 과목 이름을 달고 나온다 — 숙련도·오답노트가 이 모양에 기댄다', () => {
    for (const s of WORD_SUBJECTS) {
      const bank = buildBank(s);
      expect(bank.length).toBe(poolOf(s).length * 2);
      for (const it of bank) expect(it.id.startsWith(`w:${s}:`)).toBe(true);
    }
  });

  it('🔴 숙련도가 과목마다 쌓인다 — 한 과목이라도 안 쌓이면 「아직」으로 보여 결함이 안 보인다', () => {
    for (const s of WORD_SUBJECTS) {
      const id = buildBank(s)[0].id;
      expect(bucketOf(s, id)).toBe(s);
      const m = applyAnswers({}, s, [{ id, ok: true }]);
      expect(m[s]).toEqual({ c: 1, a: 1 });
      // 저장소가 그 키를 살려 두는가 (sanitize 가 모르는 키를 버린다)
      expect(sanitize({ mastery: { [s]: { c: 1, a: 1 } } }).mastery[s]).toEqual({ c: 1, a: 1 });
      expect(masteryList(m, s)[0].label).toBe(SUBJECTS[s].label);
    }
  });

  it('남의 과목 id 는 내 칸으로 새지 않는다', () => {
    expect(bucketOf('korean34', 'w:korean56:사랑:w2k')).toBeNull();
    expect(bucketOf('korean34', 'w:words34:apple:w2k')).toBeNull();
    expect(bucketOf('gugudan', 'w:korean34:사랑:w2k')).toBeNull();
  });

  it('🔴 한 판을 끝까지 돌려도 보기가 겹치거나 비지 않는다', () => {
    for (const s of Object.keys(SUBJECTS)) {
      const q = src(s);
      for (let i = 0; i < 120; i += 1) {
        const branches = i % 2 ? 2 : 3;
        const out = q.next(branches, 1 + i);
        expect(out.choices).toHaveLength(branches);
        expect(new Set(out.choices).size, `${s} #${i} 보기 중복: ${out.choices}`).toBe(branches);
        for (const c of out.choices) expect(String(c).length, `${s} 빈 보기`).toBeGreaterThan(0);
        expect(out.choices[out.answerIndex]).toBe(out.answerText);
      }
    }
  });
});

describe('국어 어휘', () => {
  it('국어만 한국어로 읽는다 — 영단어를 한국어 음성으로 읽으면 발음 학습이 망가진다', () => {
    for (const s of KO) expect(speechLangOf(s)).toBe('ko');
    for (const s of ['gugudan', 'words34', 'words56']) expect(speechLangOf(s)).toBe('en');
    const out = src('korean34').next(3, 1);
    expect(out.lang).toBe('ko');
  });

  it('🔴 난이도는 «데이터»가 들고 온다 — 철자 길이로 재면 「밉다」가 1등급이 된다', () => {
    const hard = { entry: { w: '가늠', k: '어림잡아 헤아림', t: 3 }, dir: 'w2k' };
    const easy = { entry: { w: '도서관', k: '책 읽는 곳', t: 1 }, dir: 'w2k' };
    expect(tierOf(hard)).toBe(3);
    expect(tierOf(easy)).toBe(1);
    // 뜻 → 낱말은 재인이 아니라 인출이라 한 단계 위
    expect(tierOf({ ...easy, dir: 'k2w' })).toBe(2);
    expect(tierOf({ entry: { ...hard.entry }, dir: 'k2w' })).toBe(3);   // 3을 넘지 않는다
  });

  it('두 방향의 문제가 서로 뒤집힌 모양이다', () => {
    const e = KOREAN_G34[0];
    expect(describeId(`w:korean34:${e.w}:w2k`)).toEqual({ q: e.w, a: e.k });
    expect(describeId(`w:korean34:${e.w}:k2w`)).toEqual({ q: e.k, a: e.w });
  });

  it('모르는 과목의 id 는 조용히 null — 옛 저장 데이터가 터뜨리지 않는다', () => {
    expect(describeId('w:hanja34:天:w2k')).toBeNull();
  });

  it('🔴 뜻에 낱말이 들어 있지 않다 — 있으면 읽기만 해도 답이 보인다', () => {
    for (const s of KO) {
      for (const e of poolOf(s)) {
        expect(e.k.includes(e.w.slice(0, 2)), `${e.w} → ${e.k}`).toBe(false);
      }
    }
  });
});
