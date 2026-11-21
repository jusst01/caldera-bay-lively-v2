import * as THREE from './three.module.min.js';

/**
 * Caldera Bay - Vehicles Module
 * Implements the 12-car roster, arcade physics core, damage, durability,
 * and V2 3D mesh recipes (full and std tiers, glow textures, heli).
 */

export const VEHICLES = [
  { id: 'colibri', name: 'Colibrí', class: 'compact', topSpeed: 130, zeroTo100: 9.5, grip: 0.72, mass: 900, chop: 50, tier: 'std' },
  { id: 'sirena', name: 'Sirena', class: 'taxi', topSpeed: 150, zeroTo100: 8.0, grip: 0.75, mass: 1200, chop: 80, tier: 'std', taxi: true },
  { id: 'caiman', name: 'Caimán', class: 'van', topSpeed: 120, zeroTo100: 10.5, grip: 0.65, mass: 1900, chop: 100, tier: 'std', van: true },
  { id: 'mula', name: 'Mula 4x4', class: 'pickup', topSpeed: 140, zeroTo100: 8.8, grip: 0.80, mass: 1600, chop: 120, tier: 'std', pickup: true },
  { id: 'boxer', name: 'Bóxer', class: 'truck', topSpeed: 95, zeroTo100: 13.0, grip: 0.55, mass: 3200, chop: 90, tier: 'std', truck: true },
  { id: 'fantasma', name: 'Fantasma', class: 'luxury', topSpeed: 180, zeroTo100: 6.0, grip: 0.78, mass: 1600, chop: 300, tier: 'full' },
  { id: 'corsario', name: 'Corsario S', class: 'muscle', topSpeed: 190, zeroTo100: 5.2, grip: 0.70, mass: 1500, chop: 220, tier: 'full', muscle: true },
  { id: 'zorro-gt', name: 'Zorro GT', class: 'sports', topSpeed: 220, zeroTo100: 4.1, grip: 0.85, mass: 1300, chop: 320, tier: 'full', sports: true },
  { id: 'relampago', name: 'Relámpago', class: 'super', topSpeed: 260, zeroTo100: 3.2, grip: 0.90, mass: 1200, chop: 400, tier: 'full', super: true },
  { id: 'fenix', name: 'Fénix', class: 'police', topSpeed: 200, zeroTo100: 4.8, grip: 0.82, mass: 1500, chop: 0, police: true, tier: 'full' },
  { id: 'perro', name: 'Perro', class: 'swat', topSpeed: 150, zeroTo100: 7.0, grip: 0.75, mass: 2600, chop: 0, swat: true, tier: 'full' },
  { id: 'halcon', name: 'Halcón', class: 'heli', topSpeed: 0, zeroTo100: 0, grip: 0, mass: 0, chop: 0, heli: true, tier: 'full' }
];

export function getVehicleSpec(id) {
  if (!id) return VEHICLES[7]; // Default Zorro GT
  const clean = id.toLowerCase().replace(/[\s_-]+/g, '');
  const found = VEHICLES.find(v => v.id.replace(/-/g, '') === clean || v.name.toLowerCase().replace(/[\s_-]+/g, '') === clean || v.class === clean);
  return found || VEHICLES[7];
}

// Paint colours map
const PAINT_COLORS = {
  'colibri': 0xD9A05B,
  'sirena': 0xF2B441,
  'caiman': 0x7C8894,
  'mula': 0x4C8A57,
  'boxer': 0xB4552D,
  'fantasma': 0x2E3A5C,
  'corsario': 0xC8402F,
  'zorro-gt': 0xFF7E5F,
  'relampago': 0xFF5E8A,
  'fenix': 0xE8E4DA,
  'perro': 0x3E3A45
};

// Shared radial glow texture helper
let cachedGlowTex = null;
function getRadialGlowTexture() {
  if (cachedGlowTex) return cachedGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  cachedGlowTex = new THREE.CanvasTexture(canvas);
  return cachedGlowTex;
}

export function addGlow(parent, color, scale = 1, x = 0, y = 0, z = 0) {
  const spriteMat = new THREE.SpriteMaterial({
    map: getRadialGlowTexture(),
    color: color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(x, y, z);
  parent.add(sprite);
  return sprite;
}

// Tapered box geometry helper
function taperBox(w, h, d, sx, sz) {
  const geom = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    if (py > 0) {
      pos.setX(i, pos.getX(i) * sx);
      pos.setZ(i, pos.getZ(i) * sz);
    }
  }
  geom.computeVertexNormals();
  return geom;
}

// Wheel builder helper
function createWheelGroup() {
  const wheelGroup = new THREE.Group();
  const tyreGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  tyreGeom.rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95 });
  const tyreMesh = new THREE.Mesh(tyreGeom, tyreMat);
  wheelGroup.add(tyreMesh);

  const rimGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 8);
  rimGeom.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xC9CDD4, metalness: 0.9, roughness: 0.25 });
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  wheelGroup.add(rimMesh);

  return wheelGroup;
}

export function createCarMesh(specId, tier = 'std') {
  const spec = getVehicleSpec(specId);
  const group = new THREE.Group();
  const isFull = tier === 'full' || spec.tier === 'full';

  const paintColor = PAINT_COLORS[spec.id] || 0x3E3A45;
  const paintMat = isFull ?
    new THREE.MeshStandardMaterial({ color: paintColor, metalness: 0.55, roughness: 0.34, envMapIntensity: 0.9 }) :
    new THREE.MeshStandardMaterial({ color: paintColor, metalness: 0.3, roughness: 0.42 });

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0C1016, metalness: 0.9, roughness: 0.18, envMapIntensity: 1.2 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xD8D8DC, metalness: 1.0, roughness: 0.25 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xFFF6D8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xFF2418 });

  if (isFull) {
    // Tapered body
    const bodyGeom = taperBox(1.9, 0.62, 4.4, 0.85, 0.82);
    const body = new THREE.Mesh(bodyGeom, paintMat);
    body.position.set(0, 0.52, 0);
    group.add(body);

    // Hood wedge (+z front)
    const hoodGeom = taperBox(1.85, 0.32, 1.4, 0.9, 0.7);
    const hood = new THREE.Mesh(hoodGeom, paintMat);
    hood.position.set(0, 0.68, 1.1);
    hood.rotation.x = 0.07; // +4 deg
    group.add(hood);

    // Tapered glass cabin
    const cabinGeom = taperBox(1.7, 0.55, 2.1, 0.8, 0.75);
    const cabin = new THREE.Mesh(cabinGeom, glassMat);
    cabin.position.set(0, 0.92, -0.1);
    group.add(cabin);

    // Bumpers & grille
    const bumperGeom = new THREE.BoxGeometry(1.95, 0.22, 0.3);
    const frontBumper = new THREE.Mesh(bumperGeom, chromeMat);
    frontBumper.position.set(0, 0.36, 2.22);
    group.add(frontBumper);

    const rearBumper = new THREE.Mesh(bumperGeom, chromeMat);
    rearBumper.position.set(0, 0.36, -2.22);
    group.add(rearBumper);

    // Headlights + glow
    const headGeom = new THREE.BoxGeometry(0.35, 0.18, 0.1);
    const lHead = new THREE.Mesh(headGeom, lampMat);
    lHead.position.set(-0.7, 0.52, 2.26);
    group.add(lHead);
    addGlow(group, 0xFFF6D8, 0.85, -0.7, 0.52, 2.3);

    const rHead = new THREE.Mesh(headGeom, lampMat);
    rHead.position.set(0.7, 0.52, 2.26);
    group.add(rHead);
    addGlow(group, 0xFFF6D8, 0.85, 0.7, 0.52, 2.3);

    // Tail bar + glow
    const tailGeom = new THREE.BoxGeometry(1.7, 0.14, 0.1);
    const tailBar = new THREE.Mesh(tailGeom, tailMat);
    tailBar.position.set(0, 0.58, -2.26);
    group.add(tailBar);
    addGlow(group, 0xFF2418, 1.3, 0, 0.58, -2.3);

    // Special class additions
    if (spec.sports || spec.super) {
      const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.4), chromeMat);
      spoilerWing.position.set(0, 0.98, -1.8);
      group.add(spoilerWing);
    } else if (spec.muscle) {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.8), chromeMat);
      scoop.position.set(0, 0.86, 1.2);
      group.add(scoop);
    } else if (spec.taxi) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), new THREE.MeshBasicMaterial({ color: 0xFFF2CC }));
      sign.position.set(0, 1.25, 0);
      group.add(sign);
    } else if (spec.police) {
      // Two-tone hood/trunk + door band + light bar
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x1A1A1A }));
      barBase.position.set(0, 1.26, 0);
      group.add(barBase);
      const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: 0xFF1A1A }));
      redLens.position.set(-0.25, 1.3, 0);
      group.add(redLens);
      addGlow(group, 0xFF1A1A, 1.6, -0.25, 1.3, 0);

      const blueLens = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: 0x1A3AFF }));
      blueLens.position.set(0.25, 1.3, 0);
      group.add(blueLens);
      addGlow(group, 0x1A3AFF, 1.6, 0.25, 1.3, 0);
    }

  } else {
    // Std tier (~11 meshes)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.2), paintMat);
    body.position.set(0, 0.5, 0);
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), glassMat);
    cabin.position.set(0, 0.88, -0.2);
    group.add(cabin);

    const lHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.1), lampMat);
    lHead.position.set(-0.65, 0.5, 2.15);
    group.add(lHead);

    const rHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.1), lampMat);
    rHead.position.set(0.65, 0.5, 2.15);
    group.add(rHead);
  }

  // Wheels (4 or 6 for truck)
  const wheelPositions = [
    [-0.92, 0.36, 1.42],
    [0.92, 0.36, 1.42],
    [-0.92, 0.36, -1.42],
    [0.92, 0.36, -1.42]
  ];
  if (spec.truck) {
    wheelPositions.push([-0.92, 0.36, -2.0], [0.92, 0.36, -2.0]);
  }

  for (const pos of wheelPositions) {
    const wGroup = createWheelGroup();
    wGroup.position.set(...pos);
    group.add(wGroup);
  }

  return group;
}

export function createHeliMesh() {
  const group = new THREE.Group();
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x1C2833, metalness: 0.5, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0C1016, metalness: 0.9, roughness: 0.2 });

  // Fuselage
  const fuselage = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), navyMat);
  fuselage.scale.set(0.95, 0.85, 2.3);
  group.add(fuselage);

  // Glass nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), glassMat);
  nose.position.set(0, -0.1, 1.3);
  group.add(nose);

  // Tail boom & fin
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 3.2, 8), navyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.2, -2.2);
  group.add(boom);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.5), navyMat);
  fin.position.set(0, 0.6, -3.6);
  group.add(fin);

  // Skids
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x2A2A30, metalness: 0.8 });
  const skidGeom = new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8);
  skidGeom.rotateX(Math.PI / 2);
  const lSkid = new THREE.Mesh(skidGeom, skidMat);
  lSkid.position.set(-0.7, -0.7, 0);
  group.add(lSkid);
  const rSkid = new THREE.Mesh(skidGeom, skidMat);
  rSkid.position.set(0.7, -0.7, 0);
  group.add(rSkid);

  // Main rotor + blur disc
  const rotorBar = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 0.2), skidMat);
  rotorBar.position.set(0, 1.15, 0);
  group.add(rotorBar);

  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 16),
    new THREE.MeshBasicMaterial({ color: 0xAAAAAA, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  blurDisc.rotation.x = Math.PI / 2;
  blurDisc.position.set(0, 1.13, 0);
  group.add(blurDisc);

  // Spotlight cone
  const spotGeom = new THREE.ConeGeometry(5, 14, 12, 1, true);
  spotGeom.rotateX(-Math.PI / 2);
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xFFFEE0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const spotlight = new THREE.Mesh(spotGeom, spotMat);
  spotlight.position.set(0, -1.2, 6);
  group.add(spotlight);

  return group;
}

export function updateVehicle(car, inputs, dt) {
  if (car.dead || (car.durability !== undefined && car.durability <= 0)) {
    car.durability = 0;
    car.dead = true;
    car.speed = 0;
    return;
  }

  const spec = car.spec || getVehicleSpec(car.specId);
  const maxSpeedMs = spec.topSpeed / 3.6;
  const accel = spec.zeroTo100 > 0 ? (100 / 3.6) / spec.zeroTo100 : 8;

  let targetForce = 0;
  if (inputs.throttle > 0) {
    targetForce = inputs.throttle * accel * spec.mass;
  } else if (inputs.brake > 0) {
    targetForce = -inputs.brake * accel * 1.5 * spec.mass;
  } else {
    targetForce = -Math.sign(car.speed) * 0.12 * spec.mass;
  }

  const drag = 0.5 * 0.3 * 2.2 * car.speed * Math.abs(car.speed);
  const netForce = targetForce - drag;
  const acceleration = netForce / spec.mass;

  car.speed += acceleration * dt;
  if (inputs.throttle === 0 && inputs.brake === 0 && Math.abs(car.speed) < 0.2) {
    car.speed = 0;
  }

  if (car.speed > maxSpeedMs) car.speed = maxSpeedMs;
  if (car.speed < -maxSpeedMs * 0.3) car.speed = -maxSpeedMs * 0.3;

  if (Math.abs(car.speed) > 0.5) {
    let grip = spec.grip;
    if (inputs.handbrake) grip = 0.35;
    const turnRate = 2.4 * (car.speed / maxSpeedMs) * grip * inputs.steer;
    car.heading += turnRate * dt;
  }

  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);

  car.vx = forwardX * car.speed;
  car.vz = forwardZ * car.speed;

  car.x += car.vx * dt;
  car.z += car.vz * dt;
}

export function applyCarCollision(carA, carB, relSpeed) {
  const massA = carA.spec ? carA.spec.mass : 1300;
  const massB = carB.spec ? carB.spec.mass : 1300;
  const massRatio = massB / (massA + massB);
  const damage = relSpeed * massRatio * 0.12;
  if (carA.durability !== undefined) {
    carA.durability = Math.max(0, carA.durability - damage);
    if (carA.durability <= 0) {
      carA.dead = true;
      carA.speed = 0;
    }
  }
}
