// 밸런스 상수 — 단일 진실원.
// 게임 코드·프로브·게이트·문서 재생성 스크립트가 전부 이 파일을 import 한다.
// 🚫 다른 파일에서 이 수치를 다시 적지 말 것(L-070: 손계산 전사가 어긋난다).

// 🔴 난이도의 정본. 2026-09-04 상향 — 사용자: 「너무 쉽다 · 탈락은 언제 하는겨」.
//    이전 값(T0 3.2 · K 0.011 · TMIN 1.0)은 하한에 **200층에서야** 닿아서
//    다 아는 아이는 사실상 죽지 않았다 — 엔드리스인데 «실력 천장»이 없었다.
//    지금은 90층 부근에서 하한에 닿고, 그 하한이 사람 반응시간(평균 0.85초) 언저리라
//    아무리 잘 알아도 언젠가 손이 못 따라간다. 그게 「한 판 더」를 만든다.
export const TIMER = {
  T0: 2.6,      // 층 1 기준 상한(초)
  K: 0.021,     // 층당 감소(초)
  TMIN: 0.85,   // 바닥(초) — 반응시간 평균과 같은 자리
};

/** 층 n 의 제한시간(초). GDD §1-4-1 */
export function timerFor(floor) {
  return Math.max(TIMER.TMIN, TIMER.T0 - TIMER.K * floor);
}

// 🔴 모드 정본. 「무한의 계단처럼 아슬아슬하게」(사용자, 2026-09-05)에 대한 답이다.
//    무한의 계단의 긴장 장치는 «문항 타이머»가 아니라 **계속 줄어드는 기력 게이지** 하나다.
//    그래서 아슬아슬 모드는 문항 타이머를 아예 끄고 게이지만 돌린다 — 두 시계를 같이 돌리면
//    아이는 무엇 때문에 죽었는지 모른다(클래식을 그냥 어렵게 한 것과 다른 «구조»여야 모드다).
//
//  · timed   문항마다 제한시간이 있는가(timerFor)
//  · hearts  목숨 개수. 0 이면 하트를 쓰지 않는다(기력이 곧 목숨)
//  · stamina 기력 게이지를 쓰는가
//  · runMs   판 전체 제한시간(ms). 0 이면 무제한
export const MODES = {
  classic: {
    label: '무한 오르기', hint: '하트 3개 · 문항마다 제한시간',
    timed: true, hearts: 3, stamina: false, runMs: 0,
  },
  thrill: {
    label: '아슬아슬', hint: '기력이 계속 줄어든다 · 멈추면 떨어진다',
    timed: false, hearts: 0, stamina: true, runMs: 0,
  },
  sprint: {
    label: '60초 질주', hint: '1분 안에 몇 층까지',
    // 🔴 질주 모드의 하트는 5개다. 3개면 대부분 «시간이 아니라 하트»로 끝나 60초라는 이름이
    //    거짓말이 된다(실측: p=0.5 에서 시간 종료 0%). 모드는 죽는 이유가 달라야 모드다.
    timed: true, hearts: 5, stamina: false, runMs: 60000,
  },
};
export const DEFAULT_MODE = 'classic';

/** 기력 게이지 — 0~1. 아슬아슬 모드의 «유일한» 생명선이다.
 *  🔴 수치의 뜻: 층이 오를수록 «가만히 있는 값»이 비싸진다. 정답 회복은 고정이고
 *     소모만 늘어나므로, 실력이 그대로면 언젠가 반드시 바닥난다 — 그게 엔드리스의 끝이다. */
export const STAMINA = {
  START: 1,
  DRAIN0: 0.135,      // 층 1 에서 초당 소모
  DRAIN_K: 0.0030,    // 층당 추가 소모(초당)
  DRAIN_MAX: 0.62,    // 소모 상한 — 이 위로는 사람 손이 못 따라간다
  REFILL: 0.235,      // 정답 회복(고정)
  QUICK_BONUS: 0.075, // 빨리 답할수록 얹어 주는 회복(최대치)
  QUICK_MS: 1600,     // 이 시간 안에 답하면 보너스가 붙기 시작한다
  WRONG: 0.30,        // 오답 감소
  LOW: 0.28,          // 이 아래면 «아슬아슬» 연출이 켜진다
  // 🔴 바닥에 가까울수록 회복이 커진다. 이게 없으면 게이지가 «넉넉하다 → 즉사» 두 상태뿐이라
  //    정작 아슬아슬한 구간을 지나가지 않는다(실측: 완벽한 봇이 판의 5%만 위험구간에 머물렀다).
  //    붙잡고 버티는 구간을 «길게» 만드는 것이 이 모드의 전부다.
  COMEBACK: 0.35,     // 회복 배수 = 1 + COMEBACK × (1 - 기력)
  // 🔴 «천장»이 층마다 내려간다. 이게 아슬아슬함의 진짜 장치다 —
  //    컴백 회복만 키웠더니 바닥에서 단번에 튀어 올라 위험구간을 오히려 «덜» 지나갔다(3%).
  //    천장이 내려오면 높은 층에서는 게이지가 물리적으로 위험구간을 벗어날 수 없다.
  //    높이 오를수록 숨이 차는 것 — 구조가 곧 연출이다.
  CAP0: 1,
  CAP_K: 0.0200,      // 층당 천장 하락
  CAP_MIN: 0.42,
};

/** 층 n 에서 기력이 «찰 수 있는» 최대치 */
export function capFor(floor) {
  return Math.max(STAMINA.CAP_MIN, STAMINA.CAP0 - STAMINA.CAP_K * floor);
}

/** 층 n 에서 초당 기력 소모 */
export function drainFor(floor) {
  return Math.min(STAMINA.DRAIN_MAX, STAMINA.DRAIN0 + STAMINA.DRAIN_K * floor);
}

/** 정답 회복량 — 빨리 답하면 더 준다(생각하는 시간이 곧 기력이다) */
export function refillFor(elapsedMs, stamina = 1) {
  const q = Math.max(0, 1 - elapsedMs / STAMINA.QUICK_MS);
  const base = STAMINA.REFILL + STAMINA.QUICK_BONUS * q;
  return base * (1 + STAMINA.COMEBACK * (1 - Math.max(0, Math.min(1, stamina))));
}

export const HEART = {
  START: 3,
  MAX: 3,
  STREAK_HEAL: 10, // 스트릭 10마다 하트 +1 (최대치 초과분은 버림)
};

// 2갈래는 찍어서 50% 다. 그 구간이 길면 «공부 안 해도 오르는» 구간이 길어진다.
export const BRANCH = {
  THREE_WAY_FROM: 8,   // 이 층부터 3갈래가 50% 확률로 등장
  THREE_WAY_FULL: 26,  // 이 층부터 항상 3갈래
  MIX_RATIO: 0.5,
};

// 🔴 난이도 계단의 «층 경계» 정본. 문항 등급(questions.maxTierFor)과 BGM 강도(ui/sound.js)가
//    같은 배열을 읽는다 — 음악이 세지는 층과 문제가 어려워지는 층이 어긋나면
//    아이는 「왜 갑자기 어렵지」를 귀로 예고받지 못한다(둘을 따로 적어 두면 반드시 어긋난다, L-070).
export const TIER_FLOORS = [10, 25];   // [등급2 개방층, 등급3 개방층]

/** 층 n 이 속한 강도 단계(0·1·2) */
export function tierIndexFor(floor) {
  let i = 0;
  for (const f of TIER_FLOORS) if (floor >= f) i += 1;
  return i;
}

/** 층 n 이 속한 단계가 «시작된» 층 — BGM 재생속도 램프의 기준점 */
export function tierStartFor(floor) {
  const i = tierIndexFor(floor);
  return i === 0 ? 1 : TIER_FLOORS[i - 1];
}

/** 층 n 의 갈래 수. GDD §1-3-3 */
export function branchesFor(floor, rnd) {
  if (floor >= BRANCH.THREE_WAY_FULL) return 3;
  if (floor >= BRANCH.THREE_WAY_FROM) return rnd() < BRANCH.MIX_RATIO ? 3 : 2;
  return 2;
}

export const TIMING = {
  // 🔴 «활성화 이전 입력 버퍼»는 없앴다(2026-09-04 교차검증 3계열 합의).
  //    이 게임은 선택지가 «활성화 순간»에 처음 나타난다 — 그 전의 탭은 정보 없는 손가락이지
  //    이른 선택이 아니다. 버퍼가 있으면 «보지 않은 문제»에 답이 커밋되고, 갈래 수가 2→3으로
  //    바뀌는 경계에서는 본 적 없는 레이아웃의 임의 위치가 판정된다.
  //    ⇒ 문항이 살아 있지 않을 때의 입력은 그냥 무시한다.
  JUMP_MS: 220,
  STUMBLE_MS: 280,
  HIGHLIGHT_MS: 800,      // 오답 시 정답 발판 하이라이트
};

export const COIN = {
  PER_FLOOR: 1,
  STREAK_BONUS: 5,        // 스트릭 10마다
  MISSION: 20,            // 일일 미션 1개당
};

export const SHOP = {
  SKINS: [
    { id: 'fox',     name: '아기 여우',   price: 0 },
    { id: 'rabbit',  name: '토끼',       price: 60 },
    { id: 'penguin', name: '펭귄',       price: 120 },
    { id: 'cat',     name: '고양이',     price: 240 },
    { id: 'bear',    name: '곰돌이',     price: 480 },
    { id: 'owl',     name: '부엉이',     price: 900 },
    { id: 'dragon',  name: '아기 용',    price: 1500 },
  ],
  THEMES: [
    { id: 'dawn',   name: '새벽 하늘', price: 0 },
    { id: 'day',    name: '한낮 하늘', price: 300 },
    { id: 'sunset', name: '노을 하늘', price: 600 },
    { id: 'night',  name: '별밤 하늘', price: 1200 },
  ],
};

/** 층에 따른 하늘 테마 (50층마다 전환) — 해금과 무관한 연출축 */
export const SKY_EVERY = 50;

export const SRS = {
  SESSION_INTERVALS: [3, 7, 15], // 세션 복습 큐: 몇 문항 뒤에 다시 낼지
  SESSION_GRADUATE: 3,           // 세션 큐 졸업 정답 수
  BOX_DAYS: [1, 3, 7, 16],       // 영속 오답노트 박스별 재출제 간격(일)
  MAX_BOX: 4,                    // 졸업 박스
  WEIGHT_MAX: 3,                 // 약점 항목 출제 가중 상한(배)
  NO_REPEAT_WINDOW: 5,           // 무작위 출제에서 직전 N문항 반복 금지(복습 큐는 예외)
};

export const MISSIONS = [
  { id: 'correct30', label: '오늘 정답 30개', type: 'correct', goal: 30, reward: COIN.MISSION },
  { id: 'streak10',  label: '스트릭 10 달성', type: 'streak', goal: 1,  reward: COIN.MISSION },
  { id: 'review5',   label: '오답노트 5문제 정답', type: 'review', goal: 5, reward: COIN.MISSION },
];

export const DECK = {
  TWO_WAY: ['L', 'L', 'L', 'R', 'R', 'R'],
  THREE_WAY: ['L', 'L', 'C', 'C', 'R', 'R'],
  REFILL_AT: 2,        // 잔여 이 장 이하가 되면 새 덱을 섞어 합친다(소진 금지 = 카운팅 방어)
  MAX_SAME_RUN: 3,     // 같은 위치 연속 상한(4연속 금지)
  RESHUFFLE_TRIES: 20,
};

/** 밴드당 최소 낱말 수 — 이보다 적으면 한 판 안에 같은 단어가 돌아와 «암기 게임»이 된다.
 *  🔴 이 값을 적는 곳은 여기 하나뿐이다. 테스트도 데이터 게이트도 여기를 읽는다. */
export const MIN_WORDS_PER_BAND = 500;

export const SAVE = {
  KEY: 'oreudap:progress',
  VERSION: 3,
};

/** 성능 예산 — 등급형(L-093: vsync 스냅 때문에 16.7 로 적으면 영구 미달) */
export const PERF = {
  P95_DESKTOP_MS: 17.5,
  P95_MOBILE_MS: 34,
  INITIAL_GZIP_BYTES: 3 * 1024 * 1024,
  // 🔴 «플레이하려고 받는 것»(TOTAL)과 «필요할 때 한 개씩 받는 것»(ONDEMAND)은 다른 예산이다.
  //    8MB 상한은 번들 이야기다. 낱말 발음 943개는 4KB 짜리를 문제당 하나씩 받는 콘텐츠라
  //    합쳐서 재면 「받지도 않는 3.8MB」때문에 게이트가 빨간불이 된다 — 틀린 것을 재는 것이다.
  //    대신 온디맨드에도 상한을 두고, «첫 문제 전에 한 건도 안 받는다»를 게이트가 직접 확인한다.
  TOTAL_BYTES: 8 * 1024 * 1024,
  ONDEMAND_DIRS: ['assets/say'],
  ONDEMAND_BYTES: 6 * 1024 * 1024,
  DRAWCALL_WARN: 60,
};
