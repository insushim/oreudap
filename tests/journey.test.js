// 여정·숙련도·주간 도장 — 순수 로직 검수.
// 🔴 여기서 재는 것은 «규칙»이지 화면이 아니다. 화면은 qa-retention.mjs 가 따로 잰다.
import { describe, it, expect } from 'vitest';
import { journeyOf, currentZone, nextZoneGap, unlockedZones, zoneStart } from '../src/core/journey.js';
import {
  bucketOf, applyAnswers, percentOf, masteryList, weakest,
  weekKey, stampToday, weekView, MASTERY_WINDOW,
} from '../src/core/mastery.js';
import { ZONES, WEEKLY } from '../src/core/balance.js';

describe('여정 — 구간 [D38]', () => {
  it('구간 경계가 기존 축과 어긋나지 않는다', () => {
    // 🔴 50 은 하늘 전환(SKY_EVERY)과 같은 층이어야 한다. 어긋나면 「구간이 바뀌었는데
    //    아무 일도 안 일어나는 층」이 생긴다 — balance.js ZONES 주석의 근거를 테스트로 굳힌다.
    expect(ZONES.map((z) => z.end)).toEqual([20, 50, 90, Infinity]);
    expect(ZONES[ZONES.length - 1].end).toBe(Infinity);   // 마지막은 끝이 없다
  });

  it('구간 시작 층이 앞 구간 끝 바로 다음이다 — 빈틈도 겹침도 없다', () => {
    expect(zoneStart(0)).toBe(1);
    for (let i = 1; i < ZONES.length; i += 1) {
      expect(zoneStart(i)).toBe(ZONES[i - 1].end + 1);
    }
  });

  it('🔴 앞 구간을 완주해야 다음이 열린다 — 건너뛰기 없음', () => {
    const at0 = journeyOf(0);
    expect(at0[0].locked).toBe(false);        // 첫 구간은 언제나 열림
    expect(at0[1].locked).toBe(true);
    expect(at0[2].locked).toBe(true);

    const at20 = journeyOf(20);               // 숲 완주
    expect(at20[0].done).toBe(true);
    expect(at20[1].locked).toBe(false);       // 구름 열림
    expect(at20[2].locked).toBe(true);        // 우주는 아직

    const at50 = journeyOf(50);
    expect(at50[2].locked).toBe(false);       // 우주 열림
    expect(at50[3].locked).toBe(true);        // 용암은 90 완주 후
  });

  it('한 층 모자라면 열리지 않는다 (경계 오프바이원)', () => {
    expect(journeyOf(19)[1].locked).toBe(true);
    expect(journeyOf(20)[1].locked).toBe(false);
    expect(journeyOf(49)[2].locked).toBe(true);
    expect(journeyOf(50)[2].locked).toBe(false);
  });

  it('해금은 저장하지 않고 최고 기록에서 «매번» 유도한다', () => {
    // 저장 객체를 받지 않는다 = 위조할 값이 없다
    expect(unlockedZones(0)).toEqual(['forest']);
    expect(unlockedZones(20)).toEqual(['forest', 'cloud']);
    expect(unlockedZones(90)).toEqual(['forest', 'cloud', 'space', 'lava']);
  });

  it('지금 오르는 구간과 남은 층을 알려 준다', () => {
    expect(currentZone(0).id).toBe('forest');
    expect(currentZone(25).id).toBe('cloud');
    const g = nextZoneGap(38);
    expect(g.zone.id).toBe('cloud');
    expect(g.gap).toBe(12);                   // 50 - 38
  });

  it('마지막 구간에서는 «다음 목표»를 지어내지 않는다', () => {
    expect(nextZoneGap(200)).toBeNull();      // 용암은 끝이 없다
  });

  it('진행도가 구간 안에서만 센다 — 앞 구간 층이 새어 들어오지 않는다', () => {
    const j = journeyOf(30);
    expect(j[0].reached).toBe(20);            // 숲은 다 참
    expect(j[1].reached).toBe(10);            // 구름은 21~30 = 10칸
    expect(j[1].span).toBe(30);               // 21~50
    expect(j[2].reached).toBe(0);             // 우주는 밟지 않음
  });
});

describe('숙련도 — 어제의 나', () => {
  it('구구단 id 에서 단을 뽑는다', () => {
    expect(bucketOf('gugudan', 'g:7x8')).toBe('gugudan:7');
    expect(bucketOf('gugudan', 'g:2x9')).toBe('gugudan:2');
  });

  it('🔴 과목이 섞이지 않는다 — 영단어 id 가 구구단 칸으로 새면 안 된다', () => {
    expect(bucketOf('gugudan', 'w:words34:box:w2k')).toBeNull();
    expect(bucketOf('words34', 'w:words56:apple:w2k')).toBeNull();
    expect(bucketOf('words34', 'w:words34:apple:w2k')).toBe('words34');
  });

  it('표본이 적으면 백분율을 말하지 않는다 — 3문제 100%는 오보다', () => {
    let m = applyAnswers({}, 'gugudan', [
      { id: 'g:7x8', ok: true }, { id: 'g:7x3', ok: true }, { id: 'g:7x5', ok: true },
    ]);
    expect(percentOf(m, 'gugudan:7')).toBeNull();
    m = applyAnswers(m, 'gugudan', [
      { id: 'g:7x2', ok: true }, { id: 'g:7x4', ok: false },
    ]);
    expect(percentOf(m, 'gugudan:7')).toBe(80);   // 4/5
  });

  it('🔴 창을 넘으면 «비율을 유지한 채» 줄인다 — 잘라 버리면 100%가 된다', () => {
    let m = {};
    // 절반만 맞히며 창을 크게 넘긴다
    const many = Array.from({ length: MASTERY_WINDOW * 2 }, (_, i) => ({ id: 'g:7x8', ok: i % 2 === 0 }));
    m = applyAnswers(m, 'gugudan', many);
    expect(m['gugudan:7'].a).toBe(MASTERY_WINDOW);
    const pct = percentOf(m, 'gugudan:7');
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);                 // 50% 근처를 유지한다
  });

  it('가장 약한 칸을 가리킨다 — 표본 없는 칸은 후보가 아니다', () => {
    let m = {};
    for (let i = 0; i < 10; i += 1) m = applyAnswers(m, 'gugudan', [{ id: 'g:3x2', ok: true }]);
    for (let i = 0; i < 10; i += 1) m = applyAnswers(m, 'gugudan', [{ id: 'g:8x7', ok: i < 3 }]);
    expect(weakest(m, 'gugudan').key).toBe('gugudan:8');
    expect(masteryList(m, 'gugudan')).toHaveLength(8);
    expect(masteryList(m, 'words34')).toHaveLength(1);
  });

  it('아는 칸이 하나도 없으면 없다고 한다', () => {
    expect(weakest({}, 'gugudan')).toBeNull();
  });
});

describe('이번 주 도장 — 느슨한 재방문 [D39]', () => {
  const MON = new Date('2026-09-07T10:00:00').getTime();   // 월
  const WED = new Date('2026-09-09T10:00:00').getTime();   // 수
  const FRI = new Date('2026-09-11T10:00:00').getTime();   // 금
  const NEXT_MON = new Date('2026-09-14T10:00:00').getTime();

  it('같은 주는 같은 키, 다음 주는 다른 키', () => {
    expect(weekKey(MON)).toBe(weekKey(FRI));
    expect(weekKey(MON)).not.toBe(weekKey(NEXT_MON));
  });

  it('🔴 하루 빠져도 앞의 도장이 사라지지 않는다 — 연속이 아니라 누적', () => {
    let w = stampToday(null, MON).week;
    expect(weekView(w, MON).count).toBe(1);
    // 화요일을 통째로 건너뛴다
    w = stampToday(w, WED).week;
    expect(weekView(w, WED).count).toBe(2);        // 1 로 초기화되지 않는다
    w = stampToday(w, FRI).week;
    expect(weekView(w, FRI).count).toBe(WEEKLY.GOAL_DAYS);
    expect(weekView(w, FRI).done).toBe(true);
  });

  it('같은 날 여러 판을 해도 도장은 하나다', () => {
    let w = stampToday(null, MON).week;
    w = stampToday(w, MON + 3600e3).week;
    w = stampToday(w, MON + 7200e3).week;
    expect(weekView(w, MON).count).toBe(1);
  });

  it('🔴 주가 바뀌면 도장만 비고 해금은 영구다 — 지난주 것을 뺏지 않는다', () => {
    let w = stampToday(null, MON).week;
    w = stampToday(w, WED).week;
    const r = stampToday(w, FRI);
    expect(r.unlocked).toBe(true);
    w = r.week;
    expect(w.claimed).toBe(true);

    const nextWeek = stampToday(w, NEXT_MON);
    expect(weekView(nextWeek.week, NEXT_MON).count).toBe(1);   // 도장은 새로
    expect(nextWeek.week.claimed).toBe(true);                  // 해금은 유지
    expect(nextWeek.unlocked).toBe(false);                     // 다시 «새로 열림»이 되지 않는다
  });

  it('달성 전에는 열리지 않는다', () => {
    let w = stampToday(null, MON).week;
    expect(w.claimed).toBe(false);
    const r = stampToday(w, WED);
    expect(r.unlocked).toBe(false);
  });
});
