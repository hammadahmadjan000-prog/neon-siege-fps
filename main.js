// main.js - Realistic mode upgrade: GLTF player, PBR environment, improved movement and animation blending
// Notes:
// - This script attempts to load `assets/models/player.glb` and an HDRI at `assets/env/env.hdr`.
// - If those files are not present, it will try common public fallbacks. For best results download models and HDRIs and place them in the assets/ directory.

import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.162.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://unpkg.com/three@0.162.0/examples/jsm/loaders/RGBELoader.js';
import { PMREMGenerator } from 'https://unpkg.com/three@0.162.0/src/extras/PMREMGenerator.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/PointerLockControls.js';

// UI bindings
const startBtn = document.getElementById('startBtn');
const enableSoundCb = document.getElementById('enableSound');
const hud = document.getElementById('hud');
const hpElem = document.getElementById('hp');
const scoreVal = document.getElementById('scoreVal');
const waveVal = document.getElementById('waveVal');
const ammoVal = document.getElementById('ammoVal');
const magVal = document.getElementById('magVal');
const weaponNameElem = document.getElementById('weaponName');
const statusElem = document.getElementById('statusVal');

let scene, camera, renderer, controls, clock;
let mixer = null; // animation mixer for player
let playerModel = null; // 3D model
let currentAction = null;
let actions = {};
let pmremGenerator;

// movement
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const moveState = { forward:false, back:false, left:false, right:false };
let canJump = false;

// gameplay state (reuse advanced game state shape)
let game = {
  score: 0,
  wave: 0,
  hp: 100,
  ammo: 30,
  maxAmmo: 30,
  currentWeapon: 'Pulse Rifle'
};

// loaders
const gltfLoader = new GLTFLoader();
const rgbeLoader = new RGBELoader();

// Asset fallbacks (you can replace with local files in /assets/...)
const PLAYER_GLTF_FALLBACK = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Soldier/glTF-Binary/Soldier.glb';
const HDR_FALLBACK = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/royal_esplanade_1k.hdr';

async function init() {
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio ? Math.min(window.devicePixelRatio, 2) : 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.position.set(0, 1.72, 6);

  // simple ambient + directional
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(5,10,7);
  dir.castShadow = true;
  scene.add(dir);

  // PMREM for HDR environment
  pmremGenerator = new PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  // load HDR environment (async)
  await loadEnvironment();

  // floor with PBR roughness map look
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x22272b, metalness: 0.2, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300,300), floorMat);
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; floor.position.y = 0;
  scene.add(floor);

  // arena details (procedural pillars)
  addEnvironmentDetails();

  // controls: pointerlock for FPS interactions
  controls = new PointerLockControls(camera, renderer.domElement);
  document.addEventListener('click', () => { if (!controls.isLocked) controls.lock(); });

  // try load player model
  await loadPlayerModel();

  // input
  bindInputs();

  window.addEventListener('resize', onWindowResize);

  animate();
}

async function loadEnvironment(){
  // prefer local asset if exists
  const candidates = [
    'assets/env/env.hdr',
    HDR_FALLBACK
  ];
  for (const url of candidates) {
    try {
      const tex = await new Promise((resolve, reject) => rgbeLoader.load(url, r => resolve(r), undefined, e => reject(e)));
      const envMap = pmremGenerator.fromEquirectangular(tex).texture;
      scene.environment = envMap;
      scene.background = envMap; // gives HDR backdrop feel
      tex.dispose();
      console.log('Loaded environment:', url);
      return;
    } catch (e) { console.warn('HDR load failed:', url, e); continue; }
  }
  console.warn('No HDR environment loaded — continuing without PBR environment.');
}

function addEnvironmentDetails(){
  const pillarGeo = new THREE.CylinderGeometry(0.6,0.6,6,16);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x101416, metalness: 0.1, roughness: 0.8 });
  for (let i=0;i<16;i++){
    const a = (i/16)*Math.PI*2;
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(Math.cos(a)*12, 3, Math.sin(a)*12);
    scene.add(p);
  }
}

async function loadPlayerModel(){
  const candidates = [
    'assets/models/player.glb',
    PLAYER_GLTF_FALLBACK
  ];
  for (const url of candidates){
    try{
      const gltf = await new Promise((resolve,reject)=> gltfLoader.load(url, g=>resolve(g), undefined, e=>reject(e)));
      playerModel = gltf.scene;
      playerModel.traverse(n=>{ if (n.isMesh){ n.castShadow=true; n.receiveShadow=true; n.material.metalness = n.material.metalness ?? 0.1; n.material.roughness = n.material.roughness ?? 0.8; n.material.needsUpdate = true; }});
      // place model in the world slightly in front of camera (first-person arms/hands compatibility depends on model)
      playerModel.position.set(0,0,0);
      scene.add(playerModel);
      console.log('Loaded player model from', url);

      if (gltf.animations && gltf.animations.length){
        mixer = new THREE.AnimationMixer(playerModel);
        // try to map animations by name (common sample Soldier uses Walk, Run, Idle)
        gltf.animations.forEach(clip=>{
          actions[clip.name] = mixer.clipAction(clip);
        });
        // start idle if available
        if (actions['Idle']){ actions['Idle'].play(); currentAction = 'Idle'; }
        else if (gltf.animations[0]){ actions[gltf.animations[0].name] = mixer.clipAction(gltf.animations[0]); actions[gltf.animations[0].name].play(); currentAction = gltf.animations[0].name; }
      }

      return;
    }catch(e){ console.warn('Player GLTF load failed:', url, e); continue; }
  }
  // fallback: procedural humanoid
  const human = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b6b63, metalness: 0.05, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.9,0.35), mat);
  torso.position.y = 1.1; human.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), mat); head.position.y = 1.78; human.add(head);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.8,0.2), mat); leg.position.set(-0.18,0.4,0); human.add(leg.clone()); leg.position.x=0.18; human.add(leg);
  human.position.set(0,0,0); scene.add(human); playerModel = human;
  console.log('Using procedural fallback player model');
}

function bindInputs(){
  document.addEventListener('keydown', e=>{
    if (e.code === 'KeyW') moveState.forward = true;
    if (e.code === 'KeyS') moveState.back = true;
    if (e.code === 'KeyA') moveState.left = true;
    if (e.code === 'KeyD') moveState.right = true;
    if (e.code === 'Space' && canJump){ velocity.y = 6; canJump=false; }
    if (e.code === 'KeyR') { game.ammo = game.maxAmmo; updateHud(); }
  });
  document.addEventListener('keyup', e=>{
    if (e.code === 'KeyW') moveState.forward = false;
    if (e.code === 'KeyS') moveState.back = false;
    if (e.code === 'KeyA') moveState.left = false;
    if (e.code === 'KeyD') moveState.right = false;
  });
  window.addEventListener('mousedown', e=>{ if (e.button===0) fire(); });
}

function fire(){
  // simple raycast shoot with visual projectile
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  // muzzle visual
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), new THREE.MeshBasicMaterial({ color: 0xffe07a }));
  m.position.copy(camera.position).add(dir.clone().multiplyScalar(0.8)); scene.add(m); setTimeout(()=>scene.remove(m),60);
  // projectile
  const proj = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), new THREE.MeshStandardMaterial({ color:0xffe07a, emissive:0x442200 }));
  proj.position.copy(camera.position).add(dir.clone().multiplyScalar(0.8)); proj.userData = { vel: dir.clone().multiplyScalar(120), life: 1.6 };
  scene.add(proj); bullets.push(proj);
}

function updateProjectiles(dt){
  for (let i=bullets.length-1;i>=0;i--){ const b=bullets[i]; b.position.addScaledVector(b.userData.vel, dt); b.userData.life -= dt; if (b.userData.life<=0){ scene.remove(b); bullets.splice(i,1); } }
}

function updatePlayerMovement(dt){
  const speed = 6.5;
  direction.set(0,0,0);
  if (moveState.forward) direction.z -= 1;
  if (moveState.back) direction.z += 1;
  if (moveState.left) direction.x -= 1;
  if (moveState.right) direction.x += 1;
  direction.normalize();

  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  velocity.x += (forward.x * -direction.z + right.x * direction.x) * speed * dt;
  velocity.z += (forward.z * -direction.z + right.z * direction.x) * speed * dt;
  velocity.y -= 9.8 * dt;
  velocity.x -= velocity.x * 8 * dt; velocity.z -= velocity.z * 8 * dt;

  // displacement
  const deltaPos = velocity.clone().multiplyScalar(dt);
  controls.getObject().position.add(deltaPos);
  if (controls.getObject().position.y < 1.72){ velocity.y = 0; controls.getObject().position.y = 1.72; canJump = true; }

  // camera bob & model blending
  if (mixer) mixer.update(dt);
  if (playerModel){
    // attach model position to camera for first-person arms/head alignment if model has bones
    playerModel.position.copy(controls.getObject().position).add(new THREE.Vector3(0, -1.6, -0.3));
  }
}

function updateHud(){ hpElem.textContent = Math.round(game.hp); scoreVal.textContent = game.score; waveVal.textContent = game.wave; ammoVal.textContent = game.ammo; magVal.textContent = game.maxAmmo; weaponNameElem.textContent = game.currentWeapon; statusElem.textContent = 'Realistic Mode'; }

function onWindowResize(){ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

function animate(){ requestAnimationFrame(animate); const dt = Math.min(0.05, clock.getDelta()); updatePlayerMovement(dt); updateProjectiles(dt); renderer.render(scene, camera); }

startBtn.addEventListener('click', async ()=>{ enableSoundCb.checked ? initAudio() : null; startBtn.disabled = true; await init(); hud.classList.remove('hidden'); });

function initAudio(){ try{ const ctx = new (window.AudioContext||window.webkitAudioContext)(); masterGain = ctx.createGain(); masterGain.connect(ctx.destination); masterGain.gain.value = 0.3; audioCtx = ctx; playTone(220,0.12,0.06,'sine'); }catch(e){ console.warn('Audio init failed', e); } }

function playTone(freq,dur,vol,type){ if(!audioCtx) return; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type=type;o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(masterGain); o.start(); o.stop(audioCtx.currentTime+dur); }

console.log('Realistic mode script loaded. Click Deploy to start.');