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
  score: document.getElementById('scoreVal'),
  wave: document.getElementById('waveVal'),
  ammo: document.getElementById('ammoVal'),
  mag: document.getElementById('magVal'),
  finalScore: document.getElementById('finalScore'),
  status: document.getElementById('statusVal'),
  hint: document.getElementById('hint'),
  minimap: document.getElementById('minimap')
};

let scene, camera, renderer, controls, weaponGroup;
let clock = new THREE.Clock();
let audioCtx, masterGain;
let loopId = null;
let soundEnabled = true;
let gameRunning = false;
let gameOver = false;
let moveState = { forward:false, back:false, left:false, right:false };
let enemies = [], bullets = [], enemyBullets = [], medkits = [];
let lastMusicTick = 0;

const game = {
  score: 0,
  wave: 0,
  hp: 100,
  maxHp: 100,
  ammo: 30,
  maxAmmo: 30,
  reloadTimer: 0,
  reloadDuration: 1.2,
  recoil: 0,
  sway: 0,
  time: 0,
  pulse: 0,
  bossWave: false,
  stateText: 'Combat Ready'
};

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.25;
  } catch (e) {
    soundEnabled = false;
  }
}

function playTone(freq = 440, duration = 0.04, volume = 0.3, type = 'sine') {
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

function createMusicPulse() {
  if (!soundEnabled || !audioCtx || !masterGain) return;
  const notes = [220, 277, 330, 277, 392, 330, 440, 330];
  const index = Math.floor(game.time * 3) % notes.length;
  const note = notes[index];
  playTone(note, 0.12, 0.07, 'triangle');
}

function initRenderer() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x050813);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(0, 1.6, 18);

  const hemi = new THREE.HemisphereLight(0x8ac7ff, 0x0a0d15, 0.9);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xffffff, 1.0);
  moon.position.set(8, 12, 6);
  scene.add(moon);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1119, roughness: 0.95, metalness: 0.15 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(29, 0.7, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x2ef3ff, transparent: true, opacity: 0.45 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  scene.add(ring);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x101827, emissive: 0x0a1c2a, roughness: 0.8 });
  const wallPositions = [
    [0, 2.5, -30], [0, 2.5, 30], [-30, 2.5, 0], [30, 2.5, 0]
  ];
  wallPositions.forEach(([x, y, z]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(62, 5, 2), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
  });

  const decoMat = new THREE.MeshBasicMaterial({ color: 0x5cf3ff, transparent: true, opacity: 0.17 });
  for (let i = 0; i < 18; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.45), decoMat);
    const ang = (i / 18) * Math.PI * 2;
    strip.position.set(Math.cos(ang) * 22, 2.2, Math.sin(ang) * 22);
    strip.lookAt(0, 1.5, 0);
    scene.add(strip);
  }

  weaponGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x151a24, emissive: 0x091421 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0x262b36, metalness: 0.7, roughness: 0.2 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.42, -0.08, -0.8);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.18), new THREE.MeshStandardMaterial({ color: 0x0e1117 }));
  grip.position.set(-0.1, -0.35, 0.18);
  weaponGroup.add(body, barrel, grip);
  camera.add(weaponGroup);
  scene.add(camera);

  controls = new PointerLockControls(camera, renderer.domElement);
  controls.getObject().position.set(0, 1.6, 18);

  document.addEventListener('click', () => {
    if (!gameRunning || gameOver) return;
    if (!controls.isLocked) controls.lock();
  });

  controls.addEventListener('lock', () => {
    ui.hint.style.display = 'block';
  });

  controls.addEventListener('unlock', () => {
    if (gameRunning && !gameOver) {
      ui.pauseScreen.classList.remove('hidden');
    }
  });

  window.addEventListener('resize', onResize);
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
      case 'Space':
        if (gameRunning && !gameOver && controls.getObject().position.y <= 1.6 + 0.05) {
          // simple jump impulse
          camera.position.y += 0.03;
        }
        break;
      case 'KeyR':
        if (gameRunning && !gameOver) startReload();
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
    if (event.button === 0 && gameRunning && !gameOver && controls.isLocked) fireWeapon();
  });
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function resetGame() {
  game.score = 0;
  game.wave = 0;
  game.hp = game.maxHp;
  game.ammo = game.maxAmmo;
  game.reloadTimer = 0;
  game.recoil = 0;
  game.sway = 0;
  game.time = 0;
  game.stateText = 'Combat Ready';
  game.bossWave = false;

  for (const item of bullets) scene.remove(item);
  for (const shot of enemyBullets) scene.remove(shot);
  for (const kit of medkits) scene.remove(kit);
  for (const enemy of enemies) scene.remove(enemy);
  bullets = [];
  enemyBullets = [];
  medkits = [];
  enemies = [];

  camera.position.set(0, 1.6, 18);
  camera.rotation.set(0, 0, 0);
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

  if (!loopId) loopId = requestAnimationFrame(animate);

  resetGame();
  spawnWave();
  controls.lock();
}

function updateHud() {
  ui.hp.textContent = `${Math.max(0, Math.ceil(game.hp))}`;
  ui.score.textContent = `${game.score}`;
  ui.wave.textContent = `${game.wave}`;
  ui.ammo.textContent = `${game.ammo}`;
  ui.mag.textContent = `${game.maxAmmo}`;
  ui.status.textContent = game.stateText;
  ui.finalScore.textContent = `${game.score}`;
  renderMinimap();
}

function startReload() {
  if (game.reloadTimer > 0 || game.ammo >= game.maxAmmo || !gameRunning || gameOver) return;
  game.reloadTimer = game.reloadDuration;
  game.stateText = 'Reloading';
  updateHud();
  playTone(180, 0.09, 0.12, 'sawtooth');
}

function finishReload() {
  game.ammo = game.maxAmmo;
  game.reloadTimer = 0;
  game.stateText = 'Combat Ready';
  updateHud();
}

function fireWeapon() {
  if (!gameRunning || gameOver || game.reloadTimer > 0) {
    if (game.reloadTimer > 0) return;
  }
  if (game.ammo <= 0) {
    startReload();
    return;
  }

  game.ammo -= 1;
  game.recoil = 0.22;
  game.stateText = 'Firing';
  updateHud();
  playTone(980, 0.04, 0.18, 'square');

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const muzzle = camera.position.clone().add(dir.clone().multiplyScalar(0.8));

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd66b })
  );
  bullet.position.copy(muzzle);
  bullet.userData = { velocity: dir.clone().multiplyScalar(72), life: 1.6 };
  scene.add(bullet);
  bullets.push(bullet);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.8 })
  );
  flash.position.copy(muzzle);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 80);

  if (game.ammo === 0) startReload();
}

function spawnEnemy(type = 'grunt') {
  const enemy = new THREE.Mesh(
    type === 'boss'
      ? new THREE.BoxGeometry(2.2, 2.8, 2.2)
      : new THREE.BoxGeometry(1.2, 1.8, 1.2),
    new THREE.MeshStandardMaterial({
      color: type === 'boss' ? 0xff5e7c : type === 'runner' ? 0xffc166 : 0xff4ca3,
      emissive: type === 'boss' ? 0x3b0d12 : 0x2b0a15,
      metalness: 0.25,
      roughness: 0.45
    })
  );

  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 12;
  enemy.position.set(Math.cos(angle) * radius, type === 'boss' ? 1.4 : 0.9, Math.sin(angle) * radius);
  enemy.userData = {
    type,
    hp: type === 'boss' ? 220 : type === 'runner' ? 45 : 70,
    speed: type === 'boss' ? 1.2 : type === 'runner' ? 2.3 : 1.5,
    fireCooldown: type === 'boss' ? 1.1 : 1.4 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2
  };

  scene.add(enemy);
  enemies.push(enemy);
}

function spawnWave() {
  game.wave += 1;
  game.bossWave = game.wave % 5 === 0;
  const total = game.bossWave ? 1 : 6 + game.wave * 2;
  game.stateText = game.bossWave ? 'Boss Wave' : 'Engaging';
  updateHud();

  for (let i = 0; i < total; i++) {
    if (game.bossWave && i === 0) {
      spawnEnemy('boss');
    } else {
      const type = (Math.random() < 0.25) ? 'runner' : 'grunt';
      spawnEnemy(type);
    }
  }
}

function spawnMedkit() {
  const pack = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.52, 0),
    new THREE.MeshStandardMaterial({ color: 0x68ffb0, emissive: 0x0d3c2a, metalness: 0.2, roughness: 0.35 })
  );
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 12;
  pack.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius);
  pack.userData = { bob: Math.random() * Math.PI * 2 };
  scene.add(pack);
  medkits.push(pack);
}

function fireEnemyShot(enemy) {
  const toPlayer = camera.position.clone().sub(enemy.position);
  toPlayer.y = 0;
  const dir = toPlayer.clone().normalize();
  const shot = new THREE.Mesh(
    new THREE.SphereGeometry(enemy.userData.type === 'boss' ? 0.18 : 0.12, 10, 10),
    new THREE.MeshBasicMaterial({ color: enemy.userData.type === 'boss' ? 0xff7a7a : 0xff4d4d })
  );
  shot.position.copy(enemy.position).add(new THREE.Vector3(0, 0.5, 0));
  shot.userData = {
    velocity: dir.multiplyScalar(enemy.userData.type === 'boss' ? 18 : 24),
    life: enemy.userData.type === 'boss' ? 4.5 : 3.2
  };
  scene.add(shot);
  enemyBullets.push(shot);
  playTone(enemy.userData.type === 'boss' ? 140 : 190, 0.05, 0.12, 'sawtooth');
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.life -= delta;

    let destroyed = false;
    for (const enemy of enemies) {
      if (bullet.position.distanceTo(enemy.position) < (enemy.userData.type === 'boss' ? 1.8 : 1.0)) {
        enemy.userData.hp -= 35;
        playTone(420, 0.04, 0.10, 'triangle');
        scene.remove(bullet);
        bullets.splice(i, 1);
        destroyed = true;

        if (enemy.userData.hp <= 0) {
          scene.remove(enemy);
          const idx = enemies.indexOf(enemy);
          if (idx >= 0) enemies.splice(idx, 1);
          game.score += enemy.userData.type === 'boss' ? 120 : 12;
          if (Math.random() < 0.18) spawnMedkit();
          if (enemies.length === 0) {
            spawnWave();
          }
        }
        break;
      }
    }

    if (destroyed) continue;
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

    if (shot.position.distanceTo(camera.position) < 1.15) {
      game.hp -= 12;
      playTone(100, 0.08, 0.22, 'square');
      scene.remove(shot);
      enemyBullets.splice(i, 1);
      if (game.hp <= 0) {
        game.hp = 0;
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
    enemy.position.y = enemy.userData.type === 'boss' ? 1.4 : 0.9 + Math.sin(game.time * 2 + enemy.userData.phase) * 0.1;
    enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);

    if (dist < 20 && enemy.userData.fireCooldown <= 0) {
      enemy.userData.fireCooldown = enemy.userData.type === 'boss' ? 0.85 : 1.8 + Math.random() * 1.4;
      fireEnemyShot(enemy);
    }
  }
}

function updateMedkits(delta) {
  for (let i = medkits.length - 1; i >= 0; i--) {
    const kit = medkits[i];
    kit.rotation.y += delta * 2.2;
    kit.position.y = 0.8 + Math.sin(game.time * 5 + kit.userData.bob) * 0.24;

    if (kit.position.distanceTo(camera.position) < 1.5) {
      game.hp = Math.min(game.maxHp, game.hp + 22);
      playTone(620, 0.1, 0.2, 'triangle');
      scene.remove(kit);
      medkits.splice(i, 1);
      updateHud();
    }
  }
}

function updatePlayer(delta) {
  const moveVector = new THREE.Vector3();
  const forwardDir = new THREE.Vector3();
  camera.getWorldDirection(forwardDir);
  forwardDir.y = 0;
  forwardDir.normalize();
  const right = new THREE.Vector3().crossVectors(forwardDir, camera.up).normalize();

  if (moveState.forward) moveVector.add(forwardDir.clone().multiplyScalar(-1));
  if (moveState.back) moveVector.add(forwardDir);
  if (moveState.left) moveVector.add(right.clone().multiplyScalar(-1));
  if (moveState.right) moveVector.add(right);

  if (moveVector.lengthSq() > 0) {
    moveVector.normalize();
    const nextPos = controls.getObject().position.clone().addScaledVector(moveVector, 6.5 * delta);
    const dist = Math.hypot(nextPos.x, nextPos.z);
    if (dist < 28) {
      controls.getObject().position.copy(nextPos);
    }
  }

  camera.rotation.z = Math.sin(game.time * 9) * 0.015;
  camera.rotation.x += (game.recoil * 0.7 - camera.rotation.x * 0.12);
  game.recoil *= 0.7;
  game.recoil = Math.max(0, game.recoil);

  if (game.reloadTimer > 0) {
    game.reloadTimer -= delta;
    if (game.reloadTimer <= 0) finishReload();
  }

  if (camera.position.y < 1.6) camera.position.y = 1.6;

  const weaponBob = Math.sin(game.time * 12) * 0.03;
  if (weaponGroup) {
    weaponGroup.position.set(0.45, -0.18 + weaponBob, -0.7);
    weaponGroup.rotation.x = -0.2 + game.recoil * 0.9;
    weaponGroup.rotation.y = 0.2;
  }
}

function renderMinimap() {
  const ctx = ui.minimap.getContext('2d');
  ctx.clearRect(0, 0, ui.minimap.width, ui.minimap.height);

  ctx.fillStyle = 'rgba(4, 18, 26, 0.9)';
  ctx.beginPath();
  ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 6, 0, Math.PI * 2);
  ctx.fill();

  const playerX = ui.minimap.width / 2 + camera.position.x * 2.2;
  const playerY = ui.minimap.height / 2 + camera.position.z * 2.2;

  ctx.fillStyle = '#65f8ff';
  ctx.beginPath();
  ctx.arc(playerX, playerY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff5edb';
  for (const enemy of enemies) {
    const ex = ui.minimap.width / 2 + enemy.position.x * 2.2;
    const ey = ui.minimap.height / 2 + enemy.position.z * 2.2;
    ctx.beginPath();
    ctx.arc(ex, ey, enemy.userData.type === 'boss' ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(101,248,255,0.38)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ui.minimap.width / 2, ui.minimap.height / 2, ui.minimap.width / 2 - 7, 0, Math.PI * 2);
  ctx.stroke();
}

function animate() {
  loopId = requestAnimationFrame(animate);

  if (!gameRunning || !renderer) return;

  const delta = Math.min(0.05, clock.getDelta());
  game.time += delta;

  if (game.time - lastMusicTick > 0.52) {
    lastMusicTick = game.time;
    createMusicPulse();
  }

  updatePlayer(delta);
  updateBullets(delta);
  updateEnemyBullets(delta);
  updateEnemies(delta);
  updateMedkits(delta);
  updateHud();

  if (game.hp <= 0 && !gameOver) endGame();
  if (enemies.length === 0 && !gameOver && gameRunning) spawnWave();

  renderer.render(scene, camera);
}

function endGame() {
  gameRunning = false;
  gameOver = true;
  ui.finalScore.textContent = String(game.score);
  ui.gameOverScreen.classList.remove('hidden');
  controls.unlock();
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
