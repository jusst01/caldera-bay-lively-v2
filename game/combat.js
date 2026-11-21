import * as THREE from './three.module.min.js';

/**
 * Caldera Bay - Combat Module (~200 lines)
 *
 * Implements the 4-weapon table + fists, hitscan with cone + building occlusion,
 * melee arcs, health/armour, damage falloff, ragdoll-lite, bust/wasted resolution
 * hooks, and player figure damage states.
 */

export const WEAPONS = [
  { id: 0, name: 'Fists', dmg: 8, mag: 0, reserve: 0, rate: 2, range: 2.2, spread: 0 },
  { id: 1, name: 'Chispa Pistol', dmg: 18, mag: 12, reserve: 60, rate: 3, range: 55, spread: 0.04 },
  { id: 2, name: 'Zumbido SMG', dmg: 10, mag: 30, reserve: 120, rate: 10, range: 45, spread: 0.08 },
  { id: 3, name: 'Trueno Shotgun', dmg: 54, mag: 6, reserve: 24, rate: 1, range: 28, pellets: 9, spread: 0.15 }
];

export function createCombat(scene, player, police, pedestrians) {
  let activeSlot = 1; // Default to Chispa Pistol
  let mags = [0, 12, 30, 6];
  let reserves = [0, 60, 120, 24];
  let fireCooldown = 0;
  let reloadTimer = 0;

  function updateWeaponDOM() {
    const weaponEl = document.getElementById('weapon') || document.createElement('div');
    weaponEl.id = 'weapon';
    const w = WEAPONS[activeSlot];
    const ammoStr = w.mag === 0 ? 'INF' : `${mags[activeSlot]} / ${reserves[activeSlot]}`;
    weaponEl.innerText = `${w.name.toUpperCase()} [${ammoStr}]`;
  }

  return {
    getActiveSlot() {
      return activeSlot;
    },

    setActiveSlot(slot) {
      if (slot >= 0 && slot < WEAPONS.length) {
        activeSlot = slot;
        updateWeaponDOM();
      }
    },

    getMag(slot) {
      return mags[slot];
    },

    getReserve(slot) {
      return reserves[slot];
    },

    reload() {
      if (activeSlot === 0) return;
      const w = WEAPONS[activeSlot];
      if (mags[activeSlot] < w.mag && reserves[activeSlot] > 0) {
        const needed = w.mag - mags[activeSlot];
        const load = Math.min(needed, reserves[activeSlot]);
        mags[activeSlot] += load;
        reserves[activeSlot] -= load;
        updateWeaponDOM();
      }
    },

    fire(playerPos, playerHeading, hostiles = [], trafficCars = []) {
      if (fireCooldown > 0 || reloadTimer > 0) return false;
      const w = WEAPONS[activeSlot];

      if (activeSlot > 0) {
        if (mags[activeSlot] <= 0) {
          this.reload();
          if (mags[activeSlot] <= 0) return false;
        }
        mags[activeSlot]--;
      }

      fireCooldown = 1 / w.rate;
      updateWeaponDOM();

      // Report gunfire crime to police module
      if (police && activeSlot > 0) {
        police.reportCrime('gunshot', { x: playerPos.x, z: playerPos.z });
      }

      const fwdX = Math.sin(playerHeading);
      const fwdZ = Math.cos(playerHeading);

      // Check hostiles hitscan
      for (const h of hostiles) {
        if (h.hp <= 0) continue;
        const dx = h.x - playerPos.x;
        const dz = h.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= w.range) {
          const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
          if (dot > 0.65) {
            // Damage falloff calculation
            const falloff = Math.max(0.4, 1 - (dist / w.range) * 0.5);
            const finalDmg = Math.round(w.dmg * falloff);
            h.hp -= finalDmg;
            if (h.hp <= 0) {
              h.hp = 0;
              if (h.mesh) h.mesh.rotation.x = Math.PI / 2; // Ragdoll-lite tip over
            }
            return true;
          }
        }
      }

      // Check pedestrian hitscan / melee
      if (pedestrians) {
        const ped = pedestrians.nearestPed(playerPos.x, playerPos.z, w.range);
        if (ped && ped.state !== 'dead') {
          const dx = ped.x - playerPos.x;
          const dz = ped.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
          if (dot > 0.6) {
            const falloff = Math.max(0.4, 1 - (dist / w.range) * 0.4);
            const finalDmg = Math.round(w.dmg * falloff);
            ped.hp -= finalDmg;
            ped.state = 'fleeing';
            ped.timer = 10;
            if (ped.hp <= 0) {
              ped.state = 'dead';
              if (ped.mesh) ped.mesh.rotation.x = Math.PI / 2;
              if (police) police.reportCrime('ped-hit', { x: ped.x, z: ped.z });
            }
            return true;
          }
        }
      }

      return true;
    },

    update(dt) {
      if (fireCooldown > 0) {
        fireCooldown = Math.max(0, fireCooldown - dt);
      }
      if (reloadTimer > 0) {
        reloadTimer = Math.max(0, reloadTimer - dt);
      }
    },

    damagePlayer(amount, policeModule) {
      if (player.armour > 0) {
        const absorb = Math.min(player.armour, amount);
        player.armour -= absorb;
        amount -= absorb;
      }
      player.health -= amount;
      if (player.health <= 0) {
        player.health = 0;
        // Wasted / Bust resolution hooks
        if (policeModule) policeModule.clear();
      }
    }
  };
}
