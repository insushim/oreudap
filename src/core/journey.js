// 여정 — 계단을 이름 있는 구간으로 나누고, 「어디까지 왔나」를 만든다.
//
// 🔴 순수하다. DOM 도 저장소도 모른다 — 저장 객체를 «받아» 판단만 돌려준다.
//    그래야 headless 로 1:1 검수가 되고(D38), 화면을 바꿔도 규칙이 안 흔들린다.
//
// 🔴 해금은 «앞 구간을 완주했는가» 하나로만 결정된다. 코인으로도, 날짜로도, 결제로도 열리지 않는다.
//    이유는 balance.js 의 ZONES 주석에 있다(수행 연계 보상 ≠ 기능적 언락).

import { ZONES } from './balance.js';

/** 층 n 이 속한 구간의 인덱스. 0부터. */
export function zoneIndexFor(floor) {
  const f = Number(floor) || 0;
  for (let i = 0; i < ZONES.length; i += 1) if (f <= ZONES[i].end) return i;
  return ZONES.length - 1;
}

/** 구간 i 가 시작되는 층(1부터) */
export function zoneStart(i) {
  return i <= 0 ? 1 : ZONES[i - 1].end + 1;
}

/**
 * 과목 하나의 여정 상태.
 *
 * 🔴 «완주»의 정의: 그 구간의 마지막 층에 **닿았는가**. 지나갔는가가 아니다 —
 *    구름(21~50)은 50층을 밟아야 완주다. 51층에 닿으면 당연히 50도 밟았으므로 같은 뜻이지만,
 *    「끝 층 이상」으로 적어 두면 경계를 바꿀 때 한쪽만 고쳐도 조용히 맞아 버려서 결함을 못 본다.
 *
 * @param {number} bestFloor 그 과목의 최고 도달 층
 * @returns {{index:number, name:string, icon:string, from:number, to:number,
 *            reached:number, need:number, done:boolean, locked:boolean}[]}
 */
export function journeyOf(bestFloor) {
  const best = Math.max(0, Number(bestFloor) || 0);
  let prevDone = true;                       // 첫 구간은 언제나 열려 있다
  return ZONES.map((z, i) => {
    const from = zoneStart(i);
    const to = z.end;
    const done = Number.isFinite(to) ? best >= to : false;   // 용암은 끝이 없다 = 완주 없음
    const reached = Math.max(0, Math.min(best, Number.isFinite(to) ? to : best) - from + 1);
    const span = Number.isFinite(to) ? to - from + 1 : 0;
    const out = {
      index: i, id: z.id, name: z.name, icon: z.icon, from, to,
      reached: best < from ? 0 : reached,
      span,
      done,
      locked: !prevDone,
    };
    prevDone = done;
    return out;
  });
}

/** 지금 «오르고 있는» 구간 — 화면이 가리킬 한 칸 */
export function currentZone(bestFloor) {
  const list = journeyOf(bestFloor);
  return list.find((z) => !z.done) || list[list.length - 1];
}

/**
 * 다음 구간까지 몇 층 남았는가. 결과 화면의 «미완성 목표» 하나.
 * 이미 마지막 구간이면 null(더 열 것이 없다 — 없는 목표를 지어내지 않는다).
 */
export function nextZoneGap(bestFloor) {
  const best = Math.max(0, Number(bestFloor) || 0);
  const cur = currentZone(best);
  if (!cur || !Number.isFinite(cur.to)) return null;
  return { zone: cur, gap: Math.max(0, cur.to - best) };
}

/**
 * 저장된 해금 목록을 «다시 계산»한다.
 *
 * 🔴 저장 데이터를 믿지 않는다(D38). localStorage 는 아이가 열어 고칠 수 있는 곳이고,
 *    해금을 저장값으로 읽으면 「우주 계단 열림」을 손으로 써 넣는 것으로 건너뛸 수 있다.
 *    그래서 **해금은 저장하지 않고 최고 기록에서 매번 유도한다** — 위조할 값이 없으면 위조가 없다.
 *    (최고 기록 자체는 위조할 수 있지만, 그건 이미 D12 sanitize 의 관할이고
 *     「기록을 고쳐 열었다」는 「열림을 고쳐 넣었다」와 달리 게임을 망가뜨리지 않는다.)
 */
export function unlockedZones(bestFloor) {
  return journeyOf(bestFloor).filter((z) => !z.locked).map((z) => z.id);
}
