import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js';

const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const pauseTitle = document.getElementById('pauseTitle');
const hud = document.getElementById('hud');
const scoreVal = document.getElementById('scoreVal');
const waveVal = document.getElementById('waveVal');
const hpEl = document.getElementById('hp');
const ammoEl = document.getElementById('ammoVal');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const soundToggle = document.getElementById('enableSound');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b12);
scene.fog = new THREE.Fog(0x050b12, 10, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.6, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keyState = {};
const enemies = [];

const world = {
  bounds: 18,
  gravity: 18,
  jumpStrength: 8,
  playerHeight: 1.6,
  playerSpeed: 8,
  score: 0,
  wave: 1,
  playerHealth: 100,
  isPaused: true,
  started: false,
  killedThisWave: 0,
  waveTarget: 0,
  hasQueuedWave: false,
  nextHitAt: 0,
  soundEnabled: soundToggle.checked,
  audioCtx: null
};

const moveVector = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function ensureAudio() {
  if (!world.soundEnabled) return;
  if (!world.audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) {
      world.audioCtx = new AudioCtor();
    }
  }
  if (world.audioCtx && world.audioCtx.state === 'suspended') {
    world.audioCtx.resume();
  }
}

function playBeep(freq = 220, duration = 0.08, volume = 0.05) {
  if (!world.soundEnabled || !world.audioCtx) return;

  const oscillator = world.audioCtx.createOscillator();
  const gainNode = world.audioCtx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = freq;
  gainNode.gain.value = volume;

  oscillator.connect(gainNode);
  gainNode.gain.connect(world.audioCtx.destination);

  oscillator.start();
  oscillator.stop(world.audioCtx.currentTime + duration);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, world.audioCtx.currentTime + duration);
}

function updateHud() {
  scoreVal.textContent = String(world.score);
  waveVal.textContent = String(world.wave);
  hpEl.textContent = String(Math.max(0, world.playerHealth));
  ammoEl.textContent = '∞';
}

function setPauseState(paused, title = 'Paused') {
  world.isPaused = paused;
  pauseTitle.textContent = title;
  pauseScreen.classList.toggle('hidden', !paused);
  if (paused) {
    controls.unlock();
    document.body.style.cursor = 'auto';
  }
}

function startGame() {
  ensureAudio();
  world.started = true;
  world.isPaused = false;
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  controls.lock();
  document.body.style.cursor = 'none';
  updateHud();
  if (enemies.length === 0 && !world.hasQueuedWave) {
    beginWave();
  }
}

function restartGame() {
  for (const enemy of enemies.splice(0)) {
    scene.remove(enemy);
  }

  world.score = 0;
  world.wave = 1;
  world.playerHealth = 100;
  world.killedThisWave = 0;
  world.waveTarget = 0;
  world.hasQueuedWave = false;
  world.nextHitAt = 0;

  camera.position.set(0, world.playerHeight, 10);
  controls.getObject().position.copy(camera.position);

  updateHud();
  setPauseState(false);
  startGame();
}

function showGameOver() {
  world.started = false;
  setPauseState(true, 'Game Over');
  pauseScreen.classList.remove('hidden');
  hud.classList.add('hidden');
  controls.unlock();
}

function createArena() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({
      color: 0x0a1320,
      emissive: 0x061018,
      emissiveIntensity: 0.6,
      metalness: 0.2,
      roughness: 0.9
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(100, 50, 0x3af0ff, 0x12384e);
  grid.position.y = 0.02;
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0x9ed8ff, 0.7);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffd0f1, 1.4);
  dirLight.position.set(8, 14, 10);
  scene.add(dirLight);

  const neonLight = new THREE.PointLight(0x33f0ff, 20, 80, 2);
  neonLight.position.set(0, 8, 0);
  scene.add(neonLight);

  const obstacleMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2330,
    emissive: 0x0d6f8f,
    emissiveIntensity: 0.8,
    metalness: 0.8,
    roughness: 0.3
  });

  const obstaclePositions = [
    [-7, 1.5, -6], [7, 1.5, -6], [-10, 1.5, 2], [10, 1.5, 2],
    [0, 1.5, -12], [0, 1.5, 12], [-12, 1.5, -10], [12, 1.5, -10]
  ];

  for (const [x, y, z] of obstaclePositions) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2.4), obstacleMaterial);
    box.position.set(x, y, z);
    scene.add(box);
  }
}

function spawnEnemy() {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xff537d,
    emissive: 0xff2a75,
    emissiveIntensity: 1.1,
    metalness: 0.25,
    roughness: 0.35
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.1, 4, 8), bodyMaterial);
  body.castShadow = true;
  group.add(body);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
  );
  eye.position.set(0, 0.35, 0.44);
  group.add(eye);

  const angle = Math.random() * Math.PI * 2;
  const radius = 12 + Math.random() * 12;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  group.position.set(x, 1, z);
  group.userData.enemy = true;
  group.userData.health = 1;
  group.userData.speed = 1.3 + Math.random() * 0.8 + world.wave * 0.12;
  group.userData.hitCooldown = 0;

  scene.add(group);
  enemies.push(group);
}

function beginWave() {
  world.hasQueuedWave = false;
  world.waveTarget = 4 + world.wave * 2;
  world.killedThisWave = 0;

  for (let i = 0; i < world.waveTarget; i += 1) {
    spawnEnemy();
  }

  updateHud();
}

function destroyEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index >= 0) {
    enemies.splice(index, 1);
  }
  scene.remove(enemy);
  world.killedThisWave += 1;
  world.score += 10 * world.wave;
  updateHud();

  if (world.killedThisWave >= world.waveTarget && !world.hasQueuedWave) {
    world.hasQueuedWave = true;
    setTimeout(() => {
      world.wave += 1;
      beginWave();
    }, 1000);
  }
}

function flashHit(enemy) {
  enemy.traverse((obj) => {
    if (obj.isMesh && obj.material && 'emissive' in obj.material) {
      const old = obj.material.emissive.getHex();
      obj.material.emissive.setHex(0xffffff);
      setTimeout(() => obj.material.emissive.setHex(old), 100);
    }
  });
}

function handleShot() {
  if (!world.started || world.isPaused) return;
  ensureAudio();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(enemies, true);

  if (hits.length > 0) {
    const hit = hits[0].object;
    let targetEnemy = hit;
    while (targetEnemy && !targetEnemy.userData.enemy) {
      targetEnemy = targetEnemy.parent;
    }

    if (targetEnemy && targetEnemy.userData.enemy) {
      targetEnemy.userData.health -= 1;
      flashHit(targetEnemy);
      playBeep(260, 0.06, 0.08);

      if (targetEnemy.userData.health <= 0) {
        destroyEnemy(targetEnemy);
      }
      return;
    }
  }

  playBeep(150, 0.04, 0.05);
}

function takeDamage() {
  if (performance.now() < world.nextHitAt) return;
  world.playerHealth = Math.max(0, world.playerHealth - 10);
  world.nextHitAt = performance.now() + 550;
  hpEl.textContent = String(world.playerHealth);
  playBeep(70, 0.08, 0.12);

  if (world.playerHealth <= 0) {
    showGameOver();
  }
}

function updateMovement(delta) {
  const player = controls.getObject();

  const direction = moveVector.set(0, 0, 0);
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  forward.y = 0;
  right.y = 0;
  forward.normalize();
  right.normalize();

  if (keyState.KeyW) direction.add(forward);
  if (keyState.KeyS) direction.sub(forward);
  if (keyState.KeyA) direction.sub(right);
  if (keyState.KeyD) direction.add(right);

  if (direction.lengthSq() > 0) {
    direction.normalize();
    player.position.addScaledVector(direction, world.playerSpeed * delta);
  }

  player.position.x = THREE.MathUtils.clamp(player.position.x, -world.bounds, world.bounds);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -world.bounds, world.bounds);

  if (keyState.Space && player.position.y <= world.playerHeight + 0.05) {
    player.position.y = world.playerHeight;
    player.userData.verticalVelocity = world.jumpStrength;
  }

  if (player.userData.verticalVelocity === undefined) {
    player.userData.verticalVelocity = 0;
  }

  player.userData.verticalVelocity -= world.gravity * delta;
  player.position.y += player.userData.verticalVelocity * delta;

  if (player.position.y < world.playerHeight) {
    player.position.y = world.playerHeight;
    player.userData.verticalVelocity = 0;
  }
}

function updateEnemies(delta) {
  const playerPos = camera.position.clone();

  for (const enemy of enemies) {
    const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    if (distance > 0.0001) {
      toPlayer.normalize();
      enemy.position.addScaledVector(toPlayer, enemy.userData.speed * delta);
    }

    const closeEnough = distance < 1.8;
    if (closeEnough) {
      takeDamage();
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);

  if (world.started && !world.isPaused) {
    updateMovement(delta);
    updateEnemies(delta);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('keydown', (event) => {
  keyState[event.code] = true;

  if (event.code === 'Escape' && world.started && !world.isPaused) {
    setPauseState(true, 'Paused');
    return;
  }

  if (event.code === 'Escape' && world.started && world.isPaused) {
    setPauseState(false);
    controls.lock();
  }
});

document.addEventListener('keyup', (event) => {
  keyState[event.code] = false;
});

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;

  if (world.started && !world.isPaused && document.pointerLockElement === document.body) {
    handleShot();
  }
});

startBtn.addEventListener('click', () => {
  startGame();
});

resumeBtn.addEventListener('click', () => {
  if (!world.started) return;
  setPauseState(false);
  controls.lock();
});

restartBtn.addEventListener('click', () => {
  restartGame();
});

soundToggle.addEventListener('change', () => {
  world.soundEnabled = soundToggle.checked;
  if (world.soundEnabled) {
    ensureAudio();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== document.body && world.started && !world.isPaused) {
    setPauseState(true, 'Paused');
  }
});

createArena();
updateHud();
startScreen.classList.remove('hidden');
animate();

window.addEventListener('blur', () => {
  if (world.started && !world.isPaused && document.pointerLockElement === document.body) {
    setPauseState(true, 'Paused');
  }
});

setPauseState(true, 'Paused');

if (enemies.length === 0 && !world.hasQueuedWave) {
  world.hasQueuedWave = true;
  setTimeout(() => {
    if (world.started) {
      beginWave();
    }
  }, 300);
}
