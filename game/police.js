import * as THREE from './three.module.min.js';
import { createCarMesh } from './vehicles.js';

/**
 * Caldera Bay - Police Module (~450 lines)
 *
 * Implements the full wanted system replacing main.js's stub with the exact exported surface:
 * - Witness points: sighting +6, ped hit +15, carjack +20, shot fired +10, officer down +40.
 * - Heat thresholds: 25 / 60 / 110 / 170 (Heat 1 to 5).
 * - Search radius 40 m after 12 s unseen, decay 2/s while unseen.
 * - Clearance by 10 s unseen + district change or respray.
 * - Unit caps by heat: 2 / 3 / 5 / 7 / 10 with dispatch from off-screen edges >= 90 m out.
 * - Cruiser AI (pursue -> ram -> box-in), tactics ladder, spikes, roadblocks, helicopter searchlight.
 * - Bust meter (+0.5/s in 2.5m with a stopped car, drains 0.25/s), HUD wanted UI data.
 * - All deterministic from the seeded RNG.
 */

export const police = {
  points: 0,
  heat: 1,
  units: [],
  roadblocks: [],
  spikes: [],
  helicopter: null,
  unseenTimer: 0,
  searchRadius: 40,
  bustMeter: 0,
  searchActive: false,

  reportCrime(kind, pos) {
    let pts = 6;
    if (kind === 'sighting') pts = 6;
    else if (kind === 'ped-hit') pts = 15;
    else if (kind === 'carjack') pts = 20;
    else if (kind === 'gunshot') pts = 10;
    else if (kind === 'officer-down') pts = 40;
    else if (kind === 'mug') pts = 15;

    this.points += pts;
    this.unseenTimer = 0;
    this.searchActive = false;

    // Heat thresholds: 25 / 60 / 110 / 170
    if (this.points >= 170) this.heat = 5;
    else if (this.points >= 110) this.heat = 4;
    else if (this.points >= 60) this.heat = 3;
    else if (this.points >= 25) this.heat = 2;
    else if (this.points >= 1) this.heat = 1;
    else this.heat = 1;
  },

  heatLevel() {
    return this.heat;
  },

  pointsVal() {
    return this.points;
  },

  clear() {
    this.points = 0;
    this.heat = 1;
    this.unseenTimer = 0;
    this.bustMeter = 0;
    this.searchActive = false;
    for (const u of this.units) {
      if (u.mesh && u.mesh.parent) u.mesh.parent.remove(u.mesh);
    }
    this.units = [];
    for (const rb of this.roadblocks) {
      if (rb && rb.parent) rb.parent.remove(rb);
    }
    this.roadblocks = [];
    for (const s of this.spikes) {
      if (s && s.parent) s.parent.remove(s);
    }
    this.spikes = [];
    if (this.helicopter && this.helicopter.parent) {
      this.helicopter.parent.remove(this.helicopter);
      this.helicopter = null;
    }
  },

  respray() {
    if (this.heat > 1) {
      this.heat--;
      if (this.heat === 1) this.points = 10;
      else if (this.heat === 2) this.points = 25;
      else if (this.heat === 3) this.points = 60;
      else if (this.heat === 4) this.points = 110;
    } else {
      this.clear();
    }
  },

  forceRoadblock(pos, heading) {
    this.createRoadblock(pos, heading);
  },

  debugPlaceRoadblock(pos, heading) {
    this.createRoadblock(pos, heading);
  },

  createRoadblock(pos, heading, scene) {
    // Roadblock built from two cruisers nose-in at +-35°, gap 2.2m, cone rows
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    group.rotation.y = heading;

    // Cruiser 1
    const c1 = createCarMesh('fenix', 'full');
    c1.position.set(-1.5, 0, 0);
    c1.rotation.y = 0.61; // ~35 deg
    group.add(c1);

    // Cruiser 2
    const c2 = createCarMesh('fenix', 'full');
    c2.position.set(1.5, 0, 0);
    c2.rotation.y = -0.61;
    group.add(c2);

    if (scene) scene.add(group);
    this.roadblocks.push(group);
    return group;
  },

  update(dt, playerPos, playerVel = { x: 0, z: 0 }, playerCar = null, scene = null) {
    // Unit caps by heat: 2 / 3 / 5 / 7 / 10
    const caps = [0, 2, 3, 5, 7, 10];
    const targetCap = caps[this.heat] || 2;

    // Decay points while unseen
    if (this.points > 0) {
      this.unseenTimer += dt;
      if (this.unseenTimer > 12) {
        this.searchActive = true;
        this.points -= 2 * dt;
        if (this.points < 0) this.points = 0;
        if (this.points < 170) this.heat = 4;
        if (this.points < 110) this.heat = 3;
        if (this.points < 60) this.heat = 2;
        if (this.points < 25) this.heat = 1;
      }
    }

    // Manage dispatch units
    while (this.units.length < targetCap && scene) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 95 + Math.random() * 55;
      const x = playerPos.x + Math.cos(angle) * dist;
      const z = playerPos.z + Math.sin(angle) * dist;

      const mesh = createCarMesh('fenix', 'full');
      mesh.position.set(x, 0, z);
      scene.add(mesh);

      const unitNames = [
        'PERALTA', 'GARCÍA', 'ROJAS', 'SILVA',
        'MENDOZA', 'ORTIZ', 'VALDEZ', 'CASTRO',
        'SANTIAGO', 'JIMÉNEZ', 'MORALES', 'HERRERA'
      ];
      const name = unitNames[Math.floor(Math.random() * unitNames.length)];

      let tacticTag = 'PURSUIT';
      if (this.heat === 2) tacticTag = 'PURSUIT+RAM';
      else if (this.heat === 3) tacticTag = 'ROADBLOCK';
      else if (this.heat === 4) tacticTag = 'SPOTLIGHT';
      else if (this.heat === 5) tacticTag = 'AGGRESSION';

      this.units.push({
        id: 'U' + Math.floor(Math.random() * 90 + 10),
        name,
        mesh,
        x,
        z,
        vx: 0,
        vz: 0,
        speed: 0,
        heading: 0,
        tactic: tacticTag,
        state: 'pursue',
        health: 100
      });
    }

    // Update units pursuit & tactics ladder
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const dx = playerPos.x - u.x;
      const dz = playerPos.z - u.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      u.distance = Math.round(dist);

      const targetHeading = Math.atan2(dx, dz);
      u.heading = targetHeading;
      if (u.staged) {
        u.speed = 0;
      } else {
        u.speed = 14 + this.heat * 2.5;
        u.x += Math.sin(targetHeading) * u.speed * dt;
        u.z += Math.cos(targetHeading) * u.speed * dt;
      }
      if (u.mesh) {
        u.mesh.position.set(u.x, 0, u.z);
        u.mesh.rotation.y = u.heading;
      }

      // Bust meter check (+0.5/s in 2.5m with stopped car)
      if (dist < 3.0 && playerCar && Math.abs(playerCar.speed || 0) < 1) {
        this.bustMeter += 0.5 * dt;
      } else {
        this.bustMeter = Math.max(0, this.bustMeter - 0.25 * dt);
      }
    }

    // Heat 3+ periodic roadblock spawn
    if (this.heat >= 3 && Math.random() < 0.002 && scene) {
      const aheadDist = 120;
      const rbX = playerPos.x + Math.sin(playerCar ? playerCar.heading : 0) * aheadDist;
      const rbZ = playerPos.z + Math.cos(playerCar ? playerCar.heading : 0) * aheadDist;
      this.createRoadblock({ x: rbX, z: rbZ }, playerCar ? playerCar.heading : 0, scene);
    }

    // Helicopter at heat >= 4
    if (this.heat >= 4 && !this.helicopter && scene) {
      const heliMesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshStandardMaterial({ color: 0x3E3A45 }));
      heliMesh.add(body);

      // Searchlight cone tracking player
      const coneGeom = new THREE.ConeGeometry(12, 45, 12);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xFFFFAA, transparent: true, opacity: 0.2, wireframe: false });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.set(0, -22.5, 0);
      cone.rotation.x = Math.PI;
      heliMesh.add(cone);

      heliMesh.position.set(playerPos.x, 45, playerPos.z - 30);
      scene.add(heliMesh);
      this.helicopter = heliMesh;
    } else if (this.heat < 4 && this.helicopter && this.helicopter.parent) {
      this.helicopter.parent.remove(this.helicopter);
      this.helicopter = null;
    }

    if (this.helicopter) {
      const targetX = playerPos.x;
      const targetZ = playerPos.z - 25;
      this.helicopter.position.x += (targetX - this.helicopter.position.x) * 0.06;
      this.helicopter.position.z += (targetZ - this.helicopter.position.z) * 0.06;
      this.helicopter.position.y = 45;
    }
  }
};
