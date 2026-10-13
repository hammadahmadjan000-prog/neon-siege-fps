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
  finalScore: document.getElementById('finalScore'),
  hint: document.getElementById('hint')
};

let scene, camera, renderer, controls;
let clock = new THREE.Clock();
let audioCtx, masterGain;
let animationLoopId = null;
let gameRunning = false;
let gameOver = false;
let soundEnabled = true;
let enemies = [];
let bullets = [];
let enemyBullets = [];
let medkits = [];
let moveState = { forward:false, back:false, left:false, right:false };
let playerVelocity = new THREE.Vector3();
let playerDir = new THREE.Vector3();
let lastTime = 0;

const state = {
  score: 0,
  wave: 0,
  hp: 100,
  weaponCooldown: 0,
  recoil: 0,
  sway: 0,
  time: 0,
  lastSpawn: 0
};

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.35;
  } catch (e) {
    soundEnabled = false;
  }
}

function playTone(freq = 440, duration = 0.04, volume = 0.35, type = 'sine') {
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
  renderer.setClearColor(0x06070b);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 18);

  const hemi = new THREE.HemisphereLight(0x7fd1ff, 0x101116, 0.9);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 12, 8);
  scene.add(dirLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.95, metalness: 0.15 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const arenaRing = new THREE.Mesh(
    new THREE.TorusGeometry(32, 0.8, 16, 80),
    new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.5 })
  );
  arenaRing.rotation.x = Math.PI / 2;
  arenaRing.position.y = 0.02;
  scene.add(arenaRing);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x0b1d2f, roughness: 0.7 });
  const wallHalf = 32;
  const wallHeight = 6;
  const walls = [
    { x: 0, y: wallHeight / 2, z: -wallHalf },
    { x: 0, y: wallHeight / 2, z: wallHalf },
    { x: -wallHalf, y: wallHeight / 2, z: 0 },
    { x: wallHalf, y: wallHeight / 2, z: 0 }
  ];

  walls.forEach((pos) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(64, wallHeight, 2), wallMaterial);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
  });

  const decoMat = new THREE.MeshBasicMaterial({ color: 0x00f7ff, transparent: true, opacity: 0.18 });
  for (let i = 0; i < 18; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), decoMat);
    const angle = (i / 18) * Math.PI * 2;
    strip.position.set(Math.cos(angle) * 24, 2.2, Math.sin(angle) * 24);
    strip.lookAt(0, 1.5, 0);
    scene.add(strip);
  }

  controls = new PointerLockControls(camera, renderer.domElement);
  controls.getObject().position.set(0, 1.6, 18);
  controls.lock();

  document.addEventListener('click', () => {
    if (!gameRunning && !gameOver) return;
    if (!controls.isLocked && !gameOver) controls.lock();
  });

  controls.addEventListener('lock', () => {
    ui.hint.style.display = 'block';
  });

  controls.addEventListener('unlock', () => {
    ui.hint.style.display = 'block';
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
        if (!controls.isLocked || gameOver) return;
        if (controls.getObject().position.y <= 1.6 + 0.1) {
          playerVelocity.y = 6.2;
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

function startGame() {
  soundEnabled = ui.enableSound.checked;
  if (!audioCtx) initAudio();

  if (!renderer) {
    initRenderer();
  }

  if (!animationLoopId) {
    animationLoopId = requestAnimationFrame(animate);
  }

  ui.startScreen.classList.add('hidden');
  ui.gameOverScreen.classList.add('hidden');
  ui.pauseScreen.classList.add('hidden');
  ui.hud.classList.remove('hidden');

  gameRunning = true;
  gameOver = false;
  resetGameState();
  spawnWave();
  controls.lock();
}

function resetGameState() {
  state.score = 0;
  state.wave = 0;
  state.hp = 100;
  state.weaponCooldown = 0;
  state.recoil = 0;
  state.sway = 0;
  state.time = 0;
  state.lastSpawn = 0;

  playerVelocity.set(0, 0, 0);
  controls.getObject().position.set(0, 1.6, 18);

  for (const bullet of bullets) scene.remove(bullet);
  for (const shot of enemyBullets) scene.remove(shot);
  for (const kit of medkits) scene.remove(kit);
  for (const enemy of enemies) scene.remove(enemy);

  bullets = [];
  enemyBullets = [];
  medkits = [];
  enemies = [];

  updateHud();
}

function endGame() {
  gameRunning = false;
  gameOver = true;
  ui.finalScore.textContent = state.score;
  ui.gameOverScreen.classList.remove('hidden');
  controls.unlock();
}

function updateHud() {
  ui.hp.textContent = Math.ceil(state.hp);
  ui.score.textContent = state.score;
  ui.wave.textContent = state.wave;
  ui.ammo.textContent = '∞';
}

function spawnWave() {
  state.wave += 1;
  const count = Math.min(8 + state.wave, 18);

  for (let i = 0; i < count; i++) {
    const enemy = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.7, 1.1),
      new THREE.MeshStandardMaterial({
        color: 0xff4fa3,
        emissive: 0x330a14,
        metalness: 0.2,
        roughness: 0.5
      })
    );

    const angle = (i / count) * Math.PI * 2 + Math.random() * 1.5;
    const radius = 18 + Math.random() * 14;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    enemy.position.set(x, 0.85, z);
    enemy.userData = {
      hp: 55 + state.wave * 10,
      speed: 1.2 + Math.random() * 1.3 + state.wave * 0.08,
      fireCooldown: 1.4 + Math.random() * 1.4
    };

    scene.add(enemy);
    enemies.push(enemy);
  }

  updateHud();
}

function fireWeapon() {
  if (!gameRunning || gameOver) return;
  if (state.weaponCooldown > 0) return;

  state.weaponCooldown = 0.12;
  state.recoil = 0.22;
  playTone(900, 0.05, 0.18, 'square');

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe07a })
  );

  const spawn = camera.position.clone().add(dir.clone().multiplyScalar(0.7));
  bullet.position.copy(spawn);
  bullet.userData = {
    velocity: dir.clone().multiplyScalar(75),
    life: 1.8
  };

  scene.add(bullet);
  bullets.push(bullet);
}

function spawnMedkit() {
  const pack = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.MeshStandardMaterial({ color: 0x00ff95, emissive: 0x083722, metalness: 0.1, roughness: 0.35 })
  );

  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 12;
  pack.position.set(Math.cos(angle) * radius, 0.9, Math.sin(angle) * radius);
  pack.userData = { bob: Math.random() * Math.PI * 2 };
  scene.add(pack);
  medkits.push(pack);
}

function fireEnemyBullet(enemy) {
  const toPlayer = camera.position.clone().sub(enemy.position);
  toPlayer.y = 0;
  const dir = toPlayer.clone().normalize();

  const shot = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5b5b })
  );

  shot.position.copy(enemy.position).add(new THREE.Vector3(0, 0.5, 0));
  shot.userData = {
    velocity: dir.multiplyScalar(26),
    life: 3.2
  };

  scene.add(shot);
  enemyBullets.push(shot);
  playTone(180, 0.05, 0.12, 'sawtooth');
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.life -= delta;

    let hitEnemy = false;
    for (const enemy of enemies) {
      if (bullet.position.distanceTo(enemy.position) < 1.0) {
        enemy.userData.hp -= 35;
        playTone(320, 0.04, 0.12, 'triangle');
        scene.remove(bullet);
        bullets.splice(i, 1);
        hitEnemy = true;
        if (enemy.userData.hp <= 0) {
          scene.remove(enemy);
          const idx = enemies.indexOf(enemy);
          if (idx >= 0) enemies.splice(idx, 1);
          state.score += 10 + state.wave * 3;
          updateHud();
          if (enemies.length === 0) {
            spawnWave();
          }
        }
        break;
      }
    }

    if (hitEnemy) continue;

    if (bullet.userData.life <= 0 || bullet.position.length() > 80) {
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

    const distToPlayer = shot.position.distanceTo(camera.position);
    if (distToPlayer < 1.1) {
      state.hp -= 15;
      playTone(120, 0.08, 0.2, 'square');
      if (state.hp <= 0) {
        state.hp = 0;
        updateHud();
        endGame();
        return;
      }
      scene.remove(shot);
      enemyBullets.splice(i, 1);
      updateHud();
      continue;
    }

    if (shot.userData.life <= 0 || shot.position.length() > 90) {
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
      enemy.position.addScaledVector(toPlayer, enemy.userData.speed * delta);
    }

    enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);

    enemy.userData.fireCooldown -= delta;
    if (dist < 24 && enemy.userData.fireCooldown <= 0) {
      enemy.userData.fireCooldown = 1.2 + Math.random() * 1.5;
      fireEnemyBullet(enemy);
    }
  }
}

function updateMedkits(delta) {
  if (medkits.length < 1 && Math.random() < 0.012) {
    spawnMedkit();
  }

  for (let i = medkits.length - 1; i >= 0; i--) {
    const kit = medkits[i];
    kit.rotation.y += delta * 2.4;
    kit.position.y = 0.9 + Math.sin(state.time * 3 + kit.userData.bob) * 0.35;

    if (kit.position.distanceTo(camera.position) < 1.5) {
      state.hp = Math.min(100, state.hp + 25);
      playTone(620, 0.12, 0.25, 'triangle');
      scene.remove(kit);
      medkits.splice(i, 1);
      updateHud();
    }
  }
}

function updatePlayer(delta) {
  const speed = 6.2;
  playerDir.set(0, 0, 0);

  if (moveState.forward) playerDir.z -= 1;
  if (moveState.back) playerDir.z += 1;
  if (moveState.left) playerDir.x -= 1;
  if (moveState.right) playerDir.x += 1;

  if (playerDir.lengthSq() > 0) {
    playerDir.normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    move.addScaledVector(forward, -playerDir.z);
    move.addScaledVector(right, playerDir.x);
    move.normalize();

    const moveAmount = speed * delta;
    const nextPos = controls.getObject().position.clone().addScaledVector(move, moveAmount);

    const maxDist = 30;
    const dist = Math.hypot(nextPos.x, nextPos.z);
    if (dist <= maxDist) {
      controls.getObject().position.copy(nextPos);
    }
  }

  playerVelocity.y -= 18 * delta;
  controls.getObject().position.y += playerVelocity.y * delta;

  if (controls.getObject().position.y < 1.6) {
    controls.getObject().position.y = 1.6;
    playerVelocity.y = 0;
  }

  state.weaponCooldown = Math.max(0, state.weaponCooldown - delta);
  state.recoil *= 0.82;
  state.sway = Math.sin(state.time * 10) * 0.025;

  camera.rotation.x += (state.recoil * 0.3 - camera.rotation.x * 0.12);
  camera.rotation.z = state.sway;

  if (camera.rotation.x > 0.3) camera.rotation.x = 0.3;
  if (camera.rotation.x < -0.4) camera.rotation.x = -0.4;
}

function animate() {
  requestAnimationFrame(animate);

  if (!gameRunning || !renderer || !camera || !controls) {
    return;
  }

  const delta = Math.min(0.05, clock.getDelta());
  state.time += delta;
  updatePlayer(delta);
  updateEnemies(delta);
  updateBullets(delta);
  updateEnemyBullets(delta);
  updateMedkits(delta);

  if (state.hp <= 0 && !gameOver) {
    endGame();
  }

  renderer.render(scene, camera);
}

ui.startBtn.addEventListener('click', startGame);
ui.resumeBtn.addEventListener('click', () => {
  ui.pauseScreen.classList.add('hidden');
  controls.lock();
});
ui.restartBtn.addEventListener('click', () => {
  ui.pauseScreen.classList.add('hidden');
  resetGameState();
  spawnWave();
  controls.lock();
});
ui.againBtn.addEventListener('click', () => {
  ui.gameOverScreen.classList.add('hidden');
  startGame();
});

initAudio();
bindInput();
updateHud();
