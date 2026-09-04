// 부트스트랩 — Phaser 게임 생성, 앱 연결, 검증 계약(window.__SMOKE__) 노출.

import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene.js';
import { App } from './app.js';
import { PHASE } from './core/game.js';

/** 유휴 씬 — 씬 왕복 누수 검사의 «반대편». 아무것도 그리지 않는다. */
class IdleScene extends Phaser.Scene {
  constructor() { super('Idle'); }
  create() { this.cameras.main.setBackgroundColor('#0e1728'); }
}

async function loadManifest() {
  const res = await fetch('./assets/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`매니페스트 로드 실패: HTTP ${res.status}`);
  const m = await res.json();
  if (!m.images || Object.keys(m.images).length === 0) throw new Error('매니페스트에 이미지가 없다');
  return m;
}

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; // @allow-math-random
}

async function boot() {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

  // 계약은 «먼저» 걸어 둔다 — 로딩이 실패해도 검증자가 그 사실을 ready 거부로 받아야 한다.
  window.__SMOKE__ = { ready, usesRng: true, hasScenes: true, sceneCount: 2 };

  try {
    const manifest = await loadManifest();
    const app = new App({ scene: null, seedFn: newSeed });
    const sceneData = () => ({
      manifest,
      theme: app.data.theme,
      skin: app.data.skin,
      reducedMotion: app.data.settings.reducedMotion,
    });

    const world = new WorldScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'world',
      backgroundColor: '#0e1728',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      scene: [world, IdleScene],
      audio: { disableWebAudio: false },
      render: { antialias: true, powerPreference: 'low-power' },
      banner: false,
    });

    game.scene.start('World', sceneData());
    await new Promise((res) => {
      const check = () => (world.ready ? res() : setTimeout(check, 30));
      check();
    });

    app.scene = world;
    app.sound.attach(world, Object.keys(manifest.audio || {}));
    app.init();

    const failedAssets = (world.loadErrors || []).filter(Boolean);
    if (failedAssets.length) {
      // 조용히 넘기면 「콘솔 0건인 채로 분홍 사각형·무음」이 된다.
      console.error(`[오르답] 에셋 로드 실패 ${failedAssets.length}건: ${failedAssets.join(', ')}`);
    }

    Object.assign(window.__SMOKE__, {
      game,
      app,
      expectedTextures: [...Object.keys(manifest.images), 'spark'],
      expectedAudio: Object.keys(manifest.audio || {}),
      seed: (n) => app.smokeSeed(n),
      step: (ms) => app.step(ms),
      hash: () => app.hash(),
      cycleScene: (i) => new Promise((res) => {
        if (i === 0) {
          game.scene.stop('World');
          game.scene.start('Idle');
        } else {
          game.scene.stop('Idle');
          game.scene.start('World', sceneData());
          app.scene = world;
          app.sound.attach(world, Object.keys(manifest.audio || {}));
        }
        setTimeout(res, 70);
      }),
      // QA 훅 — 「고쳤다」를 주장이 아니라 계측으로 증명하기 위한 것
      qa: () => ({
        phase: app.core ? app.core.phase : PHASE.IDLE,
        screen: app.screen,
        floor: app.core ? app.core.floor : 0,
        hearts: app.core ? app.core.hearts : 0,
        zombieTweens: world.zombieTweenCount ? world.zombieTweenCount() : -1,
        audio: app.sound.report(),
        loadErrors: failedAssets,
      }),
    });

    resolveReady();
  } catch (err) {
    console.error('[오르답] 부팅 실패', err);
    rejectReady(err && err.message ? err.message : String(err));
  }
}

boot();
