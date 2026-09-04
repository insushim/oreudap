// 닉네임 — 아이가 직접 짓는 것이 기본이고, 비워 두면 자동 생성한다(사용자 요청 2026-09-04).
// 🔴 클라이언트와 서버(Cloudflare Worker)가 **같은 모듈**을 import 한다. 서버가 반드시 다시 검증한다.
//
// 🔴 오르답은 리로드 아레나와 «가리는 자리»가 다르다.
//    아레나는 멀티라 방(서버)이 이미 이름을 알고 있어 서버에서 가린다.
//    오르답은 싱글이라 서버가 이름을 알 이유가 없다 — 그래서 **기기에서 가려서 보낸다.**
//    직접 지은 이름의 원문은 이 기기를 «영영 벗어나지 않는다». 서버는 별표가 없는
//    직접 이름을 아예 거부한다(rank-core.js 의 acceptName).
// ⚠️ 생성 낱말을 지우면 그 이름을 쓰던 기기는 «직접 지은 이름» 으로 재검증된다.
//    통과 못 하면 서버가 새 이름을 발급하므로 접속이 막히지는 않는다(2026-08-29 확인).
export const ADJ = [
  '빠른','용감한','졸린','신난','씩씩한','상냥한','귀여운','엉뚱한',
  '재빠른','튼튼한','조용한','명랑한','야무진','든든한','다정한','활발한',
];   // 16개 (각 ≤4자)
export const NOUN = [
  '다람쥐','로켓','수달','고래','여우','너구리','펭귄','사슴','두더지',
  '호랑이','거북이','참새','오리','토끼','곰돌이','병아리','해달','비버','판다',
];   // 19개 → 16×19×100 = 30,400 가지
// 🔴 '부엉이'(2026-08-29)·'코알라'(2026-08-30) 는 뺐다 — 한국에서 정치적 상징으로 읽혀 논란이 된다(사용자 지시).
//    교실에서 쓰는 이름이라 아이가 고른 것도 아닌데 시비가 붙을 여지를 만들면 안 된다.
//    목록을 고쳐도 접속은 안 막힌다. 다만 «새로 발급»되지는 않는다 — 옛 이름('빠른코알라77')은
//    자동 생성으로는 인정 안 되지만 «직접 지은 이름» 검사를 통과해 그대로 남고, 랭킹에서는 가려진다.
//    그 기기의 아이는 계속 쓰되 새 아이에게는 안 붙는다 — 목록을 고치는 목적은 이걸로 충족된다.

export function makeNick(rand) {
  const r = rand || ((n) => Math.floor(Math.random() * n));   // @allow-math-random 닉네임 뽑기(연출)
  return ADJ[r(ADJ.length)] + NOUN[r(NOUN.length)] + String(r(100)).padStart(2, '0');
}

// 🔴 화이트리스트 자체로 정규식을 만든다. `/^(.+?)(.+?)(\d{2})$/` 는 쓰지 않는다 —
//    lazy 수량자가 연달아 있으면 첫 그룹이 항상 1글자로 최소 소비돼 유효 닉네임이 전부 거부된다.
const NICK_RE = new RegExp(`^(${ADJ.join('|')})(${NOUN.join('|')})(\\d{2})$`);
export function isGeneratedNick(s) {
  return typeof s === 'string' && s.length <= 10 && NICK_RE.test(s);
}
export const NICK_SPACE = ADJ.length * NOUN.length * 100;

// ── 직접 지은 이름 ────────────────────────────────────────────────
// 🔴 자유 입력을 «허용하되 좁힌다». 초등학생이 쓰는 게임이라 이 칸이
//    ① 실명·학교·반 ② 친구를 놀리는 말 ③ 정치·혐오 표현 의 통로가 되기 쉽다.
//    글자 화이트리스트가 1차 방어다 — 한글 낱자(ㅅㅂ·ㅗ 같은)와 특수문자·공백이
//    통째로 걸러지므로, 흔한 우회가 대부분 여기서 죽는다.
//    2차가 금칙어다. 완벽할 수 없으므로 교사가 점수판에서 볼 수 있다는 점이 최종 방어다.
const NICK_MAX = 8;
const NICK_MIN = 2;
const ALLOWED = /[^가-힣a-zA-Z0-9]/g;      // 완성형 한글·영문·숫자만. 낱자·공백·특수문자 제거

// 금칙어: 욕설·비하·성적 표현·정치 진영어. 부분 문자열로 판정한다.
// ⚠️ 중립적인 낱말(예: '장애인')은 넣지 않는다 — 과차단은 아이를 억울하게 만든다.
const BAD = [
  '시발','씨발','씨바','시바','싀발','좆','존나','존슴','병신','븅신','빙신','지랄',
  '새끼','개새','개색','엄창','니미','느금','창녀','걸레','섹스','야동','자지','보지','따먹',
  '틀딱','급식충','한남','한녀','메갈','일베','좌빨','수구','빨갱이',
  '강간','성폭','노예','자살','살인마',
  'fuck','fvck','shit','bitch','dick','pussy','porn','sex','nazi','hitler',
];

/** 입력을 «쓸 수 있는 모양»으로 다듬는다. 판정하지 않는다 — 판정은 isAllowedNick. */
export function sanitizeNick(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC').replace(ALLOWED, '').slice(0, NICK_MAX);
}

// 🔴 «학교에서 나를 특정하는 꼬리표»는 막는다. 8자 상한만으로는 못 막는다 —
//    '5학년3반김철수' 가 정확히 8자다(2026-08-29 실측). 모양으로 잡아야 한다.
const SCHOOL_RE = /(\d\s*(학년|학년도|반|번)|학년|초등|중학교|고등학교)/;

/** 직접 지은 이름으로 받아도 되는가. 서버가 이 함수로 다시 검증한다. */
export function isAllowedNick(s) {
  if (typeof s !== 'string') return false;
  if (s !== sanitizeNick(s)) return false;            // 다듬으면 달라진다 = 허용 밖 글자가 있었다
  if (s.length < NICK_MIN || s.length > NICK_MAX) return false;
  if (/^\d+$/.test(s)) return false;                  // 숫자만 = 학번·전화번호 조각이 될 수 있다
  if (SCHOOL_RE.test(s)) return false;                // 학년·반 같은 신원 꼬리표
  const low = s.toLowerCase();
  // 🔴 부분일치는 «음절이 겹치는 멀쩡한 말»을 같이 잡는다 —
  //    2026-08-30 실측: 보지마·자지마·시바견·새끼손 이 전부 막혔다.
  //    (같은 결함을 영어 낱말 검수기에서도 찾았다: '피' 가 피망·피부·피아노를 잡았다.)
  //    그래서 오해 소지가 큰 몇 개만 «면제 문맥»을 둔다. 나머지는 부분일치 그대로다.
  for (const [bad, ok] of EXEMPT) {
    if (low.includes(bad) && ok.some((x) => low.includes(x))) return true;
  }
  return !BAD.some((b) => low.includes(b));
}

// 금칙어를 품고 있어도 «그 말이 아닌» 흔한 낱말들
const EXEMPT = [
  ['보지', ['보지마', '보지말']],
  ['자지', ['자지마', '자지말']],
  ['시바', ['시바견']],
  ['새끼', ['새끼손', '새끼발', '새끼고양이', '새끼오리']],
];

/** 서버가 받아들일 «다듬은» 이름. 알맹이가 안 남으면 null.
 *  🔴 다듬어서 받되(끝의 공백·느낌표는 용서), **너무 많이 깎였으면 거부**한다.
 *     안 그러면 '<script>x</script>' 가 'scriptxs' 라는 이름으로 살아남는다(실측). */
export function coerceNick(raw) {
  if (typeof raw !== 'string') return null;
  const clean = sanitizeNick(raw);
  // 🔴 공백은 «깎인 것»으로 세지 않는다. 아이가 '물감 왕' 처럼 띄어 쓰는 건 자연스럽고,
  //    그걸 거부하면 왜 안 되는지 알 수 없는 벽이 된다. 세는 건 «진짜 잡동사니»뿐이다.
  const solid = [...raw.normalize('NFC').replace(/\s+/g, '')];
  const dropped = solid.length - [...clean].length;
  if (dropped > 2 && dropped > solid.length * 0.25) return null;
  return isUsableNick(clean) ? clean : null;
}

/** 서버가 받아들일 이름인가 — 생성된 것이든, 직접 지은 것이든. */
export function isUsableNick(s) { return isGeneratedNick(s) || isAllowedNick(s); }
export const NICK_LIMITS = { min: NICK_MIN, max: NICK_MAX };

// ── 랭킹에 내보낼 이름 ────────────────────────────────────────────
// 🔴 가리는 자리가 «보여줄 때»가 아니라 **보내기 전**이다.
//    화면에서만 가리면 서버에는 '김철수' 가 그대로 남는다 — 가린 티만 나고 실제로 지켜지는 건 없다.
//    그래서 방(Room)이 랭킹으로 넘기기 전에 여기서 깎고, 원래 이름은 **기기와 그 방을 벗어나지 않는다.**
//    같은 교실 점수판에는 원래 이름이 보인다(서로 아는 사이고, 교사가 이상한 이름을 잡아내는 최종 방어다).
//
// 🔴 자동 생성 이름은 «가리지 않는다». 30,400가지 중 하나이고 사람을 가리키지 않는다 —
//    '빠른**쥐01' 로 만들면 개인정보는 하나도 안 지키면서 랭킹만 못 읽게 된다.
//    직접 지은 이름은 실명일 수 있으므로 «항상» 가린다(실명인지 아닌지 우리는 알 수 없다).
export function maskNick(s) {
  if (typeof s !== 'string' || !s) return '';
  if (isGeneratedNick(s)) return s;
  const ch = [...s];
  const n = ch.length;
  if (n <= 1) return s;
  if (n === 2) return ch[0] + '*';          // '김철' → '김*'
  const k = n <= 3 ? 1 : 2;                 // 가운데 몇 자를 가릴지
  const start = Math.max(1, Math.floor((n - k) / 2));
  for (let i = start; i < start + k && i < n - 1; i++) ch[i] = '*';
  return ch.join('');                       // '김철수'→'김*수' · '남궁철수'→'남**수'
}
