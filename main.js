// main.js - Advanced features: mission progression, save/load, music, larger map, improved AI, multiplayer client stub
import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/PointerLockControls.js';

// UI elements (same IDs as in index.html)
const ui = {
  startScreen: document.getElementById('startScreen'),
  pauseScreen: document.getElementById('pauseScreen'),
  gameOverScreen: document.getElementById('gameOverScreen'),
  hud: document.getElementById('hud'),
  startBtn: document.getElementById('startBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  restartBtn: document.getElementById('restartBtn'),
  againBtn: document.getElementById('againBtn'),
  enableSound: document.getElementById('enableSound'),
  hp: document.getElementById('hp'),
  scoreVal: document.getElementById('scoreVal'),
  waveVal: document.getElementById('waveVal'),
  ammoVal: document.getElementById('ammoVal'),
  magVal: document.getElementById('magVal'),
  weaponName: document.getElementById('weaponName'),
  statusVal: document.getElementById('statusVal'),
  finalScore: document.getElementById('finalScore'),
  hint: document.getElementById('hint'),
  minimap: document.getElementById('minimap')
};

// Engine globals
let scene, camera, renderer, controls, weaponGroup;
let clock = new THREE.Clock();
let audioCtx, masterGain, musicOsc;
let loopId = null;
let soundEnabled = true;
let gameRunning = false;
let gameOver = false;
let enemies = [];
let bullets = [];
let enemyBullets = [];
let medkits = [];
let moveState = { forward: false, back: false, left: false, right: false };
let ws = null; // multiplayer WebSocket (optional)

// Weapon definitions (kept short)
const weapons = [
  { name: 'Pulse Rifle', maxAmmo: 30, damage: 35, fireRate: 0.12, bulletSpeed: 80, color: 0xffdd75, pellets: 1, spread: 0.0, reloadTime: 1.1, recoil: 0.20 },
  { name: 'Scatter Shot', maxAmmo: 8, damage: 14, fireRate: 0.45, bulletSpeed: 62, color: 0xff7d5f, pellets: 6, spread: 0.15, reloadTime: 1.6, recoil: 0.30 }
];

// Persistent game state / mission progression
const missions = [
  { id: 1, title: 'Secure the Arena', description: 'Survive 3 waves of enemies.', waves: 3 },
  { id: 2, title: 'Hold the Line', description: 'Survive 5 waves. Boss appears on final wave.', waves: 5, boss: true },
  { id: 3, title: 'Extraction', description: 'Survive 8 waves and collect 3 medkits.', waves: 8 }
];
let missionIndex = 0;

const game = {
  score: 0,
  wave: 0,
  hp: 100,
  maxHp: 100,
  ammo: weapons[0].maxAmmo,
  currentWeaponIndex: 0,
  weaponCooldown: 0,
  reloadTimer: 0,
  recoil: 0,
  time: 0,
  statusText: 'Combat Ready',
  bossWave: false,
  medkitsCollected: 0
};

// --------- Audio helpers (WebAudio synths, simple) ---------
function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.22;
    // ambient music (simple pulsing oscillator)
    musicOsc = audioCtx.createOscillator();
    const musicGain = audioCtx.createGain();
    musicOsc.type = 'sine';
    musicOsc.frequency.value = 55;
    musicGain.gain.value = 0.0001; // very quiet base
    musicOsc.connect(musicGain);
    musicGain.connect(masterGain);
    musicOsc.start();
  } catch (e) {
    soundEnabled = false;
  }
}

function playTone(freq = 440, duration = 0.04, volume = 0.2, type = 'sine') {
  if (!soundEnabled || !audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// --------- Renderer / scene setup ---------
function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050a12);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 800);
  camera.position.set(0, 1.6, 40); // larger arena start distance

  const hemi = new THREE.HemisphereLight(0x9ed7ff, 0x0a1117, 0.95);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(12, 20, 8);
  scene.add(keyLight);

  // bigger arena floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 0.96, metalness: 0.14 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // bigger ring radius to match larger arena
  const ring = new THREE.Mesh(new THREE.TorusGeometry(120, 1.2, 16, 200), new THREE.MeshBasicMaterial({ color: 0x31efff, transparent: true, opacity: 0.18 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  // walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x101a2e, emissive: 0x081925, roughness: 0.8 });
  const wallPositions = [
    [0, 3.5, -140, 280, 7, 2],
    [0, 3.5, 140, 280, 7, 2],
    [-140, 3.5, 0, 280, 7, 2],
    [140, 3.5, 0, 280, 7, 2]
  ];
  wallPositions.forEach(([x, y, z, sx, sy, sz]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
  });

  // weapon model
  weaponGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0x171b22, metalness: 0.8, roughness: 0.3 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x2b323e, metalness: 0.9, roughness: 0.22 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.45, -0.08, -0.9);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.18), new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.8 }));
  grip.position.set(-0.12, -0.34, 0.15);
  weaponGroup.add(body, barrel, grip);
  camera.add(weaponGroup);
  scene.add(camera);

  controls = new PointerLockControls(camera, renderer.domElement);
  controls.getObject().position.set(0, 1.6, 40);

  document.addEventListener('click', () => {
    if (!gameRunning || gameOver) return;
    if (!controls.isLocked && !gameOver) controls.lock();
  });

  controls.addEventListener('lock', () => { ui.hint.style.display = 'block'; });
  controls.addEventListener('unlock', () => { if (gameRunning && !gameOver) ui.pauseScreen.classList.remove('hidden'); });

  window.addEventListener('resize', onResize);
}

function onResize() { if (!camera || !renderer) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }

// --------- Input ---------
function bindInput() {
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && gameRunning && !gameOver) { controls.unlock(); ui.pauseScreen.classList.remove('hidden'); }
    switch (event.code) {
      case 'KeyW': moveState.forward = true; break;
      case 'KeyS': moveState.back = true; break;
      case 'KeyA': moveState.left = true; break;
      case 'KeyD': moveState.right = true; break;
      case 'KeyR': if (gameRunning) startReload(); break;
      case 'KeyQ': if (gameRunning) switchWeapon(-1); break;
      case 'KeyE': if (gameRunning) switchWeapon(1); break;
      case 'Space': if (gameRunning && !gameOver && camera.position.y <= 1.6 + 0.05) camera.position.y += 0.1; break;
    }
  });
  document.addEventListener('keyup', (event) => { switch (event.code) { case 'KeyW': moveState.forward = false; break; case 'KeyS': moveState.back = false; break; case 'KeyA': moveState.left = false; break; case 'KeyD': moveState.right = false; break; } });
  window.addEventListener('mousedown', (event) => { if (event.button === 0 && gameRunning && !gameOver && controls.isLocked) fireWeapon(); });
}

// --------- Mission & Save/Load ---------
function saveProgress() {
  const payload = { missionIndex, gameState: game, timestamp: Date.now() };
  localStorage.setItem('neon_siege_save', JSON.stringify(payload));
  console.log('Saved progress', payload);
}
function loadProgress() {
  const raw = localStorage.getItem('neon_siege_save');
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    missionIndex = parsed.missionIndex || 0;
    Object.assign(game, parsed.gameState || {});
    console.log('Loaded progress', parsed);
    return true;
  } catch (e) { console.warn('Failed to load save', e); return false; }
}

// --------- Mission helpers ---------
function startMission(index = 0) {
  missionIndex = Math.max(0, Math.min(index, missions.length - 1));
  resetGame();
  const current = missions[missionIndex];
  // spawn required number of waves (we spawn wave-by-wave in loop)
  spawnWave();
  setStatus(`Mission: ${current.title}`);
  updateHud();
}
function completeMission() {
  setStatus('Mission Complete');
  missionIndex = Math.min(missionIndex + 1, missions.length - 1);
  saveProgress();
}

// --------- HUD / status ---------
function setStatus(text) { game.statusText = text; ui.statusVal.textContent = text; }
function updateHud() {
  ui.hp.textContent = `${Math.max(0, Math.ceil(game.hp))}`;
  ui.scoreVal.textContent = `${game.score}`;
  ui.waveVal.textContent = `${game.wave}`;
  ui.ammoVal.textContent = `${game.ammo}`;
  ui.magVal.textContent = `${weapons[game.currentWeaponIndex].maxAmmo}`;
  ui.weaponName.textContent = weapons[game.currentWeaponIndex].name;
  ui.statusVal.textContent = game.statusText;
  ui.finalScore.textContent = `${game.score}`;
  renderMinimap();
}

// --------- Gameplay core (spawn, bullets, enemies) ---------
function spawnEnemy(type = 'grunt') {
  const g = type === 'boss' ? new THREE.BoxGeometry(3.5, 3.2, 3.5) : new THREE.BoxGeometry(1.4, 2.0, 1.4);
  const mat = new THREE.MeshStandardMaterial({ color: type === 'boss' ? 0xff5f7d : 0xff4ca3, emissive: 0x2d0a12 });
  const enemy = new THREE.Mesh(g, mat);
  const angle = Math.random() * Math.PI * 2;
  const radius = 60 + Math.random() * 80; // spawn further out in big arena
  enemy.position.set(Math.cos(angle) * radius, type === 'boss' ? 1.7 : 1.0, Math.sin(angle) * radius);
  enemy.userData = { type, hp: type === 'boss' ? 520 : type === 'runner' ? 52 : 110, speed: type === 'boss' ? 1.2 : type === 'runner' ? 2.6 : 1.6, fireCooldown: type === 'boss' ? 1.1 : 1.6 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2 };
  scene.add(enemy);
  enemies.push(enemy);
}

function spawnWave() {
  game.wave += 1;
  const mission = missions[missionIndex] || missions[0];
  const targetWaves = mission.waves || 3;
  // boss wave logic if mission/boss
  const isBossWave = mission.boss && game.wave >= targetWaves;
  game.bossWave = isBossWave;
  setStatus(isBossWave ? 'Boss Wave' : 'Engaging');
  const count = isBossWave ? 1 : Math.min(8 + game.wave * 2, 40);
  for (let i = 0; i < count; i++) {
    if (isBossWave && i === 0) spawnEnemy('boss');
    else spawnEnemy(Math.random() < 0.25 ? 'runner' : 'grunt');
  }
  updateHud();
}

function spawnMedkit() {
  const kit = new THREE.Mesh(new THREE.OctahedronGeometry(0.64, 0), new THREE.MeshStandardMaterial({ color: 0x7effb2, emissive: 0x0d3c2a }));
  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 44;
  kit.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius);
  kit.userData = { bob: Math.random() * Math.PI * 2 };
  scene.add(kit);
  medkits.push(kit);
}

function fireEnemyShot(enemy) {
  const target = camera.position.clone().sub(enemy.position);
  target.y = 0;
  const dir = target.clone().normalize();
  const shot = new THREE.Mesh(new THREE.SphereGeometry(enemy.userData.type === 'boss' ? 0.3 : 0.14, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
  shot.position.copy(enemy.position).add(new THREE.Vector3(0, 0.6, 0));
  shot.userData = { velocity: dir.multiplyScalar(enemy.userData.type === 'boss' ? 22 : 28), life: 5.0 };
  scene.add(shot);
  enemyBullets.push(shot);
  playTone(enemy.userData.type === 'boss' ? 150 : 190, 0.05, 0.12, 'sawtooth');
}

function fireWeapon() {
  if (!gameRunning || game.reloadTimer > 0) return;
  const weapon = weapons[game.currentWeaponIndex];
  if (game.weaponCooldown > 0) return;
  if (game.ammo <= 0) { startReload(); return; }
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  game.weaponCooldown = weapon.fireRate; game.recoil = weapon.recoil; game.ammo -= 1; setStatus(weapon.name + ' Firing');
  playTone(weapon.name === 'Scatter Shot' ? 150 : 880, 0.04, 0.16, weapon.name === 'Scatter Shot' ? 'sawtooth' : 'square');
  for (let i = 0; i < weapon.pellets; i++) {
    const d = dir.clone(); d.x += (Math.random() - 0.5) * weapon.spread; d.y += (Math.random() - 0.5) * weapon.spread; d.normalize();
    const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: weapon.color }));
    bullet.position.copy(camera.position).add(d.clone().multiplyScalar(0.9));
    bullet.userData = { velocity: d.multiplyScalar(weapon.bulletSpeed), life: 2.0 };
    scene.add(bullet); bullets.push(bullet);
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: weapon.color, transparent: true, opacity: 0.9 }));
  const fpos = camera.position.clone().add(dir.clone().multiplyScalar(0.9)); flash.position.copy(fpos); scene.add(flash); setTimeout(() => scene.remove(flash), 90);
  if (game.ammo === 0) startReload(); updateHud();
}

function startReload() { const weapon = weapons[game.currentWeaponIndex]; if (game.reloadTimer > 0 || game.ammo >= weapon.maxAmmo) return; game.reloadTimer = weapon.reloadTime; setStatus('Reloading'); playTone(160, 0.08, 0.12, 'sawtooth'); }
function finishReload() { const weapon = weapons[game.currentWeaponIndex]; game.ammo = weapon.maxAmmo; game.reloadTimer = 0; setStatus('Combat Ready'); updateHud(); }
function switchWeapon(dir) { game.currentWeaponIndex = (game.currentWeaponIndex + dir + weapons.length) % weapons.length; game.ammo = weapons[game.currentWeaponIndex].maxAmmo; setStatus(weapons[game.currentWeaponIndex].name + ' Online'); updateHud(); }

// --------- Updates ---------
function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.position.addScaledVector(b.userData.velocity, delta); b.userData.life -= delta;
    let hit = false;
    for (const e of enemies) {
      const radius = e.userData.type === 'boss' ? 2.2 : 1.0;
      if (b.position.distanceTo(e.position) < radius) {
        e.userData.hp -= weapons[game.currentWeaponIndex].damage; playTone(420, 0.04, 0.1, 'triangle'); scene.remove(b); bullets.splice(i, 1); hit = true;
        if (e.userData.hp <= 0) { scene.remove(e); const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1); game.score += e.userData.type === 'boss' ? 400 : 18; if (Math.random() < 0.25) spawnMedkit(); }
        break;
      }
    }
    if (hit) continue; if (b.userData.life <= 0 || b.position.length() > 300) { scene.remove(b); bullets.splice(i, 1); }
  }
}

function updateEnemyBullets(delta) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const s = enemyBullets[i]; s.position.addScaledVector(s.userData.velocity, delta); s.userData.life -= delta;
    if (s.position.distanceTo(camera.position) < 1.3) { game.hp -= 12; playTone(110, 0.08, 0.22, 'square'); scene.remove(s); enemyBullets.splice(i, 1); if (game.hp <= 0) { endGame(); return; } updateHud(); continue; }
    if (s.userData.life <= 0 || s.position.length() > 400) { scene.remove(s); enemyBullets.splice(i, 1); }
  }
}

// Improved enemy AI: simple steering with wander + seek + avoid
function updateEnemies(delta) {
  const arenaRadius = 140;
  for (const e of enemies) {
    const toPlayer = camera.position.clone().sub(e.position); toPlayer.y = 0; const dist = toPlayer.length();
    // wander noise
    const wander = new THREE.Vector3(Math.sin(game.time * 0.7 + e.userData.phase), 0, Math.cos(game.time * 0.6 + e.userData.phase)).multiplyScalar(0.2);
    const steer = new THREE.Vector3();
    if (dist > 2.6) steer.add(toPlayer.clone().normalize());
    steer.add(wander);
    // avoid walls (simple keep-to-center)
    const fromCenter = e.position.clone(); fromCenter.y = 0; const centerDist = fromCenter.length(); if (centerDist > arenaRadius - 12) steer.add(fromCenter.clone().multiplyScalar(-0.01 * centerDist));
    steer.normalize(); e.position.addScaledVector(steer, e.userData.speed * delta * (e.userData.type === 'runner' ? 1.3 : 1));
    e.lookAt(camera.position.x, e.position.y, camera.position.z);
    e.userData.fireCooldown -= delta; e.position.y = e.userData.type === 'boss' ? 1.7 : 1.0 + Math.sin(game.time * 2 + e.userData.phase) * 0.08;
    if (dist < 44 && e.userData.fireCooldown <= 0) { e.userData.fireCooldown = e.userData.type === 'boss' ? 0.9 : 1.6 + Math.random() * 1.4; fireEnemyShot(e); }
  }
}

function updateMedkits(delta) {
  for (let i = medkits.length - 1; i >= 0; i--) {
    const k = medkits[i]; k.rotation.y += delta * 2.2; k.position.y = 0.9 + Math.sin(game.time * 5 + k.userData.bob) * 0.25; if (k.position.distanceTo(camera.position) < 1.7) { game.hp = Math.min(game.maxHp, game.hp + 28); playTone(640, 0.12, 0.2, 'triangle'); scene.remove(k); medkits.splice(i, 1); game.medkitsCollected = (game.medkitsCollected || 0) + 1; setStatus('Medkit Collected'); updateHud(); } }
}

function updatePlayer(delta) {
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize(); const move = new THREE.Vector3(); if (moveState.forward) move.addScaledVector(forward, -1); if (moveState.back) move.addScaledVector(forward, 1); if (moveState.left) move.addScaledVector(right, -1); if (moveState.right) move.addScaledVector(right, 1);
  if (move.lengthSq() > 0) { move.normalize(); const nextPos = controls.getObject().position.clone().addScaledVector(move, 8.2 * delta); const dist = Math.hypot(nextPos.x, nextPos.z); if (dist < 120) controls.getObject().position.copy(nextPos); }
  camera.rotation.z = Math.sin(game.time * 8) * 0.02; camera.rotation.x += (game.recoil * 0.7 - camera.rotation.x * 0.12); game.recoil *= 0.75; if (game.weaponCooldown > 0) game.weaponCooldown -= delta; if (game.reloadTimer > 0) { game.reloadTimer -= delta; if (game.reloadTimer <= 0) finishReload(); } const bob = Math.sin(game.time * 12) * 0.03; if (weaponGroup) { weaponGroup.position.set(0.48, -0.18 + bob, -0.9); weaponGroup.rotation.x = -0.24 + game.recoil * 0.9; weaponGroup.rotation.y = 0.18; } if (camera.position.y < 1.6) camera.position.y = 1.6; }

// --------- Minimap ---------
function renderMinimap() {
  const ctx = ui.minimap.getContext('2d'); ctx.clearRect(0, 0, ui.minimap.width, ui.minimap.height); ctx.fillStyle = 'rgba(5, 12, 18, 0.9)'; ctx.beginPath(); ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 6, 0, Math.PI * 2); ctx.fill(); const px = ui.minimap.width / 2 + camera.position.x * 0.6; const py = ui.minimap.height / 2 + camera.position.z * 0.6; ctx.fillStyle = '#69f4ff'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff5dd9'; for (const e of enemies) { const ex = ui.minimap.width / 2 + e.position.x * 0.6; const ey = ui.minimap.height / 2 + e.position.z * 0.6; ctx.beginPath(); ctx.arc(ex, ey, e.userData.type === 'boss' ? 5 : 3, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = 'rgba(105,244,255,0.38)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 7, 0, Math.PI * 2); ctx.stroke(); }

// --------- Save/Load + mission complete check ---------
function checkMissionProgress() {
  const mission = missions[missionIndex] || missions[0];
  if (!mission) return;
  if (game.wave >= mission.waves) {
    // if mission requires medkits, check that too
    if (mission.boss) { if (enemies.length === 0) { completeMission(); } }
    else { completeMission(); }
  }
}

function saveProgressAuto() { // save a lightweight snapshot
  const payload = { missionIndex, game: { score: game.score, wave: game.wave, hp: game.hp, ammo: game.ammo, medkitsCollected: game.medkitsCollected } };
  localStorage.setItem('neon_siege_autosave', JSON.stringify(payload)); }

// --------- Multiplayer client (lightweight stub) ---------
function startMultiplayerClient() {
  try {
    ws = new WebSocket('ws://localhost:9001/ws');
    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (m) => { /* handle simple lobby messages or sync */ };
    ws.onclose = () => console.log('WS closed');
  } catch (e) { console.warn('WS unavailable', e); }
}

// --------- Game loop ---------
function animate() {
  loopId = requestAnimationFrame(animate);
  if (!gameRunning || !renderer) return;
  const delta = Math.min(0.06, clock.getDelta());
  game.time += delta;
  updatePlayer(delta);
  updateEnemies(delta);
  updateBullets(delta);
  updateEnemyBullets(delta);
  updateMedkits(delta);
  updateHud();
  checkMissionProgress();
  saveProgressAuto();
  if (game.hp <= 0 && !gameOver) endGame();
  renderer.render(scene, camera);
}

function resetGame() {
  game.score = 0; game.wave = 0; game.hp = game.maxHp; game.ammo = weapons[game.currentWeaponIndex].maxAmmo; game.weaponCooldown = 0; game.reloadTimer = 0; game.recoil = 0; game.time = 0; game.medkitsCollected = 0; game.statusText = 'Combat Ready';
  for (const b of bullets) scene.remove(b); for (const s of enemyBullets) scene.remove(s); for (const m of medkits) scene.remove(m); for (const e of enemies) scene.remove(e); bullets = []; enemyBullets = []; medkits = []; enemies = []; updateHud(); }

function startGame() { soundEnabled = ui.enableSound.checked; if (!audioCtx) initAudio(); if (!renderer) initRenderer(); bindInput(); startMultiplayerClient(); gameRunning = true; gameOver = false; ui.startScreen.classList.add('hidden'); ui.hud.classList.remove('hidden'); resetGame(); spawnWave(); if (!loopId) loopId = requestAnimationFrame(animate); controls.lock(); }
function endGame() { gameRunning = false; gameOver = true; ui.finalScore.textContent = `${game.score}`; ui.gameOverScreen.classList.remove('hidden'); controls.unlock(); }

// UI hooks
ui.startBtn.addEventListener('click', () => { startMission(0); startGame(); });
ui.resumeBtn.addEventListener('click', () => { ui.pauseScreen.classList.add('hidden'); controls.lock(); });
ui.restartBtn.addEventListener('click', () => { ui.pauseScreen.classList.add('hidden'); resetGame(); spawnWave(); controls.lock(); });
ui.againBtn.addEventListener('click', () => { ui.gameOverScreen.classList.add('hidden'); startMission(missionIndex); startGame(); });

// Initial load state
loadProgress(); initAudio(); updateHud();
console.log('Advanced Neon Siege loaded.');
