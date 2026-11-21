import * as THREE from './three.module.min.js';

// --- Constants & Config ---
const GRID_SIZE = 18;
const BLOCK_SIZE = 64;
const CITY_SIZE = GRID_SIZE * BLOCK_SIZE; // 1152

const DISTRICTS = {
  muelle: { id: 'muelle', center: [-300, 300] },
  paseo: { id: 'paseo', center: [330, 60] },
  verde: { id: 'verde', center: [300, -300] },
  ceniza: { id: 'ceniza', center: [-300, -300] },
  cumbre: { id: 'cumbre', center: [0, -500] }
};

// Seeded RNG
let mulberrySeed = 12345;
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
let rng = mulberry32(mulberrySeed);

// --- Exports ---

export function districtAt(x, z) {
  let closest = null;
  let minDistance = Infinity;
  for (const key in DISTRICTS) {
    const d = DISTRICTS[key];
    const dist = Math.sqrt((x - d.center[0]) ** 2 + (z - d.center[1]) ** 2);
    if (dist < minDistance) {
      minDistance = dist;
      closest = d.id;
    }
  }
  return closest;
}

export function groundHeight(x, z) {
  // Heightfield values kept as is
  if (z < -400) return 40;
  if (x > 200 && z < -100) return 30;
  return 0;
}

const LOTS = []; // AABBs for collideCircle

export function collideCircle(x, z, r) {
  for (const lot of LOTS) {
    // AABB check
    if (x + r > lot.x - lot.w/2 && x - r < lot.x + lot.w/2 &&
        z + r > lot.z - lot.d/2 && z - r < lot.z + lot.d/2) {
      return true;
    }
  }
  return false;
}

export function eject(x, z, radius) {
  // Simple push out
  for (const lot of LOTS) {
    if (Math.abs(x - lot.x) < lot.w/2 + radius && Math.abs(z - lot.z) < lot.d/2 + radius) {
      // push out along smallest penetration axis
      const dx = x - lot.x;
      const dz = z - lot.z;
      const ox = (lot.w/2 + radius) - Math.abs(dx);
      const oz = (lot.d/2 + radius) - Math.abs(dz);
      if (ox < oz) x += dx > 0 ? ox : -ox;
      else z += dz > 0 ? oz : -oz;
    }
  }
  return { x, z };
}

export function setFinaleDusk(on) {
  // Shift colors
}

// --- World Builder ---

export function createCity(scene) {
  // Ocean plane
  const oceanGeom = new THREE.PlaneGeometry(3000, 3000);
  const oceanMat = new THREE.MeshBasicMaterial({ color: 0x1F6E73 });
  const ocean = new THREE.Mesh(oceanGeom, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.4;
  scene.add(ocean);

  // Ground plane
  const groundGeom = new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x7A5F42 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Light Rig
  const dirLight = new THREE.DirectionalLight(0xFFB066, 2.2);
  dirLight.position.set(-120, 95, 260);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -130;
  dirLight.shadow.camera.right = 130;
  dirLight.shadow.camera.top = 130;
  dirLight.shadow.camera.bottom = -130;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.bias = -0.0004;
  dirLight.shadow.normalBias = 0.03;
  scene.add(dirLight);
  scene.add(dirLight.target);

  const ambient = new THREE.HemisphereLight(0xFFD9A0, 0x4A5568, 0.55);
  scene.add(ambient);

  scene.fog = new THREE.FogExp2(0xF2A65A, 0.0016);

  // Buildings
  const facadeGeom = new THREE.BoxGeometry(1, 1, 1);
  const facadeMat = new THREE.MeshStandardMaterial({ envMapIntensity: 0.25 });
  const buildingMesh = new THREE.InstancedMesh(facadeGeom, facadeMat, 800);
  scene.add(buildingMesh);

  // Volcano
  const coneGeom = new THREE.ConeGeometry(220, 220, 12);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0x3E3A45 });
  const volcano = new THREE.Mesh(coneGeom, coneMat);
  volcano.position.set(0, 110, -500);
  scene.add(volcano);

  // Populate buildings and stores for collideCircle
  for (let i = 0; i < 800; i++) {
    const x = rng() * CITY_SIZE - CITY_SIZE/2;
    const z = rng() * CITY_SIZE - CITY_SIZE/2;
    const w = 14 + rng() * 20;
    const h = 8 + rng() * 20;
    const d = 14 + rng() * 20;
    LOTS.push({x, z, w, d});
    const matrix = new THREE.Matrix4();
    matrix.compose(new THREE.Vector3(x, h/2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    buildingMesh.setMatrixAt(i, matrix);
  }

  // Palms and Lamps placeholders
  // ... (Full implementation would be larger)

  return {
    update: (dt, subject) => {
      dirLight.position.set(subject.x - 120, subject.y + 95, subject.z + 260);
      dirLight.target.position.set(subject.x, subject.y, subject.z);
      dirLight.target.updateMatrixWorld();
    }
  };
}
