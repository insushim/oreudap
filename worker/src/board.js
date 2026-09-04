// 판 저장 — KV 키 하나에 «오늘 판» 전체를 담는다.
//
// 🔴 «사람»을 저장하지 않는다. 계정도 쿠키도 기기 식별자도 없다.
//    그래서 «어제의 나»와 «오늘의 나»를 잇는 길이 서버에 없다 — 그게 이 설계의 요점이다.
//    성장 기록은 기기 안(localStorage)에만 산다.
//
// 🔴 이름은 **기기가 이미 가려서** 보낸다. 별표 없는 직접 이름은 acceptName 이 거부한다.
//
// ⚠️ 정직하게 적어 둘 것 두 가지:
//    ① 오르답은 싱글 플레이라 점수를 «클라이언트가» 보낸다. 서버 권위 시뮬레이션이 없으므로
//       이 판은 «친구들과 보는 오늘의 기록판»이지 부정을 막는 공식 기록이 아니다.
//    ② KV 는 최종적 일관성이다. 같은 순간에 둘이 제출하면 한쪽이 덮일 수 있다.
//       학급 규모에서는 드물고, 놓쳐도 한 판 더 하면 된다 — 그 대가로 무료 한도 안에 산다.
import { kstDay, merge, rollover, dedupe, rankOf, KEEP } from './rank-core.js';
import { isGeneratedNick } from '../../src/core/nickname.js';

const KEY = 'board';

export async function readBoard(kv) {
  const raw = await kv.get(KEY, 'json');
  return rollover(raw, kstDay());
}

export async function submitScore(kv, row) {
  const cur = await readBoard(kv);
  const next = merge(cur, row, kstDay(), isGeneratedNick);
  if (next.rows === cur.rows && next.day === cur.day) return { ok: false, reason: 'rejected' };
  await kv.put(KEY, JSON.stringify(next));
  return { ok: true, rank: rankOf(next.rows, Math.round(Number(row.s) || 0)), total: next.rows.length };
}

export async function topRows(kv, n) {
  const b = await readBoard(kv);
  return {
    day: b.day,
    rows: dedupe(b.rows).slice(0, Math.max(1, Math.min(KEEP, n | 0))),
    total: b.rows.length,
    yday: b.yday || null,
  };
}
