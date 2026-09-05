// 판 저장 — **한 줄에 KV 키 하나**.
//
// 🔴 왜 이 구조인가(2026-09-05 실측으로 바꿨다): 예전에는 `board` 키 하나에 오늘 판 전체를 담고
//    제출마다 «읽고 → 고치고 → 다시 쓰기»를 했다. KV 는 최종적 일관성이라 읽기가 최대 1분까지
//    옛 값을 준다 — 비슷한 시각에 들어온 제출끼리 서로를 덮어썼다.
//    실측: 5건을 한꺼번에 보내니 2건만 남았고, 4초 간격으로 3건을 보내도 2건만 남았다.
//    교실에서 25명이 같이 끝내면 상당수가 등수판에서 사라진다 — 아이들이 제일 보는 화면이다.
//    줄마다 키를 따로 쓰면 읽고-고치고-쓰기 자체가 없어서 «덮어쓸 것»이 없다.
//
// 🔴 점수는 KV **메타데이터**에 같이 넣는다. list() 가 메타데이터를 함께 돌려주므로
//    판 전체를 그리는 데 목록 조회 «한 번»이면 된다(줄 수만큼 get 하지 않는다).
//
// 🔴 «사람»을 저장하지 않는다. 계정도 쿠키도 기기 식별자도 없다 — 어제의 나와 오늘의 나를
//    잇는 길이 서버에 없다. 이름은 기기가 이미 가려서 보내고, 별표 없는 직접 이름은 거부한다.
//
// ⚠️ 여전히 정직하게 적어 둘 것: 오르답은 싱글 플레이라 점수를 «클라이언트가» 보낸다.
//    서버 권위 시뮬레이션이 없으므로 이 판은 «오늘의 기록판»이지 부정을 막는 공식 기록이 아니다.
import { kstDay, clean, dedupe, rankOf, rowKey, dayPrefix, KEEP, YDAY_KEEP } from './rank-core.js';
import { isGeneratedNick } from '../../src/core/nickname.js';

// 사흘이면 «오늘 + 어제»를 그리고도 남는다. TTL 이 있으니 따로 청소하지 않는다.
const TTL_S = 3 * 24 * 60 * 60;

/** 하루치 줄을 «목록 조회»로 모은다. KV list 는 1000개까지 주고 cursor 로 이어진다. */
async function listDay(kv, day) {
  const prefix = dayPrefix(day);
  const rows = [];
  let cursor;
  for (let page = 0; page < 5; page += 1) {          // 학급 규모에서 5페이지(5000줄)면 충분하다
    const res = await kv.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) {
      const m = k.metadata;
      // 메타데이터가 없는 줄(옛 형식·잘린 쓰기)은 조용히 버린다 — 목록을 위해 get 을 N번 하지 않는다.
      if (m && typeof m.s === 'number' && m.n && m.sub) rows.push({ n: m.n, s: m.s, sub: m.sub });
    }
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  return rows;
}

export async function submitScore(kv, row) {
  const add = clean(row, isGeneratedNick);
  if (!add) return { ok: false, reason: 'rejected' };
  const day = kstDay();
  // 🔴 **쓰기 전에 아무것도 읽지 않는다.** 점수가 키에 들어 있어 기록마다 키가 다르므로
  //    덮어쓸 것이 없다. 읽고-고치고-쓰기가 없으면 늦은 읽기도 해를 못 끼친다.
  //    같은 아이가 여러 번 내면 키가 여러 개 생기지만, 클라이언트가 «오늘 최고보다 나을 때만»
  //    보내므로 몇 개에 그치고, 최고 기록은 dedupe 가 고른다. TTL 이 사흘 뒤 치운다.
  await kv.put(rowKey(day, add.sub, add.n, add.s), JSON.stringify(add),
    { expirationTtl: TTL_S, metadata: add });

  // 🔴 목록 조회(list)는 방금 쓴 키를 30~60초쯤 뒤에야 보여 준다. 그대로 등수를 매기면
  //    «내가 빠진 판»에서 내 등수를 계산하게 된다 — 방금 1등을 했는데 순위가 이상해진다.
  //    우리는 방금 쓴 줄을 알고 있으므로 목록에 없으면 직접 끼워 넣는다.
  const listed = await listDay(kv, day);
  const rows = dedupe([...listed, add]);
  return { ok: true, rank: rankOf(rows, add.s), total: rows.length };
}

export async function topRows(kv, n) {
  const day = kstDay();
  const rows = dedupe(await listDay(kv, day));
  const y = new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const yrows = dedupe(await listDay(kv, y)).slice(0, YDAY_KEEP);
  return {
    day,
    rows: rows.slice(0, Math.max(1, Math.min(KEEP, n | 0))),
    total: rows.length,
    yday: yrows.length ? { day: y, rows: yrows } : null,
  };
}
