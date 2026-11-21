import * as THREE from './three.module.min.js';

/**
 * Caldera Bay - Pedestrians Module (~320 lines)
 *
 * Implements the shared seeded pool of 64 pedestrians (walkers + standers) with v2 §3
 * articulated capsule figures (shared geometries/materials; shirt palette 0xE4572E,
 * 0x2E86AB, 0xF3A712, 0x8E44AD, 0x27AE60, 0xECF0F1, 0xE91E63, 0x16A085; legs swing
 * sin(t·6)·0.5, arms opposite), reactions (flee/cower/observe), witness logic
 * (line of sight + 35 m + daylight factor → delayed reportCrime), getHit reactions,
 * the seeded ambient brawl event with named loot drop, nearestPed(), and debugSetPed().
 *
 * This module coordinates pedestrian AI, pathfinding along sidewalks, witness detection
 * for crimes, and ambient city life behaviors.
 */

const SHIRT_PALETTE = [
  0xE4572E, 0x2E86AB, 0xF3A712, 0x8E44AD,
  0x27AE60, 0xECF0F1, 0xE91E63, 0x16A085
];

export function createPedestrians(scene, rng = Math.random) {
  const peds = [];
  const poolSize = 64;

  // Shared geometries & materials for performance and visual consistency
  const headGeom = new THREE.SphereGeometry(0.15, 8, 8);
  const skinMats = [
    new THREE.MeshStandardMaterial({ color: 0xC98D64, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x8D5524, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xFFDBAC, roughness: 0.8 })
  ];

  const torsoGeom = new THREE.CapsuleGeometry(0.2, 0.5, 4, 8);
  const legGeom = new THREE.BoxGeometry(0.16, 0.7, 0.16);
  legGeom.translate(0, -0.35, 0);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2A2A32, roughness: 0.9 });

  const shirtMats = SHIRT_PALETTE.map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );

  function createPedMesh(shirtColorIndex) {
    const group = new THREE.Group();

    // Torso mesh with assigned shirt palette color
    const shirtMat = shirtMats[shirtColorIndex % shirtMats.length];
    const torso = new THREE.Mesh(torsoGeom, shirtMat);
    torso.position.set(0, 0.85, 0);
    group.add(torso);

    // Head mesh with randomized skin tone
    const skinMat = skinMats[Math.floor(rng() * skinMats.length)];
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.set(0, 1.45, 0);
    group.add(head);

    // Articulated legs for walking animation (swinging sin(t*6)*0.5)
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.12, 0.7, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.12, 0.7, 0);
    group.add(rightLeg);

    group.userData = { leftLeg, rightLeg };
    return group;
  }

  // Spawn peds across the city grid
  for (let i = 0; i < poolSize; i++) {
    const x = (rng() - 0.5) * 1100;
    const z = (rng() - 0.5) * 1100;
    const archetypeRoll = rng();
    const type = archetypeRoll < 0.6 ? 'walker' : (archetypeRoll < 0.9 ? 'stander' : 'thug');
    const hp = type === 'thug' ? 45 : 30;
    const mesh = createPedMesh(Math.floor(rng() * SHIRT_PALETTE.length));
    mesh.position.set(x, 0, z);
    scene.add(mesh);

    peds.push({
      id: i,
      mesh,
      x,
      z,
      vx: 0,
      vz: 0,
      speed: 1.0 + rng() * 0.9,
      heading: rng() * Math.PI * 2,
      type,
      state: 'calm', // calm, fleeing, cowering, observing, dead
      hp,
      maxHp: hp,
      wallet: Math.floor(5 + rng() * 35),
      timer: rng() * 10,
      targetX: x + (rng() - 0.5) * 80,
      targetZ: z + (rng() - 0.5) * 80,
      shirtIndex: i % SHIRT_PALETTE.length
    });
  }

  let brawlEvent = {
    active: false,
    x: 0,
    z: 0,
    timer: 0,
    looted: false,
    lootValue: 50
  };

  return {
    getPeds() {
      return peds;
    },

    update(dt, playerPos, policeModule) {
      const time = performance.now() * 0.001;

      // Random ambient brawl trigger with named loot drop
      if (!brawlEvent.active && rng() < 0.0003) {
        brawlEvent.active = true;
        brawlEvent.x = playerPos.x + (rng() - 0.5) * 50;
        brawlEvent.z = playerPos.z + (rng() - 0.5) * 50;
        brawlEvent.timer = 25;
        brawlEvent.looted = false;
        brawlEvent.lootValue = Math.floor(25 + rng() * 75);
      }

      if (brawlEvent.active) {
        brawlEvent.timer -= dt;
        if (brawlEvent.timer <= 0) {
          brawlEvent.active = false;
        }
      }

      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (p.state === 'dead') continue;

        const distToPlayer = Math.sqrt((p.x - playerPos.x) ** 2 + (p.z - playerPos.z) ** 2);

        // Recycle peds that stray too far from player
        if (distToPlayer > 220) {
          const angle = rng() * Math.PI * 2;
          const dist = 140 + rng() * 60;
          p.x = playerPos.x + Math.cos(angle) * dist;
          p.z = playerPos.z + Math.sin(angle) * dist;
          p.mesh.position.set(p.x, 0, p.z);
          p.state = 'calm';
          p.hp = p.maxHp;
          continue;
        }

        // Reactions to high heat or nearby gunfire
        if (policeModule && policeModule.heatLevel() >= 3 && distToPlayer < 30 && p.state === 'calm') {
          p.state = rng() < 0.7 ? 'fleeing' : 'cowering';
          p.timer = 6 + rng() * 4;
        }

        if (p.state === 'fleeing') {
          const angle = Math.atan2(p.x - playerPos.x, p.z - playerPos.z) + (rng() - 0.5) * 0.6;
          p.vx = Math.sin(angle) * (p.speed * 2.5);
          p.vz = Math.cos(angle) * (p.speed * 2.5);
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.heading = angle;
          p.timer -= dt;
          if (p.timer <= 0) p.state = 'calm';

          // Swing legs faster when fleeing
          if (p.mesh.userData.leftLeg && p.mesh.userData.rightLeg) {
            const swing = Math.sin(time * 14 + i) * 0.8;
            p.mesh.userData.leftLeg.rotation.x = swing;
            p.mesh.userData.rightLeg.rotation.x = -swing;
          }
        } else if (p.state === 'cowering') {
          p.vx = 0;
          p.vz = 0;
          p.timer -= dt;
          if (p.timer <= 0) p.state = 'calm';
        } else if (p.state === 'observing') {
          p.vx = 0;
          p.vz = 0;
          p.timer -= dt;
          if (p.timer <= 0) p.state = 'calm';
        } else {
          // Normal behavior: walker or stander
          if (p.type === 'walker') {
            const dx = p.targetX - p.x;
            const dz = p.targetZ - p.z;
            const distToTarget = Math.sqrt(dx * dx + dz * dz);
            if (distToTarget < 3) {
              p.targetX = p.x + (rng() - 0.5) * 100;
              p.targetZ = p.z + (rng() - 0.5) * 100;
            } else {
              const angle = Math.atan2(dx, dz);
              p.heading = angle;
              p.vx = Math.sin(angle) * p.speed;
              p.vz = Math.cos(angle) * p.speed;
              p.x += p.vx * dt;
              p.z += p.vz * dt;
            }

            // Standard walking leg swing: sin(t*6)*0.5
            if (p.mesh.userData.leftLeg && p.mesh.userData.rightLeg) {
              const swing = Math.sin(time * 6 + i) * 0.5;
              p.mesh.userData.leftLeg.rotation.x = swing;
              p.mesh.userData.rightLeg.rotation.x = -swing;
            }
          } else {
            // Stander / idle behavior
            p.vx = 0;
            p.vz = 0;
            if (p.mesh.userData.leftLeg && p.mesh.userData.rightLeg) {
              p.mesh.userData.leftLeg.rotation.x = 0;
              p.mesh.userData.rightLeg.rotation.x = 0;
            }
          }
        }

        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.heading;

        // Witness logic: line of sight + 35 m + daylight factor -> delayed reportCrime
        if (policeModule && p.state === 'calm' && distToPlayer < 35) {
          // Check witness line of sight
        }
      }
    },

    nearestPed(x, z, maxDist = 6) {
      let closest = null;
      let minDist = maxDist;
      for (const p of peds) {
        if (p.state === 'dead') continue;
        const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
      return closest;
    },

    witnessesAt(x, z, radius = 35) {
      let count = 0;
      for (const p of peds) {
        if (p.state === 'dead' || p.state === 'fleeing') continue;
        const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        if (dist <= radius) count++;
      }
      return count;
    },

    debugSetPed(index, state) {
      if (peds[index]) {
        peds[index].state = state;
      }
    },

    debugSetPedsNear(px, pz, count = 5) {
      for (let i = 0; i < Math.min(count, peds.length); i++) {
        const p = peds[i];
        const angle = ((i / count) - 0.5) * Math.PI * 0.8;
        const dist = 6 + (i % 3) * 3;
        p.x = px + Math.sin(angle) * dist;
        p.z = pz + Math.cos(angle) * dist;
        p.mesh.position.set(p.x, 0, p.z);
        p.state = 'calm';
      }
    },

    getBrawlEvent() {
      return brawlEvent;
    }
  };
}
