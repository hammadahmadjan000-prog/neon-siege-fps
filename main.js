// main.js - Upgraded Neon Siege Starter
import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/PointerLockControls.js';

// Globals
let scene, camera, renderer, controls;
let clock = new THREE.Clock();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let canJump = false;
const colliders = [];
let enemies = [];
let bullets = [];
let score = 0;
let wave = 0;
let hp = 100;
let enableSound = true;

// UI
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const enableSoundCb = document.getElementById('enableSound');
const hud = document.getElementById('hud');
const hpElem = document.getElementById('hp');
const scoreVal = document.getElementById('scoreVal');
const waveVal = document.getElementById('waveVal');
const ammoVal = document.getElementById('ammoVal');
const pauseScreen = document.getElementById('pauseScreen');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');

// Audio context and simple sounds
let audioCtx, masterGain;
async function initAudio(){
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.8;
  }catch(e){ enableSound = false; }
}
function playBeep(freq=440, time=0.05, gain=0.5){
  if(!enableSound || !audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(masterGain);
  o.start(); o.stop(audioCtx.currentTime + time);
}

// Start sequence
startBtn.addEventListener('click', ()=>{
  enableSound = enableSoundCb.checked;
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  init().then(()=>animate());
});
resumeBtn.addEventListener('click', ()=>{ pauseScreen.classList.add('hidden'); controls.lock(); });
restartBtn.addEventListener('click', ()=>{ location.reload(); });

// Core init
async function init(){
  await initAudio();

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a);
  document.body.appendChild(renderer.domElement);

  // scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
  camera.position.set(0,1.6,6);

  // lights
  const hemi = new THREE.HemisphereLight(0x88bcd8, 0x202020, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(1,2,1);
  scene.add(dir);

  // floor
  const floorGeo = new THREE.PlaneGeometry(200,200);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true;
  scene.add(floor); colliders.push({mesh:floor, type:'floor'});

  // neon walls & obstacles
  const wallMat = new THREE.MeshStandardMaterial({ color:0x071028, metalness:0.1, roughness:0.6 });
  for(let i=0;i<12;i++){
    const b = new THREE.Mesh(new THREE.BoxGeometry(6,4,1), wallMat.clone());
    b.position.set((i-6)*6,2, -10 - (i%3)*10);
    b.material.color.offsetHSL(0,0, (i%2)*0.03 );
    scene.add(b); colliders.push({mesh:b, type:'wall'});
  }

  // simple neon light strips (visual only)
  const stripMat = new THREE.MeshBasicMaterial({ color:0x00f7ff, transparent:true, opacity:0.12 });
  for(let i=0;i<10;i++){
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4,0.6), stripMat);
    s.position.set(-24 + i*6, 1.8, -8 - (i%2)*6);
    s.rotation.y = 0.2 * (i%2?1:-1);
    scene.add(s);
  }

  // camera controls
  controls = new PointerLockControls(camera, renderer.domElement);
  document.addEventListener('click', ()=>{ if(!controls.isLocked) controls.lock(); });
  controls.addEventListener('lock', ()=>{ document.getElementById('hint').style.display='none'; });
  controls.addEventListener('unlock', ()=>{ document.getElementById('hint').style.display='block'; pauseScreen.classList.add('hidden'); });

  // movement state
  const moveState = { forward:false, back:false, left:false, right:false };
  document.addEventListener('keydown', (e)=>{
    if(e.code === 'Escape'){ controls.unlock(); pauseScreen.classList.remove('hidden'); }
    switch(e.code){
      case 'ArrowUp': case 'KeyW': moveState.forward = true; break;
      case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
      case 'ArrowDown': case 'KeyS': moveState.back = true; break;
      case 'ArrowRight': case 'KeyD': moveState.right = true; break;
      case 'Space': if(canJump){ velocity.y = 6; canJump=false; } break;
    }
  });
  document.addEventListener('keyup', (e)=>{
    switch(e.code){
      case 'ArrowUp': case 'KeyW': moveState.forward = false; break;
      case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
      case 'ArrowDown': case 'KeyS': moveState.back = false; break;
      case 'ArrowRight': case 'KeyD': moveState.right = false; break;
    }
  });
  controls.moveState = moveState;

  // shooting
  window.addEventListener('mousedown', (e)=>{ if(e.button === 0 && controls.isLocked) fire(); });

  // resize
  window.addEventListener('resize', onWindowResize);

  // spawn first wave
  nextWave();
}

function onWindowResize(){ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

// Weapons & shooting - projectile bullets (simple spheres)
function fire(){
  playBeep(1200,0.03,0.2);
  const muzzle = camera.position.clone();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  // recoil
  camera.rotation.x -= 0.01;

  // muzzle flash (a short-lived sprite)
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.06,6,6), new THREE.MeshBasicMaterial({color:0xffe066}));
  flash.position.copy(camera.position).add(dir.clone().multiplyScalar(0.6));
  scene.add(flash);
  setTimeout(()=>scene.remove(flash), 60);

  // bullet
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), new THREE.MeshBasicMaterial({color:0xffe066}));
  b.position.copy(muzzle).add(dir.clone().multiplyScalar(0.6));
  b.userData = { velocity: dir.clone().multiplyScalar(80), life: 1.5 };
  scene.add(b); bullets.push(b);
}

// Enemy spawn & simple AI
function spawnEnemyAt(x,z){
  const geo = new THREE.BoxGeometry(1,1.6,1);
  const mat = new THREE.MeshStandardMaterial({ color:0xff33aa, emissive:0x220011 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0.8, z);
  m.userData = { hp: 100, speed: 1 + Math.random()*0.6 };
  scene.add(m); enemies.push(m);
}

function nextWave(){
  wave += 1; waveVal.textContent = wave;
  const count = Math.min(12, 3 + Math.floor(wave*1.6));
  for(let i=0;i<count;i++){
    const x = (Math.random()-0.5)*60;
    const z = -20 - Math.random()*80 - wave*6;
    spawnEnemyAt(x,z);
  }
}

function removeEnemy(mesh){ scene.remove(mesh); const idx = enemies.indexOf(mesh); if(idx>=0) enemies.splice(idx,1); score += 10*wave; scoreVal.textContent = score; setTimeout(()=>{ if(Math.random()<0.7) spawnEnemyAt((Math.random()-0.5)*30, -10 - Math.random()*40); }, 1200+Math.random()*2000); }

// Simple collision helper (capsule vs box not implemented — distance checks)
function checkBulletHits(){
  for(const b of bullets.slice()){
    // move
    const dt = clock.getDelta();
    const vel = b.userData.velocity.clone().multiplyScalar(dt);
    b.position.add(vel);
    b.userData.life -= dt;
    if(b.userData.life <= 0){ scene.remove(b); bullets.splice(bullets.indexOf(b),1); continue; }

    // check enemies
    for(const e of enemies){
      const dist = b.position.distanceTo(e.position);
      if(dist < 0.9){
        e.userData.hp -= 60;
        flashHit(e);
        scene.remove(b); bullets.splice(bullets.indexOf(b),1);
        if(e.userData.hp <= 0) removeEnemy(e);
        break;
      }
    }
  }
}

function flashHit(mesh){ const old = mesh.material.color.getHex(); mesh.material.color.setHex(0xff4444); setTimeout(()=>mesh.material.color.setHex(old), 120); playBeep(240,0.04,0.25); }

// Main animate
function animate(){
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());

  // movement
  const speed = 6.5;
  const moveState = controls.moveState;
  direction.set(0,0,0);
  if(moveState.forward) direction.z -= 1;
  if(moveState.back) direction.z += 1;
  if(moveState.left) direction.x -= 1;
  if(moveState.right) direction.x += 1;
  direction.normalize();

  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  velocity.x += (forward.x * -direction.z + right.x * direction.x) * speed * delta;
  velocity.z += (forward.z * -direction.z + right.z * direction.x) * speed * delta;

  // gravity
  velocity.y -= 9.8 * delta;
  // damping
  velocity.x -= velocity.x * 8 * delta; velocity.z -= velocity.z * 8 * delta;

  // displacement
  const deltaPos = velocity.clone().multiplyScalar(delta);
  controls.getObject().position.add(deltaPos);

  // floor collision
  if(controls.getObject().position.y < 1.6){ velocity.y = 0; controls.getObject().position.y = 1.6; canJump = true; }

  // enemies AI
  for(const e of enemies){
    const dirToPlayer = controls.getObject().position.clone().sub(e.position);
    dirToPlayer.y = 0; const dist = dirToPlayer.length();
    if(dist > 0.7){ dirToPlayer.normalize(); e.position.addScaledVector(dirToPlayer, e.userData.speed * delta); }
    // damage player when close
    if(dist < 1.8){ hp -= 12 * delta; hp = Math.max(0, hp); hpElem.textContent = Math.round(hp); if(hp <= 0){ // respawn
      hp = 100; hpElem.textContent = hp; controls.getObject().position.set(0,1.6,6); }
    }
    // face player
    e.lookAt(controls.getObject().position.x, e.position.y, controls.getObject().position.z);
  }

  // bullets
  checkBulletHits();

  // increase difficulty slowly
  if(enemies.length === 0) nextWave();

  renderer.render(scene, camera);
}

// utility: basic occlusion / resize
window.addEventListener('resize', onWindowResize);

// simple helpful log for devs
console.log('Neon Siege upgraded starter loaded. Start from the Start screen.');
