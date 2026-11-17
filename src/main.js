// Юный Эколог — Этап 1: дорога, бегущий герой, три дорожки, управление.
// Этот файл — исходный код. Игра запускает собранный файл game.js (его делаю я).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------- Настройки (можно менять числа) ----------
const LANES = [-1.7, 0, 1.7];      // положение трёх дорожек по ширине
const TILE_LEN = 24;               // длина одного куска дороги
const TILE_COUNT = 5;              // сколько кусков дороги одновременно
const ROAD_HALF = 2.7;             // половина ширины дороги
const FENCE_X = 2.95;              // где стоят заборы
const HERO_HEIGHT = 1.7;           // рост героя в мире игры
const SPEED_START = 9;             // стартовая скорость
const SPEED_MAX = 16;              // максимальная скорость
const SPEED_GROWTH = 0.12;         // на сколько растёт скорость за секунду
const SKY = 0xbfe6f5;

const params = new URLSearchParams(location.search);
const HERO_NAME = params.get('hero') || 'Ranger'; // для проверки: ?hero=Knight
const SHOW_DEBUG = params.get('debug') !== '0';   // ?debug=0 скрывает счётчик FPS

const $ = (id) => document.getElementById(id);

// ---------- Сцена ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Чёткость картинки: ограничиваем и общее число пикселей, и автоматически снижаем, если FPS низкий
const MAX_PIXELS = 1300000;   // не рисуем больше ~1,3 млн пикселей (хватает для чёткой картинки)
const MIN_QUALITY = 0.5;      // ниже этой чёткости не опускаемся
let quality = 1;              // 1 = лучшая чёткость, снижается сама
function applyPixelRatio() {
  const w = window.innerWidth, h = window.innerHeight;
  const byScreen = Math.min(window.devicePixelRatio || 1, 1.75);
  const byBudget = Math.sqrt(MAX_PIXELS / (w * h));
  renderer.setPixelRatio(Math.min(byScreen, byBudget) * quality);
}
renderer.shadowMap.enabled = false;                                    // настоящих теней нет

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 95);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8fbf7a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-4, 10, 6);
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  applyPixelRatio();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = 70;
  // Подбираем расстояние камеры, чтобы три дорожки и заборы помещались и на узком, и на широком экране
  const tanHalfH = Math.tan(THREE.MathUtils.degToRad(35)) * camera.aspect;
  // Расстояние почти одинаковое на всех экранах, чтобы скорость выглядела одинаково
  const dist = THREE.MathUtils.clamp(3.4 / tanHalfH, 10, 11);
  camera.position.set(0, 2.6 + dist * 0.35, dist);
  camera.lookAt(0, 1.0, -6);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- Дорога из простых фигур ----------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const coneGeo = new THREE.ConeGeometry(1, 1, 6);
const lambert = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

const matRoad = lambert(0xd9bd8a);
const matGrass = lambert(0x7cc45a);
const matDash = lambert(0xfff4d6);
const matWood = lambert(0x9a6a40);
const matTrunk = lambert(0x7a5230);
const matCrown = lambert(0xffffff); // цвет задаётся для каждого дерева отдельно

// Много одинаковых предметов рисуются «одним махом» — так телефону легче
function instanced(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const d = new THREE.Object3D();
  items.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z);
    d.scale.set(it.sx, it.sy, it.sz);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (it.color) mesh.setColorAt(i, new THREE.Color(it.color));
  });
  mesh.frustumCulled = false;
  return mesh;
}

function buildTile() {
  const g = new THREE.Group(); // кусок занимает z от -TILE_LEN до 0
  const road = new THREE.Mesh(boxGeo, matRoad);
  road.scale.set(ROAD_HALF * 2, 0.2, TILE_LEN);
  road.position.set(0, -0.1, -TILE_LEN / 2);
  g.add(road);

  const grass = new THREE.Mesh(boxGeo, matGrass);
  grass.scale.set(70, 0.2, TILE_LEN);
  grass.position.set(0, -0.14, -TILE_LEN / 2);
  g.add(grass);

  const dashes = [], posts = [], rails = [], trunks = [], crowns = [];
  for (let k = 0; k < 6; k++) {
    const z = -2 - 4 * k;
    for (const x of [-0.85, 0.85]) dashes.push({ x, y: 0.01, z, sx: 0.12, sy: 0.02, sz: 2 });
    for (const x of [-FENCE_X, FENCE_X]) posts.push({ x, y: 0.45, z, sx: 0.25, sy: 0.9, sz: 0.25 });
  }
  for (const x of [-FENCE_X, FENCE_X]) {
    for (const y of [0.65, 0.3]) rails.push({ x, y, z: -TILE_LEN / 2, sx: 0.1, sy: 0.12, sz: TILE_LEN });
  }
  const crownColors = [0x3f9e4a, 0x55b85a, 0x2f8a52];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (5 + Math.random() * 5);
      const z = -2 - Math.random() * (TILE_LEN - 4);
      const s = 0.8 + Math.random() * 0.8;
      const h = 1.2 * s;
      trunks.push({ x, y: h / 2, z, sx: 0.25 * s, sy: h, sz: 0.25 * s });
      crowns.push({ x, y: h + 1.2 * s, z, sx: 1.2 * s, sy: 2.6 * s, sz: 1.2 * s,
                    color: crownColors[Math.floor(Math.random() * crownColors.length)] });
    }
  }
  g.add(instanced(boxGeo, matDash, dashes));
  g.add(instanced(boxGeo, matWood, posts));
  g.add(instanced(boxGeo, matWood, rails));
  g.add(instanced(cylGeo, matTrunk, trunks));
  g.add(instanced(coneGeo, matCrown, crowns));
  return g;
}

const tiles = [];
for (let i = 0; i < TILE_COUNT; i++) {
  const t = buildTile();
  t.position.z = -i * TILE_LEN + TILE_LEN; // первый кусок под героем и камерой
  scene.add(t);
  tiles.push(t);
}

// ---------- Герой ----------
const hero = new THREE.Group();
hero.rotation.y = Math.PI; // модель смотрит «на нас», поворачиваем спиной к камере
scene.add(hero);
let mixer = null;

// ---------- Управление ----------
let laneIndex = 1;      // 0 — левая, 1 — средняя, 2 — правая
function moveLane(dir) {
  laneIndex = THREE.MathUtils.clamp(laneIndex + dir, 0, 2);
  hideHint();
}

let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $('hint').style.opacity = '0';
}
setTimeout(hideHint, 8000);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.code === 'KeyA') moveLane(-1);
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.code === 'KeyD') moveLane(1);
  else return;
  e.preventDefault();
});

// Свайп и касание левой/правой половины (работает и мышью)
let startX = 0, startY = 0, swiped = false, pointerDown = false;
const SWIPE_MIN = 24; // пикселей
canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true; swiped = false; startX = e.clientX; startY = e.clientY;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointerDown || swiped) return;
  const dx = e.clientX - startX, dy = e.clientY - startY;
  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
    swiped = true;
    moveLane(dx > 0 ? 1 : -1);
  }
});
function endPointer(e) {
  if (!pointerDown) return;
  pointerDown = false;
  if (!swiped && e.type === 'pointerup') {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) {
      moveLane(e.clientX < window.innerWidth / 2 ? -1 : 1);
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Запрет прокрутки и увеличения во время игры (особенно для iPhone)
const stop = (e) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('gesturestart', stop);
document.addEventListener('gesturechange', stop);
document.addEventListener('dblclick', stop);
document.addEventListener('contextmenu', stop);

// ---------- Главный цикл ----------
let speed = SPEED_START;
let heroX = 0;
const clock = new THREE.Clock();
let fpsTime = 0, fpsFrames = 0;
let lowFpsTime = 0, adaptTime = 0, adaptFrames = 0;
const debugEl = $('debug');
if (!SHOW_DEBUG) debugEl.style.display = 'none';

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1); // защита от «скачка» после паузы

  speed = Math.min(SPEED_MAX, speed + SPEED_GROWTH * dt);

  // Дорога едет навстречу герою
  const wrap = TILE_COUNT * TILE_LEN;
  for (const t of tiles) {
    t.position.z += speed * dt;
    if (t.position.z - TILE_LEN > 14) t.position.z -= wrap;
  }

  // Плавный переход между дорожками
  const targetX = LANES[laneIndex];
  const diff = targetX - heroX;
  heroX += diff * Math.min(1, 12 * dt);
  hero.position.x = heroX;
  hero.rotation.y = Math.PI - diff * 0.25; // немного поворачивается в сторону движения
  hero.rotation.z = -diff * 0.06;

  if (mixer) {
    mixer.timeScale = speed / 10;
    mixer.update(dt);
  }

  renderer.render(scene, camera);

  // Если FPS ниже 40 больше секунды подряд — снижаем чёткость на 15%
  adaptTime += dt; adaptFrames++;
  if (adaptTime >= 1) {
    const f = adaptFrames / adaptTime;
    adaptTime = 0; adaptFrames = 0;
    if (f < 40 && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality * 0.85);
      resize();
    }
  }

  if (SHOW_DEBUG) {
    fpsTime += dt; fpsFrames++;
    if (fpsTime >= 0.5) {
      const fps = Math.round(fpsFrames / fpsTime);
      debugEl.textContent = `FPS ${fps}\nчёткость ${Math.round(quality * 100)}%`;
      fpsTime = 0; fpsFrames = 0;
    }
  }
}

// ---------- Загрузка героя ----------
function showError(text) {
  const box = $('loading');
  box.classList.add('error');
  box.innerHTML = `<h1>Ой, не загрузилось</h1><p>${text}</p>`;
}

async function init() {
  if (location.protocol === 'file:') {
    showError('Откройте игру по ссылке (из интернета), а не двойным щелчком по файлу.');
    return;
  }
  try {
    const loader = new GLTFLoader();
    const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
    const [heroGltf, general, movement] = await Promise.all([
      load(`assets/heroes/${HERO_NAME}.glb`),
      load('assets/anim/Rig_Medium_General.glb'),
      load('assets/anim/Rig_Medium_MovementBasic.glb'),
    ]);

    const model = heroGltf.scene;
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    // Приводим героя к нужному росту и ставим ногами на дорогу
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const k = h > 0.1 ? HERO_HEIGHT / h : 1;
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    hero.add(model);

    const clips = [...movement.animations, ...general.animations];
    const runClip = clips.find((c) => c.name === 'Running_A') || clips.find((c) => c.name === 'Running_B');
    mixer = new THREE.AnimationMixer(model);
    if (runClip) mixer.clipAction(runClip).play();

    $('loading').style.display = 'none';
    clock.getDelta();
    frame();
  } catch (err) {
    console.error(err);
    showError('Проверьте интернет и обновите страницу.');
  }
}
init();
