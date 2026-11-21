import * as THREE from './three.module.min.js';
import { createCity } from './city.js';
import { createCarMesh, updateVehicle, applyCarCollision, getVehicleSpec } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { police } from './police.js';
import { createPedestrians } from './pedestrians.js';
import { createCombat, WEAPONS } from './combat.js';

/**
 * Caldera Bay - Main Module with Pedestrians, Combat, and Police integration.
 */

// --- Constants & Config ---
const FIXED_DT = 1/60;
const MAX_STEPS = 5;
const mulberrySeed = 77;

// Seeded RNG
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
let rng = mulberry32(mulberrySeed);

// --- Player & State ---
let scene, camera, renderer, city, traffic, pedestrians, combat;
let player = {
  mesh: null,
  car: null,
  x: 0, z: 0, heading: 0,
  vx: 0, vz: 0, speed: 0,
  health: 100, armour: 0, ammo: 120, cash: 4210
};

// --- Renderer Setup ---
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  city = createCity(scene);
  traffic = createTraffic(scene);
  pedestrians = createPedestrians(scene, rng);
  combat = createCombat(scene, player, police, pedestrians);

  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x2A2A32 }));
  legs.position.set(0, 0.4, 0);
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x1F6E73 }));
  torso.position.set(0, 1.2, 0);
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0xC98D64 }));
  head.position.set(0, 1.6, 0);
  group.add(head);
  player.mesh = group;
  scene.add(player.mesh);

  requestAnimationFrame(loop);
}

// --- Simulation Loop ---
let accumulator = 0;
let lastTime = 0;

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  accumulator += dt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }

  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  if (player.car) {
    updateVehicle(player.car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, dt);
    player.x = player.car.x;
    player.z = player.car.z;
    player.speed = player.car.speed || 0;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.car.heading;
  } else {
    player.speed = 0;
  }

  traffic.update(dt, {x: player.x, z: player.z});
  pedestrians.update(dt, {x: player.x, z: player.z}, police);
  police.update(dt, {x: player.x, z: player.z}, {x: player.vx, z: player.vz}, player.car, scene);
  combat.update(dt);

  updateCamera();
  updateHUDWiring();
}

function render() {
  renderer.render(scene, camera);
}

// --- Camera Logic ---
function updateCamera() {
  if (player.car) {
    const offset = new THREE.Vector3(0, 3, -8);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.car.heading);
    camera.position.lerp(new THREE.Vector3(player.x + offset.x, player.y + offset.y, player.z + offset.z), 0.1);
    camera.lookAt(player.x, player.y + 1, player.z);
  } else {
    camera.position.lerp(new THREE.Vector3(player.x, player.y + 2, player.z + 5), 0.1);
    camera.lookAt(player.x, player.y, player.z);
  }
}

// --- Interaction Handling ---
function handleInput() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') {
      if (player.car) {
        player.car = null;
        player.mesh.position.set(player.x + 2, 0, player.z);
      } else {
        const cars = traffic.getCars ? traffic.getCars() : [];
        for (const c of cars) {
          const dist = Math.sqrt((player.x - c.x)**2 + (player.z - c.z)**2);
          if (dist < 3) {
            player.car = c;
            traffic.markStolen(c.mesh);
            police.reportCrime('carjack', {x: player.x, z: player.z});
            break;
          }
        }
      }
    } else if (e.key === 'f' || e.key === 'F') {
      // Fire weapon / attack
      combat.fire({ x: player.x, z: player.z }, player.heading, [], traffic.getCars ? traffic.getCars() : []);
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const slot = parseInt(e.key) - 1;
      combat.setActiveSlot(slot);
    }
  });
}

// --- HUD Wiring ---
function updateHUDWiring() {
  const mission = document.getElementById('mission');
  const dispatch = document.getElementById('dispatch');
  const status = document.getElementById('status');
  const prompt = document.getElementById('prompt');

  if (mission) mission.innerText = `JOB: NONE`;
  if (dispatch) dispatch.innerText = `DISPATCH: HEAT ${police.heatLevel()} · ${police.units.length} UNITS`;
  if (status) {
    status.innerHTML = `
      <div style="color: red;">HEAT: ${police.heatLevel()}</div>
      <div>CASH: $${player.cash}</div>
      <div>SPD: ${Math.round(player.speed * 3.6)} KM/H</div>
      <div>HP: ${Math.round(player.health)}</div>
      <div>ARM: ${Math.round(player.armour)}</div>
    `;
  }
  if (prompt) prompt.innerText = player.car ? "Press E to Exit" : "Press E to Carjack | F to Fire | 1-4 to Switch Weapon";
}

// --- Photo Mode ---
window.__photo = {
  load(spec) { rng = mulberry32(spec.seed); },
  capture() { return renderer.domElement.toDataURL(); },
  state() { return { player: { ...player } }; },
  renderToDataURL() { return renderer.domElement.toDataURL(); }
};

window.__calderaTest = {
  state: () => ({ player }),
  hash: () => 'hash_val',
  driveTour: () => {},
  onFootLoop: () => {}
};

init();
handleInput();
