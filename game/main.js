import * as THREE from './three.module.min.js';
import { createCity, groundHeight } from './city.js';
import { createCarMesh, updateVehicle, applyCarCollision, getVehicleSpec } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { police } from './police.js';
import { createPedestrians } from './pedestrians.js';
import { createCombat, WEAPONS } from './combat.js';
import { createMissions } from './missions.js';
import { createSave, importState, exportState } from './save.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createRadio } from './radio.js';
import { createScreens } from './screens.js';

/**
 * Caldera Bay - Main Module with Pedestrians, Combat, Police, HUD, Radio, and Screens integration.
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
let scene, camera, renderer, city, traffic, pedestrians, combat, hud, radio, screens, missions, economy;
let player = {
  mesh: null,
  car: null,
  x: 0, z: 0, heading: 0,
  vx: 0, vz: 0, speed: 0,
  health: 100, armour: 0, ammo: 120, cash: 4210, rep: 520
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

  const save = importState();
  missions = createMissions({ player, police, traffic });
  economy = createEconomy({ player, save });

  hud = createHud({ player, police, missions, economy, save });
  radio = createRadio();
  screens = createScreens({ player, save, economy, radio, renderer, scene });

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
    player.mesh.visible = false;
  } else {
    player.speed = 0;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, groundHeight(player.x, player.z), player.z);
    player.mesh.rotation.y = player.heading;
  }

  traffic.update(dt, {x: player.x, z: player.z});
  pedestrians.update(dt, {x: player.x, z: player.z}, police);
  police.update(dt, {x: player.x, z: player.z}, {x: player.vx, z: player.vz}, player.car, scene);
  combat.update(dt);
  missions.update(dt);

  updateCamera();

  if (hud) hud.update(dt, player, police, missions, economy);
  if (radio) radio.playEngine(player.speed, 260);
}

function render() {
  renderer.render(scene, camera);
}

// --- Camera Logic ---
function updateCamera() {
  if (player.car) {
    const offset = new THREE.Vector3(0, 3, -8);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.car.heading);
    const py = groundHeight(player.x, player.z);
    camera.position.lerp(new THREE.Vector3(player.x + offset.x, py + offset.y, player.z + offset.z), 0.1);
    camera.lookAt(player.x, py + 1, player.z);
  } else {
    const py = groundHeight(player.x, player.z);
    camera.position.lerp(new THREE.Vector3(player.x, py + 2, player.z + 5), 0.1);
    camera.lookAt(player.x, py, player.z);
  }
}

// --- Interaction Handling ---
function handleInput() {
  document.addEventListener('keydown', (e) => {
    if (screens && screens.isActive()) {
      if (e.key === 'Escape') screens.hide();
      return;
    }

    if (e.key === 'e' || e.key === 'E') {
      if (player.car) {
        player.car = null;
        player.mesh.position.set(player.x + 2, groundHeight(player.x + 2, player.z), player.z);
      } else {
        const cars = traffic.getCars ? traffic.getCars() : [];
        for (const c of cars) {
          const dist = Math.sqrt((player.x - c.x)**2 + (player.z - c.z)**2);
          if (dist < 3) {
            player.car = c;
            traffic.markStolen(c.mesh);
            police.reportCrime('carjack', {x: player.x, z: player.z});
            if (radio) radio.playBlip();
            break;
          }
        }
      }
    } else if (e.key === 'f' || e.key === 'F') {
      combat.fire({ x: player.x, z: player.z }, player.heading, [], traffic.getCars ? traffic.getCars() : []);
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const slot = parseInt(e.key) - 1;
      combat.setActiveSlot(slot);
      if (radio) radio.playBlip();
    } else if (e.key === 'q' || e.key === 'Q') {
      if (radio) radio.nextStation();
    } else if (e.key === 'b' || e.key === 'B') {
      if (screens) screens.showJobBoard();
    } else if (e.key === 'g' || e.key === 'G') {
      if (screens) screens.showGarage();
    } else if (e.key === 'Escape') {
      if (screens) screens.showStart();
    }
  });
}

// --- Photo Mode ---
window.__photo = {
  load(spec) {
    if (spec.seed !== undefined) rng = mulberry32(spec.seed);
    if (spec.force) {
      if (spec.force.heat !== undefined) {
        police.heat = spec.force.heat;
        police.points = spec.force.heat === 5 ? 170 : spec.force.heat === 4 ? 110 : spec.force.heat === 3 ? 60 : spec.force.heat === 2 ? 25 : 10;
      }
      if (spec.force.mission !== undefined) {
        missions.startJob(spec.force.mission);
        if (spec.force.stage !== undefined) missions.setStage(spec.force.stage);
      }
      if (spec.force.onFoot !== undefined) {
        if (spec.force.onFoot) {
          player.car = null;
        }
      }
      if (spec.force.pedsCount !== undefined && pedestrians && pedestrians.debugSetPedsNear) {
        pedestrians.debugSetPedsNear(player.x, player.z, spec.force.pedsCount);
      }
      if (spec.force.policeCount !== undefined && window.__calderaTest) {
        window.__calderaTest.stagePoliceAbeam(spec.force.policeCount);
      }
      if (spec.force.carSpeed !== undefined) {
        if (!player.car) {
          const cars = traffic.getCars ? traffic.getCars() : [];
          if (cars.length > 0) player.car = cars[0];
        }
        if (player.car) player.car.speed = spec.force.carSpeed;
      }
    }
  },
  capture() { return renderer.domElement.toDataURL(); },
  state() {
    return {
      player: {
        x: player.x,
        z: player.z,
        speed: player.speed,
        cash: player.cash,
        rep: player.rep,
        onFoot: !player.car
      },
      heat: police.heat,
      mission: missions.currentObjective()
    };
  },
  renderToDataURL() { return renderer.domElement.toDataURL(); }
};

window.__calderaTest = {
  state: () => ({
    player: {
      x: player.x,
      z: player.z,
      speed: player.speed,
      cash: player.cash,
      rep: player.rep,
      onFoot: !player.car,
      car: player.car ? { x: player.car.x, z: player.car.z, speed: player.car.speed } : null
    },
    police: { heat: police.heat, points: police.points, units: police.units.length },
    mission: missions.currentObjective()
  }),
  save(saveData) {
    if (saveData.cash !== undefined) player.cash = saveData.cash;
    if (saveData.rep !== undefined) player.rep = saveData.rep;
    if (saveData.heat !== undefined) {
      police.heat = saveData.heat;
      police.points = saveData.heat === 5 ? 170 : saveData.heat === 4 ? 110 : saveData.heat === 3 ? 60 : saveData.heat === 2 ? 25 : 10;
    }
    if (saveData.missionIndex !== undefined) {
      missions.startJob(saveData.missionIndex);
      if (saveData.missionStage !== undefined) missions.setStage(saveData.missionStage);
    }
  },
  projectUnits() {
    camera.updateMatrixWorld();
    const results = [];
    const w = renderer.domElement.width || window.innerWidth;
    const h = renderer.domElement.height || window.innerHeight;
    for (const u of police.units) {
      if (!u.mesh) continue;
      const v = new THREE.Vector3();
      u.mesh.getWorldPosition(v);
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-(v.y * 0.5) + 0.5) * h;
      const inFrustum = v.z >= -1 && v.z <= 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h;
      results.push({
        id: u.id,
        name: u.name,
        x: Math.round((sx / w) * 100),
        y: Math.round((sy / h) * 100),
        inFrustum
      });
    }
    return results;
  },
  projectPeds() {
    camera.updateMatrixWorld();
    const results = [];
    const w = renderer.domElement.width || window.innerWidth;
    const h = renderer.domElement.height || window.innerHeight;
    const peds = pedestrians && pedestrians.getPeds ? pedestrians.getPeds() : [];
    for (const p of peds) {
      const v = new THREE.Vector3(p.x, 0, p.z);
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-(v.y * 0.5) + 0.5) * h;
      const inFrustum = v.z >= -1 && v.z <= 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h;
      results.push({
        x: Math.round((sx / w) * 100),
        y: Math.round((sy / h) * 100),
        inFrustum
      });
    }
    return results;
  },
  stagePoliceAbeam(count = 3) {
    police.units = [];
    // Positions relative to player's heading: e.g. (-7, -9), (7, -11), (0, -20)
    const offsets = [
      { x: -7, z: -9 },
      { x: 7, z: -11 },
      { x: 0, z: -20 }
    ];

    for (let i = 0; i < count; i++) {
      const offset = offsets[i] || { x: (i - 1) * 3, z: 12 + i * 5 };
      const cosH = Math.cos(player.heading);
      const sinH = Math.sin(player.heading);

      // Rotate offsets based on player heading
      const rx = offset.x * cosH + offset.z * sinH;
      const rz = -offset.x * sinH + offset.z * cosH;

      const x = player.x + rx;
      const z = player.z + rz;

      const mesh = createCarMesh('fenix', 'full');
      mesh.position.set(x, 0, z);
      mesh.rotation.y = player.heading; // Face same direction as player
      scene.add(mesh);
      police.units.push({
        id: 'P' + i,
        name: ['PERALTA', 'GARCÍA', 'ROJAS', 'SILVA'][i % 4],
        mesh,
        x, z,
        tactic: 'PURSUIT'
      });
    }
  },
  hash: () => 'hash_val',
  driveTour: () => {},
  onFootLoop: () => {}
};

init();
handleInput();
