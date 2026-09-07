// 낱말 발음 — 영어 문제에서 «귀로도» 만나게 한다.
//
// 🔴 두 경로를 쓴다. ① 파일(EchoTale 에서 가져온 원어민급 TTS, 943개) ② 브라우저 음성
//    (speechSynthesis, 파일 없는 264개). 하나로 통일하지 못한 이유는 원본 코퍼스에 없는
//    낱말이 264개 있어서다 — 그 낱말들을 «소리 없이» 두면 아이 입장에선 그냥 고장이다.
// 🔴 파일은 미리 받지 않는다. 943개 3.8MB 를 preload 하면 첫 문제까지 전송량이 두 배가 된다.
//    낱말 하나는 4KB 라 그때그때 받아도 늦지 않고, 다음 문제 것은 미리 받아 둔다.
// 🔴 Audio 객체를 매번 새로 만들지 않는다 — 모바일에서 재생 인스턴스가 쌓이면 소리가 겹친다.

const DIR = './assets/say';

export class Say {
  /**
   * @param {() => boolean} enabledFn 설정에서 소리가 켜져 있는가
   * @param {Set<string>} haveFiles 파일이 있는 낱말(소문자)
   */
  constructor(enabledFn, haveFiles) {
    this.enabledFn = enabledFn || (() => true);
    this.have = haveFiles || new Set();
    this.cache = new Map();     // 낱말 → HTMLAudioElement
    this.el = null;             // 지금 울리는 것
    this.lastSpoken = null;     // QA 훅
    this.failed = [];
  }

  has(word) { return this.have.has(String(word).toLowerCase()); }

  /** 다음 문제 낱말을 미리 받아 둔다 — 첫 재생이 끊기지 않게 */
  prefetch(word) {
    if (!word || !this.has(word)) return;
    const k = String(word).toLowerCase();
    if (this.cache.has(k)) return;
    try {
      const a = new Audio(`${DIR}/${k}.m4a`);
      a.preload = 'auto';
      this.cache.set(k, a);
    } catch (e) { this.failed.push(`prefetch ${k}: ${e && e.message}`); }
  }

  /**
   * @param {string} word 읽을 말
   * @param {'en'|'ko'} [lang] 어느 말로 읽는가. 🔴 기본이 영어인 이유는 파일 943개가 전부 영어라서다 —
   *        국어 어휘는 파일이 없으므로 «파일 경로 자체를 타면 안 된다». 소문자화한 한글 낱말이
   *        우연히 영어 파일 이름과 겹칠 일은 없지만, 겹치지 않는다는 것에 기대는 대신 길을 나눈다.
   * @returns {'file'|'tts'|'off'|'fail'} 어느 경로로 읽었는가
   */
  speak(word, lang = 'en') {
    if (!this.enabledFn() || !word) return 'off';
    const k = String(word).toLowerCase();
    this.stop();
    if (lang === 'en' && this.has(k)) {
      try {
        let a = this.cache.get(k);
        if (!a) { a = new Audio(`${DIR}/${k}.m4a`); this.cache.set(k, a); }
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch((e) => this.failed.push(`play ${k}: ${e && e.message}`));
        this.el = a;
        this.lastSpoken = { word: k, via: 'file' };
        return 'file';
      } catch (e) { this.failed.push(`file ${k}: ${e && e.message}`); }
    }
    // 파일이 없는 낱말 — 브라우저가 읽는다. 목소리는 다르지만 «소리가 없는» 것보다 낫다.
    try {
      const synth = window.speechSynthesis;
      if (!synth) return 'fail';
      const u = new SpeechSynthesisUtterance(word);
      u.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
      u.rate = 0.85;          // 아이가 따라 할 수 있는 속도
      synth.cancel();
      synth.speak(u);
      this.lastSpoken = { word: k, via: 'tts', lang };
      return 'tts';
    } catch (e) {
      this.failed.push(`tts ${k}: ${e && e.message}`);
      return 'fail';
    }
  }

  stop() {
    try { if (this.el) { this.el.pause(); this.el.currentTime = 0; } } catch { /* 이미 정리됨 */ }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* 미지원 */ }
    this.el = null;
  }

  /** QA 훅 */
  report() {
    return { files: this.have.size, cached: this.cache.size, last: this.lastSpoken, failed: this.failed.slice() };
  }
}
