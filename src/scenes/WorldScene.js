// Phaser 월드 — 배경·발판·캐릭터·이펙트만 그린다.
// 글자와 터치 타깃은 여기 없다(DOM 오버레이). 그래야 44px·28px·대비를 실제로 잴 수 있다.

import Phaser from 'phaser';
import { computeLayout, columns } from '../ui/layout.js';

const BG_W = 720;
const BG_H = 1280;
const SCROLL_PER_FLOOR = 46;

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  /**
   * 🔴 씬 재시작 경로가 있으므로 GameObject 를 담는 «모든» 필드를 여기서 전수 리셋한다.
   *    일부만 리셋하면 파괴된 객체에 setTexture 를 불러 캔버스 null 로 크래시한다.
   */
  init(data = {}) {
    this.manifest = data.manifest || this.manifest || { images: {}, themePlatform: {} };
    this.theme = data.theme || 'dawn';
    this.skin = data.skin || 'fox';
    this.reduced = !!data.reducedMotion;

    this.bgA = null;
    this.bgB = null;
    this.platforms = [];
    this.pastPlatform = null;
    this.char = null;
    this.shadow = null;
    this.emitterSpark = null;
    this.emitterCrack = null;
    this.trail = null;
    this.tracked = [];      // 우리가 만든 트윈 — killTweensOf 는 참조 일치만 보므로 직접 들고 있는다
    this.timers = [];       // delayedCall 핸들 — 종료 경로에서 명시 취소
    this.finished = false;
    this.scrollY = 0;
    this.targetScrollY = 0;
    this.layout = null;
    this.cols = [];
    this.branches = 2;
    this.charCol = 0;
    this.ready = false;
  }

  preload() {
    const imgs = this.manifest.images || {};
    for (const [key, meta] of Object.entries(imgs)) {
      if (!this.textures.exists(key)) this.load.image(key, `./assets/images/${meta.file}`);
    }
    const audio = this.manifest.audio || {};
    for (const [key, meta] of Object.entries(audio)) {
      if (this.cache.audio.exists(key)) continue;
      const urls = [];
      if (meta.ogg) urls.push(`./assets/audio/${meta.ogg}`);
      if (meta.m4a) urls.push(`./assets/audio/${meta.m4a}`);
      if (urls.length) this.load.audio(key, urls);
    }
    // 로더가 조용히 실패하면 「콘솔 0건인 채로 영영 무음」이 된다 — 실패를 들고 있는다.
    this.loadErrors = [];
    this.load.on('loaderror', (file) => this.loadErrors.push(file && file.key));
  }

  create() {
    this.makeParticleTexture();

    const themePlatform = this.manifest.themePlatform || {};
    const platKey = `platform-${themePlatform[this.theme] || 'stone'}`;
    const bgKey = `bg-${this.theme}`;

    this.bgA = this.add.image(0, 0, bgKey).setOrigin(0, 0);
    this.bgB = this.add.image(0, 0, bgKey).setOrigin(0, 0);

    this.pastPlatform = this.add.image(0, 0, platKey).setOrigin(0.5, 0.5).setAlpha(0.95);
    this.platforms = [0, 1, 2].map(() => this.add.image(0, 0, platKey).setOrigin(0.5, 0.5).setVisible(false));

    this.shadow = this.add.ellipse(0, 0, 60, 16, 0x000000, 0.28);
    this.char = this.add.image(0, 0, `char-${this.skin}`).setOrigin(0.5, 1);

    this.emitterSpark = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 220 }, angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: 620, quantity: 12, emitting: false, blendMode: 'ADD',
    });
    this.emitterCrack = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 150 }, angle: { min: 250, max: 290 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: 0xff8a96, lifespan: 520, quantity: 10, emitting: false,
    });

    this.applyLayout();
    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyLayout, this);
      this.stopAllMotion();
    });

    this.ready = true;
  }

  /** 파티클용 작은 텍스처는 결정론 생성이 낫다(기하학 자산) */
  makeParticleTexture() {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 7);
    g.generateTexture('spark', 16, 16);
    g.destroy();
  }

  applyLayout() {
    const w = this.scale.width;
    const h = this.scale.height;
    if (!w || !h || !this.bgA) return;
    this.layout = computeLayout(w, h);

    const scale = Math.max(w / BG_W, h / BG_H);
    for (const bg of [this.bgA, this.bgB]) bg.setScale(scale);
    this.bgH = BG_H * scale;
    this.bgX = (w - BG_W * scale) / 2;
    this.updateBackground();

    // 🔴 발판 폭은 «열 폭»에서 나온다. contentW 로 따로 계산하면 3갈래에서 열보다 넓어져 겹친다.
    const cols0 = columns(this.layout, this.branches);
    const platW = cols0[0].w * 0.98;
    for (const p of [...this.platforms, this.pastPlatform]) {
      p.setDisplaySize(platW, platW * (p.height / p.width));
    }
    this.char.setDisplaySize(this.layout.charSize, this.layout.charSize);
    this.shadow.setSize(this.layout.charSize * 0.62, this.layout.charSize * 0.18);

    this.cols = columns(this.layout, this.branches);
    this.positionRow();
    this.positionChar();
  }

  updateBackground() {
    if (!this.bgA) return;
    const off = ((this.scrollY % this.bgH) + this.bgH) % this.bgH;
    this.bgA.setPosition(this.bgX, off - this.bgH);
    this.bgB.setPosition(this.bgX, off);
  }

  /** 현재 문항의 갈래 수에 맞춰 발판 행을 세운다 */
  showRow(branches) {
    this.branches = branches;
    if (!this.layout) return;
    this.cols = columns(this.layout, branches);
    const platW = this.cols[0].w * 0.98;
    this.platforms.forEach((p, i) => {
      p.setDisplaySize(platW, platW * (p.height / p.width));
      const on = i < branches;
      p.setVisible(on).setAlpha(on ? 1 : 0).clearTint();
      if (on) {
        const c = this.cols[i];
        p.setPosition(c.cx, c.cy + this.layout.bandH * 0.30);
        p.setScale(p.scaleX * 0.86, p.scaleY * 0.86);
        this.track(this.tweens.add({
          targets: p, alpha: 1, scaleX: p.scaleX / 0.86, scaleY: p.scaleY / 0.86,
          duration: this.reduced ? 1 : 170, ease: 'Back.easeOut',
        }));
      }
    });
  }

  positionRow() {
    if (!this.layout) return;
    this.platforms.forEach((p, i) => {
      if (i < this.branches && this.cols[i]) {
        p.setPosition(this.cols[i].cx, this.cols[i].cy + this.layout.bandH * 0.30);
      }
    });
  }

  positionChar() {
    if (!this.layout || !this.char) return;
    if (this.pastPlatform) {
      const w = columns(this.layout, 2)[0].w * 0.92;
      this.pastPlatform.setDisplaySize(w, w * (this.pastPlatform.height / this.pastPlatform.width));
    }
    const cols = columns(this.layout, Math.max(1, this.branches));
    const c = cols[Math.min(this.charCol, cols.length - 1)] || { cx: this.layout.w / 2 };
    this.char.setPosition(c.cx, this.layout.charY);
    this.pastPlatform.setPosition(c.cx, this.layout.charY + this.layout.charSize * 0.14);
    this.shadow.setPosition(c.cx, this.layout.charY - 2);
  }

  /** 정답 — 고른 발판으로 뛰어오른다 */
  jumpTo(index) {
    if (!this.layout || this.finished) return;
    const col = this.cols[index] || this.cols[0];
    const targetY = col.cy + this.layout.bandH * 0.28;
    this.charCol = index;
    this.emitterSpark.setPosition(col.cx, targetY - 6);

    this.track(this.tweens.add({
      targets: [this.char, this.shadow],
      x: col.cx,
      duration: this.reduced ? 1 : 200,
      ease: 'Sine.easeInOut',
    }));
    this.track(this.tweens.add({
      targets: this.char,
      y: { value: targetY, duration: this.reduced ? 1 : 200, ease: 'Quad.easeOut' },
      scaleY: { value: this.char.scaleY * 1.08, duration: 110, yoyo: true },
      onComplete: () => {
        this.emitterSpark.explode(12);
        this.settleAfterJump(index, col);
      },
    }));
    this.track(this.tweens.add({
      targets: this.shadow, y: targetY + 4, alpha: 0.18,
      duration: this.reduced ? 1 : 200,
    }));
  }

  settleAfterJump(index, col) {
    if (this.finished || !this.layout) return;
    // 세계를 한 층 내린다 — 캐릭터는 제자리로 돌아오고 밟은 발판이 «지난 발판»이 된다.
    this.targetScrollY += SCROLL_PER_FLOOR;
    this.pastPlatform.setPosition(col.cx, this.layout.charY + this.layout.charSize * 0.14).setAlpha(0);
    this.track(this.tweens.add({ targets: this.pastPlatform, alpha: 0.95, duration: 140 }));
    this.char.setPosition(col.cx, this.layout.charY);
    this.shadow.setPosition(col.cx, this.layout.charY - 2).setAlpha(0.28);
    this.char.setScale(this.char.scaleX, Math.abs(this.char.scaleY));
    this.track(this.tweens.add({
      targets: this.char,
      scaleY: { from: this.char.scaleY * 0.86, to: this.char.scaleY },
      duration: this.reduced ? 1 : 150, ease: 'Back.easeOut',
    }));
    this.platforms.forEach((p) => p.setVisible(false));
  }

  /** 오답·시간초과 — 헛디딤 + 정답 발판 강조 */
  stumble(chosenIndex, correctIndex) {
    if (!this.layout || this.finished) return;
    const wrong = chosenIndex != null ? this.platforms[chosenIndex] : null;
    const right = this.platforms[correctIndex];
    if (wrong) {
      wrong.setTint(0xff8a96);
      this.emitterCrack.setPosition(wrong.x, wrong.y);
      this.emitterCrack.explode(10);
      this.track(this.tweens.add({
        targets: wrong, alpha: 0.25, y: wrong.y + 26,
        duration: this.reduced ? 1 : 420, ease: 'Quad.easeIn',
      }));
    }
    if (right) {
      right.clearTint();
      this.track(this.tweens.add({
        targets: right, scaleX: right.scaleX * 1.1, scaleY: right.scaleY * 1.1,
        duration: this.reduced ? 1 : 180, yoyo: true, repeat: 1,
      }));
    }
    this.track(this.tweens.add({
      targets: this.char, angle: { from: -9, to: 9 },
      duration: this.reduced ? 1 : 90, yoyo: true, repeat: 1,
      onComplete: () => { if (this.char) this.char.setAngle(0); },
    }));
    // 카메라 셰이크는 2D 한정 처방이다. reduced-motion 이면 끈다.
    if (!this.reduced) this.cameras.main.shake(130, 0.005);
  }

  /** 스트릭 축하 — 캐릭터 뒤 반짝임 */
  celebrate() {
    if (!this.char || this.finished) return;
    this.emitterSpark.setPosition(this.char.x, this.char.y - this.layout.charSize * 0.5);
    this.emitterSpark.explode(22);
  }

  setSkin(skin) {
    this.skin = skin;
    if (this.char && this.textures.exists(`char-${skin}`)) this.char.setTexture(`char-${skin}`);
    if (this.layout) this.char.setDisplaySize(this.layout.charSize, this.layout.charSize);
  }

  setTheme(theme) {
    this.theme = theme;
    const key = `bg-${theme}`;
    if (!this.textures.exists(key)) return;
    for (const bg of [this.bgA, this.bgB]) if (bg) bg.setTexture(key);
    const platKey = `platform-${(this.manifest.themePlatform || {})[theme] || 'stone'}`;
    if (this.textures.exists(platKey)) {
      for (const p of [...this.platforms, this.pastPlatform]) if (p) p.setTexture(platKey);
    }
    this.applyLayout();
  }

  /** 새 런 시작 시 시각 상태 초기화 */
  resetWorld() {
    this.stopAllMotion();
    this.finished = false;
    this.scrollY = 0;
    this.targetScrollY = 0;
    this.charCol = 0;
    this.branches = 2;
    if (!this.layout) return;
    this.platforms.forEach((p) => p.setVisible(false).clearTint().setAlpha(1));
    if (this.char) { this.char.setAngle(0).setAlpha(1); }
    if (this.pastPlatform) this.pastPlatform.setAlpha(0.95);
    this.applyLayout();
  }

  track(tween) {
    if (tween) this.tracked.push(tween);
    return tween;
  }

  /** 종료 경로 — 예약된 트윈·타이머를 «우리가 들고 있는 참조»로 명시 정리한다 */
  stopAllMotion() {
    for (const t of this.tracked) { try { t.remove(); } catch { /* 이미 정리됨 */ } }
    this.tracked = [];
    for (const t of this.timers) { try { t.remove(false); } catch { /* 이미 정리됨 */ } }
    this.timers = [];
    if (this.emitterSpark) this.emitterSpark.stop();
    if (this.emitterCrack) this.emitterCrack.stop();
  }

  /** QA 훅: 파괴된 대상을 도는 트윈 수(0이어야 한다) */
  zombieTweenCount() {
    return this.tracked.filter((t) => t.isPlaying && t.isPlaying()
      && (t.targets || []).some((o) => o && o.scene === undefined)).length;
  }

  update(time, delta) {
    // 배경 스크롤은 프레임 델타를 클램프해서 쓴다 — 숨은 탭 복귀의 거대 delta 를 여기서 막는다.
    const dt = Math.min(delta, 50);
    if (this.scrollY !== this.targetScrollY) {
      const diff = this.targetScrollY - this.scrollY;
      this.scrollY += diff * Math.min(1, dt / 140);
      if (Math.abs(this.targetScrollY - this.scrollY) < 0.4) this.scrollY = this.targetScrollY;
      this.updateBackground();
    }
  }
}
