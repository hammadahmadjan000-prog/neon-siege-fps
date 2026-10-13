import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/PointerLockControls.js';

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

let scene, camera, renderer, controls, weaponGroup;
let clock = new THREE.Clock();
let loopId = null;
let audioCtx, masterGain;
let soundEnabled = true;
let gameRunning = false;
let gameOver = false;
let enemies = [];
let bullets = [];
let enemyBullets = [];
let medkits = [];
let moveState = { forward: false, back: false, left: false, right: false };

const weapons = [
  {
    name: 'Pulse Rifle',
    maxAmmo: 30,
    damage: 35,
    fireRate: 0.12,
    bulletSpeed: 80,
    color: 0xffdd75,
    pellets: 1,
    spread: 0.0,
    reloadTime: 1.1,
    recoil: 0.20
  },
  {
    name: 'Scatter Shot',
    maxAmmo: 8,
    damage: 14,
    fireRate: 0.45,
    bulletSpeed: 62,
    color: 0xff7d5f,
    pellets: 6,
    spread: 0.15,
    reloadTime: 1.6,
    recoil: 0.30
  }
];

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
  bossWave: false
};

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.22;
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

function initRenderer() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050a12);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(0, 1.6, 18);

  const hemi = new THREE.HemisphereLight(0x9ed7ff, 0x0a1117, 0.95);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.position.set(8, 12, 6);
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 0.96, metalness: 0.14 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(29, 0.75, 16, 96),
    new THREE.MeshBasicMaterial({ color: 0x31efff, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  scene.add(ring);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x101a2e, emissive: 0x081925, roughness: 0.8 });
  const walls = [
    [0, 2.5, -30, 62, 5, 2],
    [0, 2.5, 30, 62, 5, 2],
    [-30, 2.5, 0, 62, 5, 2],
    [30, 2.5, 0, 62, 5, 2]
  ];
  walls.forEach(([x, y, z, sx, sy, sz]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
  });

  weaponGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x171b22, metalness: 0.8, roughness: 0.3 })
  );
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x2b323e, metalness: 0.9, roughness: 0.22 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.45, -0.08, -0.9);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.42, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.8 })
  );
  grip.position.set(-0.12, -0.34, 0.15);
  weaponGroup.add(body, barrel, grip);
  camera.add(weaponGroup);
  scene.add(camera);

  controls = new PointerLockControls(camera, renderer.domElement);
  controls.getObject().position.set(0, 1.6, 18);

  document.addEventListener('click', () => {
    if (!gameRunning || gameOver) return;
    if (!controls.isLocked && !gameOver) controls.lock();
  });

  controls.addEventListener('lock', () => {
    ui.hint.style.display = 'block';
  });

  controls.addEventListener('unlock', () => {
    if (gameRunning && !gameOver) ui.pauseScreen.classList.remove('hidden');
  });

  window.addEventListener('resize', handleResize);
}

function handleResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindInput() {
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && gameRunning && !gameOver) {
      controls.unlock();
      ui.pauseScreen.classList.remove('hidden');
    }

    switch (event.code) {
      case 'KeyW': moveState.forward = true; break;
      case 'KeyS': moveState.back = true; break;
      case 'KeyA': moveState.left = true; break;
      case 'KeyD': moveState.right = true; break;
      case 'KeyR': if (gameRunning) startReload(); break;
      case 'KeyQ': if (gameRunning) switchWeapon(-1); break;
      case 'KeyE': if (gameRunning) switchWeapon(1); break;
      case 'Space':
        if (gameRunning && !gameOver && camera.position.y <= 1.6 + 0.05) {
          camera.position.y += 0.1;
        }
        break;
    }
  });

  document.addEventListener('keyup', (event) => {
    switch (event.code) {
      case 'KeyW': moveState.forward = false; break;
      case 'KeyS': moveState.back = false; break;
      case 'KeyA': moveState.left = false; break;
      case 'KeyD': moveState.right = false; break;
    }
  });

  window.addEventListener('mousedown', (event) => {
    if (event.button === 0 && gameRunning && !gameOver && controls.isLocked) {
      fireWeapon();
    }
  });
}

function setStatus(text) {
  game.statusText = text;
  ui.statusVal.textContent = text;
}

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

function resetGame() {
  game.score = 0;
  game.wave = 0;
  game.hp = game.maxHp;
  game.ammo = weapons[game.currentWeaponIndex].maxAmmo;
  game.weaponCooldown = 0;
  game.reloadTimer = 0;
  game.recoil = 0;
  game.statusText = 'Combat Ready';
  game.bossWave = false;

  for (const b of bullets) scene.remove(b);
  for (const s of enemyBullets) scene.remove(s);
  for (const k of medkits) scene.remove(k);
  for (const e of enemies) scene.remove(e);
  bullets = [];
  enemyBullets = [];
  medkits = [];
  enemies = [];

  camera.position.set(0, 1.6, 18);
  camera.rotation.set(0, 0, 0);
  controls.getObject().position.copy(camera.position);
  updateHud();
}

function startGame() {
  soundEnabled = ui.enableSound.checked;
  if (!audioCtx) initAudio();
  if (!renderer) initRenderer();

  gameRunning = true;
  gameOver = false;
  ui.startScreen.classList.add('hidden');
  ui.pauseScreen.classList.add('hidden');
  ui.gameOverScreen.classList.add('hidden');
  ui.hud.classList.remove('hidden');

  resetGame();
  spawnWave();
  controls.lock();
  if (!loopId) loopId = requestAnimationFrame(animate);
}

function endGame() {
  gameRunning = false;
  gameOver = true;
  setStatus('Mission Failed');
  ui.finalScore.textContent = `${game.score}`;
  ui.gameOverScreen.classList.remove('hidden');
  controls.unlock();
}

function startReload() {
  const weapon = weapons[game.currentWeaponIndex];
  if (game.reloadTimer > 0 || game.ammo >= weapon.maxAmmo || !gameRunning || gameOver) return;
  game.reloadTimer = weapon.reloadTime;
  setStatus('Reloading');
  playTone(180, 0.09, 0.12, 'sawtooth');
}

function finishReload() {
  const weapon = weapons[game.currentWeaponIndex];
  game.ammo = weapon.maxAmmo;
  game.reloadTimer = 0;
  setStatus('Combat Ready');
  updateHud();
}

function switchWeapon(direction) {
  if (game.reloadTimer > 0 || !gameRunning || gameOver) return;
  game.currentWeaponIndex = (game.currentWeaponIndex + direction + weapons.length) % weapons.length;
  const weapon = weapons[game.currentWeaponIndex];
  game.ammo = weapon.maxAmmo;
  setStatus(weapon.name + ' Online');
  updateHud();
}

function fireWeapon() {
  if (!gameRunning || gameOver || game.reloadTimer > 0) return;
  const weapon = weapons[game.currentWeaponIndex];
  if (game.weaponCooldown > 0) return;
  if (game.ammo <= 0) {
    startReload();
    return;
  }

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const baseSpread = weapon.spread;

  game.weaponCooldown = weapon.fireRate;
  game.recoil = weapon.recoil;
  game.ammo -= 1;
  setStatus(weapon.name + ' Firing');
  playTone(weapon.name === 'Scatter Shot' ? 150 : 1000, 0.04, 0.18, weapon.name === 'Scatter Shot' ? 'sawtooth' : 'square');

  const pellets = [];
  for (let i = 0; i < weapon.pellets; i++) {
    const spreadDir = dir.clone();
    spreadDir.x += (Math.random() - 0.5) * baseSpread;
    spreadDir.y += (Math.random() - 0.5) * baseSpread;
    spreadDir.z += (Math.random() - 0.5) * baseSpread;
    spreadDir.normalize();
    pellets.push(spreadDir);
  }

  for (const spreadDir of pellets) {
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: weapon.color })
    );
    const spawnPos = camera.position.clone().add(spreadDir.clone().multiplyScalar(0.8));
    bullet.position.copy(spawnPos);
    bullet.userData = { velocity: spreadDir.clone().multiplyScalar(weapon.bulletSpeed), life: 1.6 };
    scene.add(bullet);
    bullets.push(bullet);
  }

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: weapon.color, transparent: true, opacity: 0.9 })
  );
  flash.position.copy(camera.position).add(dir.clone().multiplyScalar(0.9));
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 70);

  if (game.ammo === 0) startReload();
  updateHud();
}

function spawnEnemy(type = 'grunt') {
  const enemy = new THREE.Mesh(
    type === 'boss'
      ? new THREE.BoxGeometry(2.2, 2.8, 2.2)
      : new THREE.BoxGeometry(1.2, 1.8, 1.2),
    new THREE.MeshStandardMaterial({
      color: type === 'boss' ? 0xff5f7d : type === 'runner' ? 0xffc86a : 0xff4ca3,
      emissive: type === 'boss' ? 0x360b15 : 0x2c0b16,
      metalness: 0.22,
      roughness: 0.5
    })
  );

  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 12;
  enemy.position.set(Math.cos(angle) * radius, type === 'boss' ? 1.4 : 0.9, Math.sin(angle) * radius);
  enemy.userData = {
    type,
    hp: type === 'boss' ? 230 : type === 'runner' ? 42 : 75,
    speed: type === 'boss' ? 1.1 : type === 'runner' ? 2.4 : 1.5,
    fireCooldown: type === 'boss' ? 0.9 : 1.6 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2
  };

  scene.add(enemy);
  enemies.push(enemy);
}

function spawnWave() {
  game.wave += 1;
  game.bossWave = game.wave % 5 === 0;
  const count = game.bossWave ? 1 : Math.min(8 + game.wave * 2, 20);
  setStatus(game.bossWave ? 'Boss Wave' : 'Engaging');

  for (let i = 0; i < count; i++) {
    if (game.bossWave && i === 0) spawnEnemy('boss');
    else {
      const type = Math.random() < 0.25 ? 'runner' : 'grunt';
      spawnEnemy(type);
    }
  }
  updateHud();
}

function spawnMedkit() {
  const kit = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.56, 0),
    new THREE.MeshStandardMaterial({ color: 0x7effb2, emissive: 0x0d3c2a, metalness: 0.2, roughness: 0.35 })
  );
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 12;
  kit.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius);
  kit.userData = { bob: Math.random() * Math.PI * 2 };
  scene.add(kit);
  medkits.push(kit);
}

function fireEnemyShot(enemy) {
  const target = camera.position.clone().sub(enemy.position);
  target.y = 0;
  const dir = target.clone().normalize();
  const shot = new THREE.Mesh(
    new THREE.SphereGeometry(enemy.userData.type === 'boss' ? 0.18 : 0.12, 10, 10),
    new THREE.MeshBasicMaterial({ color: enemy.userData.type === 'boss' ? 0xff7d7d : 0xff4d4d })
  );
  shot.position.copy(enemy.position).add(new THREE.Vector3(0, 0.5, 0));
  shot.userData = { velocity: dir.multiplyScalar(enemy.userData.type === 'boss' ? 18 : 24), life: enemy.userData.type === 'boss' ? 4.5 : 3.2 };
  scene.add(shot);
  enemyBullets.push(shot);
  playTone(enemy.userData.type === 'boss' ? 150 : 190, 0.05, 0.12, 'sawtooth');
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.life -= delta;

    let hit = false;
    for (const enemy of enemies) {
      if (bullet.position.distanceTo(enemy.position) < (enemy.userData.type === 'boss' ? 1.9 : 1.0)) {
        enemy.userData.hp -= weapons[game.currentWeaponIndex].damage;
        scene.remove(bullet);
        bullets.splice(i, 1);
        hit = true;
        playTone(360, 0.05, 0.1, 'triangle');

        if (enemy.userData.hp <= 0) {
          scene.remove(enemy);
          const idx = enemies.indexOf(enemy);
          if (idx >= 0) enemies.splice(idx, 1);
          game.score += enemy.userData.type === 'boss' ? 200 : 12;
          if (Math.random() < 0.18) spawnMedkit();
          if (enemies.length === 0) spawnWave();
        }
        break;
      }
    }

    if (hit) continue;
    if (bullet.userData.life <= 0 || bullet.position.length() > 90) {
      scene.remove(bullet);
      bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(delta) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const shot = enemyBullets[i];
    shot.position.addScaledVector(shot.userData.velocity, delta);
    shot.userData.life -= delta;

    if (shot.position.distanceTo(camera.position) < 1.2) {
      game.hp -= 12;
      playTone(120, 0.08, 0.2, 'square');
      scene.remove(shot);
      enemyBullets.splice(i, 1);
      if (game.hp <= 0) {
        game.hp = 0;
        updateHud();
        endGame();
        return;
      }
      updateHud();
      continue;
    }

    if (shot.userData.life <= 0 || shot.position.length() > 100) {
      scene.remove(shot);
      enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const toPlayer = camera.position.clone().sub(enemy.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (dist > 0.001) {
      toPlayer.normalize();
      enemy.position.addScaledVector(toPlayer, enemy.userData.speed * delta * (enemy.userData.type === 'runner' ? 1.25 : 1));
    }

    enemy.userData.fireCooldown -= delta;
    enemy.position.y = enemy.userData.type === 'boss' ? 1.4 : 0.9 + Math.sin(game.time * 3 + enemy.userData.phase) * 0.08;
    enemy.lookAt(camera.position.x, camera.position.y, camera.position.z);

    if (dist < 20 && enemy.userData.fireCooldown <= 0) {
      enemy.userData.fireCooldown = enemy.userData.type === 'boss' ? 0.9 : 1.8 + Math.random() * 1.4;
      fireEnemyShot(enemy);
    }
  }
}

function updateMedkits(delta) {
  for (let i = medkits.length - 1; i >= 0; i--) {
    const kit = medkits[i];
    kit.rotation.y += delta * 2.2;
    kit.position.y = 0.8 + Math.sin(game.time * 5 + kit.userData.bob) * 0.25;

    if (kit.position.distanceTo(camera.position) < 1.5) {
      game.hp = Math.min(game.maxHp, game.hp + 22);
      playTone(640, 0.12, 0.2, 'triangle');
      scene.remove(kit);
      medkits.splice(i, 1);
      setStatus('Medkit Collected');
      updateHud();
    }
  }
}

function updatePlayer(delta) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const move = new THREE.Vector3();
  if (moveState.forward) move.addScaledVector(forward, -1);
  if (moveState.back) move.addScaledVector(forward, 1);
  if (moveState.left) move.addScaledVector(right, -1);
  if (moveState.right) move.addScaledVector(right, 1);

  if (move.lengthSq() > 0) {
    move.normalize();
    const nextPos = controls.getObject().position.clone().addScaledVector(move, 6.3 * delta);
    const dist = Math.hypot(nextPos.x, nextPos.z);
    if (dist < 28) controls.getObject().position.copy(nextPos);
  }

  camera.rotation.z = Math.sin(game.time * 10) * 0.02;
  camera.rotation.x += (game.recoil * 0.7 - camera.rotation.x * 0.12);
  game.recoil *= 0.7;
  game.recoil = Math.max(0, game.recoil);

  if (game.weaponCooldown > 0) game.weaponCooldown -= delta;
  if (game.reloadTimer > 0) {
    game.reloadTimer -= delta;
    if (game.reloadTimer <= 0) finishReload();
  }

  const bob = Math.sin(game.time * 12) * 0.03;
  if (weaponGroup) {
    weaponGroup.position.set(0.48, -0.18 + bob, -0.8);
    weaponGroup.rotation.x = -0.24 + game.recoil * 0.9;
    weaponGroup.rotation.y = 0.18;
  }

  if (camera.position.y < 1.6) camera.position.y = 1.6;
}

function renderMinimap() {
  const ctx = ui.minimap.getContext('2d');
  ctx.clearRect(0, 0, ui.minimap.width, ui.minimap.height);

  ctx.fillStyle = 'rgba(5, 12, 18, 0.9)';
  ctx.beginPath();
  ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 6, 0, Math.PI * 2);
  ctx.fill();

  const px = ui.minimap.width / 2 + camera.position.x * 2.2;
  const py = ui.minimap.height / 2 + camera.position.z * 2.2;
  ctx.fillStyle = '#69f4ff';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff5dd9';
  for (const enemy of enemies) {
    const ex = ui.minimap.width / 2 + enemy.position.x * 2.2;
    const ey = ui.minimap.height / 2 + enemy.position.z * 2.2;
    ctx.beginPath();
    ctx.arc(ex, ey, enemy.userData.type === 'boss' ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(105,244,255,0.38)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 7, 0, Math.PI * 2);
  ctx.stroke();
}

function animate() {
  loopId = requestAnimationFrame(animate);
  if (!gameRunning || !renderer || !camera) return;

  const delta = Math.min(0.05, clock.getDelta());
  game.time += delta;

  updatePlayer(delta);
  updateBullets(delta);
  updateEnemyBullets(delta);
  updateEnemies(delta);
  updateMedkits(delta);
  updateHud();

  if (game.hp <= 0 && !gameOver) endGame();
  if (enemies.length === 0 && !gameOver) spawnWave();

  renderer.render(scene, camera);
}

ui.startBtn.addEventListener('click', startGame);
ui.resumeBtn.addEventListener('click', () => {
  ui.pauseScreen.classList.add('hidden');
  controls.lock();
});
ui.restartBtn.addEventListener('click', () => {
  ui.pauseScreen.classList.add('hidden');
  resetGame();
  spawnWave();
  controls.lock();
});
ui.againBtn.addEventListener('click', () => {
  ui.gameOverScreen.classList.add('hidden');
  startGame();
});

bindInput();
initAudio();
updateHud();

console.log('Neon Siege loaded. Mission ready.');

// fallback auto-start in browser if desired
// startGame();





































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































n