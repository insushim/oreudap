// 오늘의 계단 — 결정론 검수 [D37]
//
// 🔴 이 파일이 지키는 성질은 «기기가 하나뿐이라 눈으로 확인할 수 없는» 것이다.
//    「전국 어디서나 같은 판」은 두 번째 기기가 있어야 확인되는데, 없다.
//    그래서 결정론을 코드 수준에서 재고, 깨지면 여기서만 알 수 있다.
import { describe, it, expect } from 'vitest';
import { dailyPlan, planForNow, starsFor, recordFlag, flagSummary, todayStars } from '../src/core/daily.js';
import { DAILY } from '../src/core/balance.js';

const SUBJECTS = ['gugudan', 'words34', 'words56'];

describe('오늘의 계단 — 결정론 [D37]', () => {
  it('🔴 같은 날짜·과목이면 판이 «바이트로» 같다', () => {
    for (const s of SUBJECTS) {
      const a = dailyPlan('2026-09-06', s);
      const b = dailyPlan('2026-09-06', s);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('날짜가 하루만 달라도 판이 달라진다', () => {
    const a = dailyPlan('2026-09-06', 'gugudan');
    const b = dailyPlan('2026-09-07', 'gugudan');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('같은 날이라도 과목이 다르면 다른 판이다', () => {
    const g = dailyPlan('2026-09-06', 'gugudan');
    const w = dailyPlan('2026-09-06', 'words34');
    expect(g.seed).not.toBe(w.seed);
  });

  it('🔴 목표가 매일 바뀐다 — 시드가 죽으면 여기서 잡힌다', () => {
    // 시드 계산이 망가지면(예: 문자열을 그대로 넘김) 모든 날이 같은 목표가 된다.
    const goals = new Set();
    for (let d = 1; d <= 28; d += 1) {
      goals.add(dailyPlan(`2026-09-${String(d).padStart(2, '0')}`, 'gugudan').goal);
    }
    expect(goals.size).toBeGreaterThan(3);
  });

  it('목표가 정해진 범위 안이고 5의 배수다', () => {
    for (let d = 1; d <= 28; d += 1) {
      const p = dailyPlan(`2026-09-${String(d).padStart(2, '0')}`, 'gugudan');
      expect(p.goal).toBeGreaterThanOrEqual(DAILY.GOAL_MIN);
      expect(p.goal).toBeLessThanOrEqual(DAILY.GOAL_MAX);
      expect(p.goal % 5).toBe(0);
    }
  });

  it('규칙은 구구단에만 있다 — 없는 규칙을 지어내지 않는다', () => {
    expect(dailyPlan('2026-09-06', 'gugudan').rule).not.toBeNull();
    expect(dailyPlan('2026-09-06', 'words34').rule).toBeNull();
    expect(dailyPlan('2026-09-06', 'words56').scope).toBeNull();
  });

  it('규칙이 가리키는 단이 실제로 존재하는 단이다', () => {
    for (let d = 1; d <= 28; d += 1) {
      const p = dailyPlan(`2026-10-${String(d).padStart(2, '0')}`, 'gugudan');
      if (p.scope) for (const dan of p.scope) expect(dan).toBeGreaterThanOrEqual(2);
      if (p.scope) for (const dan of p.scope) expect(dan).toBeLessThanOrEqual(9);
    }
  });

  it('시각을 주입받는다 — 자정에만 깨지는 테스트를 만들지 않는다', () => {
    const t = new Date('2026-09-06T12:00:00').getTime();
    expect(planForNow('gugudan', t).day).toBe('2026-09-06');
  });
});

describe('별 판정', () => {
  const plan = dailyPlan('2026-09-06', 'gugudan');

  it('목표의 절반에서 별 1개, 목표에서 2개', () => {
    expect(starsFor(plan, { floor: plan.stars.one - 1, accuracy: 1 })).toBe(0);
    expect(starsFor(plan, { floor: plan.stars.one, accuracy: 0.5 })).toBe(1);
    expect(starsFor(plan, { floor: plan.goal, accuracy: 0.5 })).toBe(2);
  });

  it('🔴 정확도만으로는 별 3개가 안 된다 — 두 문제 풀고 100%가 최적 전략이 되면 안 된다', () => {
    expect(starsFor(plan, { floor: 2, accuracy: 1 })).toBe(0);
    expect(starsFor(plan, { floor: plan.stars.one, accuracy: 1 })).toBe(1);
    expect(starsFor(plan, { floor: plan.goal, accuracy: 1 })).toBe(3);
  });
});

describe('깃발 도감', () => {
  const plan = dailyPlan('2026-09-06', 'gugudan');

  it('🔴 나중에 못 한 판이 앞의 별을 지우지 않는다', () => {
    let f = recordFlag({}, plan, 3);
    expect(todayStars(f, plan)).toBe(3);
    f = recordFlag(f, plan, 1);              // 같은 날 다시, 이번엔 못했다
    expect(todayStars(f, plan)).toBe(3);     // 최고가 남는다
  });

  it('안 한 날은 «없음»일 뿐 진행도를 깎지 않는다', () => {
    const f = recordFlag({}, dailyPlan('2026-09-01', 'gugudan'), 2);
    // 9월 2~5일을 통째로 건너뛰고 6일에 기록
    const f2 = recordFlag(f, plan, 1);
    expect(flagSummary(f2)).toEqual({ days: 2, stars: 3 });
  });

  it('저장이 무한히 자라지 않는다', () => {
    let f = {};
    for (let i = 0; i < DAILY.FLAG_KEEP + 20; i += 1) {
      const d = new Date(2026, 0, 1 + i);
      const p = dailyPlan(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 'gugudan');
      f = recordFlag(f, p, 2);
    }
    expect(Object.keys(f).length).toBeLessThanOrEqual(DAILY.FLAG_KEEP);
  });

  it('과목이 다르면 같은 날에 깃발이 따로 찍힌다', () => {
    let f = recordFlag({}, dailyPlan('2026-09-06', 'gugudan'), 2);
    f = recordFlag(f, dailyPlan('2026-09-06', 'words34'), 1);
    expect(flagSummary(f)).toEqual({ days: 2, stars: 3 });
  });
});
