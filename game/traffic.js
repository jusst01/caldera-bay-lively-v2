import * as THREE from './three.module.min.js';
import { VEHICLES, createCarMesh } from './vehicles.js';

/**
 * Caldera Bay - Traffic Module
 * Implements 24 civilian cars on the intersection lane graph,
 * right-hand lane offset 3.4m, straight-preferred node choice,
 * no U-turns, slow-for-car-ahead, and markStolen permanent removal.
 */

export function createTraffic(scene) {
  const cars = [];
  const civilianSpecs = VEHICLES.filter(v => !v.police && !v.swat && !v.heli);

  const GRID_SIZE = 18;
  const BLOCK_SIZE = 64;
  const CITY_SIZE = GRID_SIZE * BLOCK_SIZE;
  const minCoord = -CITY_SIZE / 2;
  const maxCoord = CITY_SIZE / 2;

  const nodes = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    for (let j = 0; j <= GRID_SIZE; j++) {
      nodes.push({ x: minCoord + i * BLOCK_SIZE, z: minCoord + j * BLOCK_SIZE });
    }
  }

  function getRandomNode() {
    return nodes[Math.floor(Math.random() * nodes.length)];
  }

  function spawnTrafficCar() {
    const startNode = getRandomNode();
    const neighbors = nodes.filter(n =>
      (Math.abs(n.x - startNode.x) === BLOCK_SIZE && n.z === startNode.z) ||
      (Math.abs(n.z - startNode.z) === BLOCK_SIZE && n.x === startNode.x)
    );
    if (neighbors.length === 0) return;
    const targetNode = neighbors[Math.floor(Math.random() * neighbors.length)];

    const spec = civilianSpecs[Math.floor(Math.random() * civilianSpecs.length)];
    const mesh = createCarMesh(spec.id, 'std');

    const dx = targetNode.x - startNode.x;
    const dz = targetNode.z - startNode.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / len;
    const dirZ = dz / len;
    const perpX = -dirZ * 3.4;
    const perpZ = dirX * 3.4;

    const x = startNode.x + perpX;
    const z = startNode.z + perpZ;

    mesh.position.set(x, 0, z);
    const heading = Math.atan2(dirX, dirZ);
    mesh.rotation.y = heading;
    scene.add(mesh);

    cars.push({
      mesh,
      spec,
      x,
      z,
      vx: dirX * 8,
      vz: dirZ * 8,
      speed: 8 + Math.random() * 4,
      maxSpeed: (spec.topSpeed / 3.6) * 0.55,
      heading,
      currentNode: startNode,
      targetNode,
      stolen: false
    });
  }

  for (let i = 0; i < 24; i++) {
    spawnTrafficCar();
  }

  return {
    update(dt, playerPos) {
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        if (c.stolen) continue;

        let speedMult = 1.0;
        for (let j = 0; j < cars.length; j++) {
          if (i === j) continue;
          const other = cars[j];
          if (other.stolen) continue;
          const distSq = (c.x - other.x) ** 2 + (c.z - other.z) ** 2;
          if (distSq < 160 && distSq > 0) {
            const toOtherX = other.x - c.x;
            const toOtherZ = other.z - c.z;
            const fwdX = Math.sin(c.heading);
            const fwdZ = Math.cos(c.heading);
            const dot = toOtherX * fwdX + toOtherZ * fwdZ;
            if (dot > 0 && dot < 14) {
              speedMult = 0.25;
            }
          }
        }

        if (playerPos) {
          const pDistSq = (c.x - playerPos.x) ** 2 + (c.z - playerPos.z) ** 2;
          if (pDistSq < 120) speedMult *= 0.4;
        }

        const targetSpeed = c.maxSpeed * speedMult;
        c.speed += (targetSpeed - c.speed) * dt * 2.5;

        const fwdX = Math.sin(c.heading);
        const fwdZ = Math.cos(c.heading);
        c.x += fwdX * c.speed * dt;
        c.z += fwdZ * c.speed * dt;

        c.mesh.position.set(c.x, 0, c.z);

        const distToTarget = Math.sqrt((c.x - c.targetNode.x) ** 2 + (c.z - c.targetNode.z) ** 2);
        if (distToTarget < 6) {
          const prevNode = c.currentNode;
          c.currentNode = c.targetNode;

          const candidateNodes = nodes.filter(n => {
            const isNeighbor = (Math.abs(n.x - c.currentNode.x) === BLOCK_SIZE && n.z === c.currentNode.z) ||
                               (Math.abs(n.z - c.currentNode.z) === BLOCK_SIZE && n.x === c.currentNode.x);
            const isUturn = (n.x === prevNode.x && n.z === prevNode.z);
            return isNeighbor && !isUturn;
          });

          if (candidateNodes.length > 0) {
            const inComingX = c.currentNode.x - prevNode.x;
            const inComingZ = c.currentNode.z - prevNode.z;
            let chosen = candidateNodes.find(n => (n.x - c.currentNode.x) === inComingX && (n.z - c.currentNode.z) === inComingZ);
            if (!chosen) {
              chosen = candidateNodes[Math.floor(Math.random() * candidateNodes.length)];
            }
            c.targetNode = chosen;

            const dx = c.targetNode.x - c.currentNode.x;
            const dz = c.targetNode.z - c.currentNode.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
              const dirX = dx / len;
              const dirZ = dz / len;
              c.heading = Math.atan2(dirX, dirZ);
              c.mesh.rotation.y = c.heading;
              c.x = c.currentNode.x - dirZ * 3.4;
              c.z = c.currentNode.z + dirX * 3.4;
            }
          }
        }

        if (Math.abs(c.x) > maxCoord || Math.abs(c.z) > maxCoord) {
          const nNode = getRandomNode();
          c.x = nNode.x;
          c.z = nNode.z;
          c.currentNode = nNode;
          c.targetNode = nNode;
        }
      }
    },
    getCars() {
      return cars;
    },
    markStolen(carMesh) {
      const found = cars.find(c => c.mesh === carMesh);
      if (found) {
        found.stolen = true;
        scene.remove(carMesh);
      }
    }
  };
}
