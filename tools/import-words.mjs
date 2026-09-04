// englishdefence(자체 제작 · 저작권 클린)의 초등 어휘 1260개를 오르답 형식으로 옮긴다.
// 원본: {en, ko, ex, exKo} → 오르답: {w, k, pos}
// pos 는 원본에 없으므로 «표기 규칙»으로 추론한다 — 오답 후보의 «선호»일 뿐이라
// 틀려도 게임이 깨지지 않는다(distractors.js 가 풀 전체로 폴백).
import fs from 'node:fs';

const SRC = process.argv[2] || `${process.env.HOME}/Documents/dev/englishdefence/src/data/words.ts`;
const raw = fs.readFileSync(SRC, 'utf8');

const blocks = {};
let cur = null;
for (const line of raw.split('\n')) {
  const m = line.match(/^export const (GRADE\d)\s*:/);
  if (m) { cur = m[1]; blocks[cur] = []; continue; }
  if (!cur) continue;
  const e = line.match(/\{\s*en:\s*'([^']+)'\s*,\s*ko:\s*'([^']*)'/);
  if (e) blocks[cur].push({ w: e[1], k: e[2] });
}

// ── 품사 추론 ────────────────────────────────────────────
const ADJ_SUF = /(ful|ous|ive|able|ible|less|ent|ant|al|ic|ish|y)$/;
const VERB_HINT = new Set(['go','come','eat','drink','run','walk','jump','sit','stand','read','write','sing','dance','play','study','sleep','wake','open','close','buy','sell','give','take','make','do','have','see','look','watch','listen','hear','speak','talk','say','tell','ask','answer','help','work','live','love','like','want','need','know','think','feel','find','lose','win','start','stop','begin','end','send','bring','carry','put','get','meet','visit','learn','teach','draw','paint','cook','wash','clean','wear','swim','fly','ride','drive','call','wait','try','use','move','turn','push','pull','catch','throw','build','break','fix','grow','change','choose','decide','remember','forget','understand','explain','describe','compare','create','invent','discover','protect','improve','achieve','accomplish','celebrate','continue','prepare','practice','repeat','return','follow','lead','share','join','enjoy','hope','wish','worry','agree','believe','count','cut','draw','hold','keep','let','pay','plan','save','show','sit','solve','spend','stay','travel','arrive','appear','collect','connect','deliver','depend','develop','disappear','divide','enter','escape','exchange','expect','experience','express','fill','finish','fold','hurry','imagine','include','increase','introduce','invite','marry','measure','mix','notice','offer','order','organize','paste','perform','pick','plant','pour','prefer','pretend','print','produce','promise','pronounce','provide','raise','reach','receive','recognize','recommend','record','recycle','reduce','refuse','regret','relax','rely','remove','repair','replace','reply','report','require','rest','review','ring','rise','roll','rub','ruin','rush','satisfy','scream','search','seem','select','separate','serve','settle','shake','shine','shout','shut','sign','skip','slide','smell','smile','sneeze','sort','sound','sow','spill','spread','squeeze','stick','stir','stretch','strike','struggle','succeed','suggest','supply','support','suppose','surprise','survive','swallow','switch','taste','tear','thank','throw','tie','touch','trade','train','transfer','translate','treat','trust','twist','type','unite','unlock','upset','value','vanish','vary','vote','wander','warn','waste','wave','weigh','whisper','wipe','wonder','wrap','yell']);
const ADJ_HINT = new Set(['big','small','tall','short','long','high','low','fast','slow','hot','cold','warm','cool','new','old','young','good','bad','happy','sad','angry','tired','hungry','thirsty','strong','weak','easy','hard','soft','loud','quiet','clean','dirty','pretty','beautiful','ugly','rich','poor','busy','free','full','empty','heavy','light','dark','bright','deep','wide','narrow','thick','thin','sweet','sour','salty','spicy','fresh','safe','dangerous','kind','nice','funny','serious','smart','clever','brave','shy','polite','rude','lazy','careful','famous','important','different','same','similar','special','common','strange','simple','difficult','possible','impossible','real','true','false','ready','sure','proud','lucky','healthy','sick','wet','dry','sharp','round','square','close','far','near','early','late','right','wrong','left','red','blue','green','yellow','black','white','pink','purple','orange','brown','gray','grey','gold','silver']);
const NUMS = new Set(['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','first','second','third','fourth','fifth']);

function posOf(w, k) {
  const lw = w.toLowerCase();
  if (NUMS.has(lw)) return 'num';
  if (VERB_HINT.has(lw)) return 'v';
  if (ADJ_HINT.has(lw)) return 'a';
  // 한국어 뜻이 «~하다/~다»로 끝나면 동사·형용사 계열
  if (/(하다|되다|시키다)$/.test(k)) return 'v';
  if (/^[가-힣]+다$/.test(k)) return ADJ_SUF.test(lw) ? 'a' : 'v';
  if (ADJ_SUF.test(lw) && !/(ity|ion|ment|ness|ance|ence|ship|hood|dom)$/.test(lw)) return 'a';
  return 'n';
}

// ── 밴드 편성 ────────────────────────────────────────────
// 🔴 «같은 뜻이 두 단어에 붙는 것»을 반드시 막는다 — 오답으로 뽑힌 단어의 뜻이 정답과 같으면
//    화면에 같은 글자가 두 개 뜨고, 아이는 맞혀도 틀린다. 늦게 나온 쪽을 버린다.
const seen = new Set();
const meanings = new Set();
const dropped = { word: 0, meaning: 0 };
function band(names) {
  const out = [];
  for (const g of names) {
    for (const e of blocks[g] || []) {
      const key = e.w.toLowerCase();
      if (!/^[a-z][a-z' -]*$/i.test(e.w) || !e.k) continue;
      if (seen.has(key)) { dropped.word++; continue; }        // 밴드 간·밴드 내 단어 중복
      if (meanings.has(e.k)) { dropped.meaning++; continue; } // 뜻 중복
      seen.add(key); meanings.add(e.k);
      out.push({ w: e.w, k: e.k, pos: posOf(e.w, e.k) });
    }
  }
  // 🔴 품사군 인원이 3 미만이면 같은 품사 오답 2개를 못 만든다 — 명사로 접는다.
  const cnt = out.reduce((a, e) => (a[e.pos] = (a[e.pos] || 0) + 1, a), {});
  for (const e of out) if (cnt[e.pos] < 3) e.pos = 'n';
  return out;
}
const g34 = band(['GRADE3', 'GRADE4']);
const g56 = band(['GRADE5', 'GRADE6']);

function emit(list, varName, title, note) {
  const byPos = list.reduce((a, e) => (a[e.pos] = (a[e.pos] || 0) + 1, a), {});
  const lines = list.map((e) => `  { w: '${e.w}', k: '${e.k.replace(/'/g, "\\'")}', pos: '${e.pos}' },`);
  return `// ${title}
// 출처·편성 원칙 = docs/data-sources.md
// 🔴 이 파일은 «생성물»이다 — 손으로 고치지 말고 \`npm run words:import\` 를 다시 돌린다.
// ${note}
// 총 ${list.length}개 (${Object.entries(byPos).map(([k, v]) => `${k} ${v}`).join(' · ')})
// w: 영단어 · k: 대표 뜻 · pos: 품사(n 명사 / v 동사 / a 형용사 / num 수사)
export const ${varName} = [
${lines.join('\n')}
];
`;
}

fs.writeFileSync('src/data/words-g34.js', emit(g34, 'WORDS_G34', '초등 3~4학년 영어 어휘', '원본 = englishdefence GRADE3+GRADE4 (자체 제작 · 저작권 클린)'));
fs.writeFileSync('src/data/words-g56.js', emit(g56, 'WORDS_G56', '초등 5~6학년 영어 어휘 (6학년은 심화·중등 준비 단계 포함)', '원본 = englishdefence GRADE5+GRADE6 (자체 제작 · 저작권 클린)'));
console.log(`g34 ${g34.length}개 · g56 ${g56.length}개 · 합계 ${g34.length + g56.length}`);
console.log(`제외: 단어중복 ${dropped.word} · 뜻중복 ${dropped.meaning}`);

// 출처 원장의 개수 선언도 같이 고친다 — 손으로 맞추면 반드시 어긋난다.
const LEDGER = 'docs/data-sources.md';
let led = fs.readFileSync(LEDGER, 'utf8');
led = led.replace(/(words-g34[^\n]*?)(\d+)\s*개/, `$1${g34.length}개`)
         .replace(/(words-g56[^\n]*?)(\d+)\s*개/, `$1${g56.length}개`);
fs.writeFileSync(LEDGER, led);
console.log('출처 원장 개수 선언 갱신');
