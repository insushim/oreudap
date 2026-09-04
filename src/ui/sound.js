// 사운드 — 오프라인 렌더된 파일을 Phaser 로더로 싣고 Phaser 사운드 매니저로 재생한다.
//
// 🔴 왜 Phaser 로더인가: 「파일이 서빙된다」와 「그 시점에 캐시에 디코드돼 있다」는 다른 명제다.
//    Phaser 캐시에 실어야 스모크가 «디코드 N/M» 을 셀 수 있고, 그래야 배포 후 무음(1순위 버그)을
//    기계가 잡는다. 직접 WebAudio 로 디코드하면 그 검사가 통째로 불가능해진다.
// 🔴 첫 사용자 입력에서 컨텍스트를 언락하지 않으면 소리가 안 난다.

export class Sound {
  /**
   * @param {() => boolean} enabledFn 설정에서 소리가 켜져 있는가
   * @param {Phaser.Scene} scene
   * @param {string[]} keys 실렸어야 하는 키(모수)
   */
  constructor(enabledFn, scene, keys) {
    this.enabledFn = enabledFn || (() => true);
    this.scene = scene || null;
    this.keys = keys || [];
    this.unlocked = false;
    this.failed = [];
  }

  attach(scene, keys) {
    // 🔴 참조만 버리면 «전역 사운드 매니저에서 계속 울리는» BGM 이 남아 중첩된다.
    //    먼저 멈추고 파괴한 뒤에 참조를 버린다.
    try {
      if (this.bgm) { this.bgm.stop(); this.bgm.destroy(); }
    } catch { /* 이미 파괴됨 */ }
    this.bgm = null;
    this.scene = scene;
    if (keys) this.keys = keys;
    this.unlocked = false;
  }

  unlock() {
    if (!this.scene || this.unlocked) return;
    const mgr = this.scene.sound;
    try {
      if (mgr && mgr.locked && typeof mgr.unlock === 'function') mgr.unlock();
      if (mgr && mgr.context && mgr.context.state === 'suspended') mgr.context.resume();
      this.unlocked = true;
    } catch (e) {
      this.failed.push(`unlock: ${e && e.message}`);
    }
  }

  play(name, volume = 0.65) {
    if (!this.enabledFn() || !this.scene) return false;
    this.unlock();
    try {
      if (!this.scene.cache.audio.exists(name)) return false;
      this.scene.sound.play(name, { volume });
      return true;
    } catch (e) {
      this.failed.push(`${name}: ${e && e.message}`);
      return false;
    }
  }

  /** 배경음 — 루프. 설정에서 소리를 끄면 즉시 멈춘다. */
  startBgm(volume = 0.22) {
    if (!this.scene || !this.enabledFn()) return false;
    this.unlock();
    try {
      if (!this.scene.cache.audio.exists('bgm')) return false;
      if (this.bgm && this.bgm.pendingRemove) this.bgm = null;
      if (this.bgm && this.bgm.isPlaying) return true;
      if (!this.bgm) this.bgm = this.scene.sound.add('bgm', { loop: true, volume });
      this.bgm.play();
      return true;
    } catch (e) {
      this.failed.push(`bgm: ${e && e.message}`);
      return false;
    }
  }

  stopBgm() {
    try { if (this.bgm && this.bgm.isPlaying) this.bgm.stop(); } catch { /* 이미 정리됨 */ }
  }

  /** 설정 변경 반영 */
  syncEnabled() {
    if (!this.enabledFn()) this.stopBgm();
  }

  /** QA 훅 — 무엇이 실렸어야 하고 실제로 몇 개가 디코드됐는가 */
  report() {
    const cache = this.scene ? this.scene.cache.audio : null;
    const decoded = cache ? this.keys.filter((k) => cache.exists(k)).length : 0;
    return { expected: this.keys.length, decoded, failed: this.failed.slice() };
  }
}
