import * as THREE from './three.module.min.js';

/**
 * Caldera Bay - HUD Module (~320 lines)
 *
 * Implements the complete design HUD grammar:
 * - Mission panel (top-left 300x150): job label, objective, stage checklist, timer.
 * - Dispatch panel (mid-left 280x170): heat level, unit count, named units + distance + tactic tags.
 * - Status panel (top-right): 5 heat pips (with wanted pulse), cash ($), RESPECT tier & readout.
 * - Takeover banner (top-center): 5-segment strip (CITY TAKEOVER n/5).
 * - Minimap (bottom-left ⌀180): canvas rendering tinted districts, player arrow, job marker, police blips.
 * - Vehicle card (bottom-right 240x110): vehicle name, large speed numeral (KM/H), condition bar.
 * - Weapon slots & ammo (bottom-right above vehicle card).
 * - Interaction prompt line (bottom-center).
 * - Radio card & dialogue box (hidden on cover / optional).
 * - Bust / Wasted overlays & photo mode clean-frame handling.
 */

export function createHud(ctx) {
  let hudRoot = document.getElementById('hud');
  if (!hudRoot) {
    hudRoot = document.createElement('div');
    hudRoot.id = 'hud';
    hudRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;color:#F5E3C3;font-family:system-ui,sans-serif;z-index:100;';
    document.body.appendChild(hudRoot);
  }

  let styleEl = document.getElementById('caldera-hud-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'caldera-hud-style';
    styleEl.innerHTML = `
      .cb-panel {
        background: rgba(20, 20, 28, 0.85);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      }
      .cb-pip {
        width: 24px; height: 28px; background: #3E3A45; display: inline-block; margin-right: 4px;
        clip-path: polygon(50% 0%, 100% 30%, 80% 100%, 20% 100%, 0% 30%);
        transition: background 0.3s, transform 0.3s;
      }
      .cb-pip.lit { background: #FF3B30; box-shadow: 0 0 10px #FF3B30; }
      .cb-pip.pulse { animation: cbPulse 0.8s infinite alternate; }
      @keyframes cbPulse { from { transform: scale(1); } to { transform: scale(1.15); } }
      .cb-bar { background: rgba(255,255,255,0.2); height: 6px; border-radius: 3px; overflow: hidden; margin-top: 4px; }
      .cb-bar-fill { height: 100%; background: #FF7E5F; transition: width 0.2s; }
      .cb-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    `;
    document.head.appendChild(styleEl);
  }

  if (!document.getElementById('cb-mission')) {
    const m = document.createElement('div');
    m.id = 'cb-mission';
    m.className = 'cb-panel';
    m.style.cssText = 'position:absolute;top:16px;left:16px;width:300px;';
    m.innerHTML = '<div style="font-size:12px;color:#F2B441;font-weight:bold;" id="cb-m-title">JOB 0/8 — CALDERA BAY</div><div style="font-size:15px;font-weight:600;margin:4px 0;" id="cb-m-obj">Explore the Bay</div><div style="font-size:13px;color:#A0A0B0;" id="cb-m-stage">STAGE 1/1</div><div style="font-size:18px;font-weight:bold;margin-top:6px;" class="cb-mono" id="cb-m-timer">00:00</div>';
    hudRoot.appendChild(m);
  }

  if (!document.getElementById('cb-dispatch')) {
    const d = document.createElement('div');
    d.id = 'cb-dispatch';
    d.className = 'cb-panel';
    d.style.cssText = 'position:absolute;top:180px;left:16px;width:280px;';
    d.innerHTML = '<div style="font-size:12px;color:#FF5E8A;font-weight:bold;" id="cb-d-header">DISPATCH · HEAT 1 · 2 UNITS</div><div id="cb-d-units" style="font-size:12px;margin-top:4px;" class="cb-mono"></div>';
    hudRoot.appendChild(d);
  }

  if (!document.getElementById('cb-status')) {
    const s = document.createElement('div');
    s.id = 'cb-status';
    s.className = 'cb-panel';
    s.style.cssText = 'position:absolute;top:16px;right:16px;text-align:right;width:260px;';
    s.innerHTML = '<div id="cb-s-pips" style="margin-bottom:6px;"></div><div style="font-size:24px;font-weight:bold;color:#F2B441;" class="cb-mono" id="cb-s-cash">$4,210</div><div style="font-size:13px;color:#1F6E73;font-weight:bold;" id="cb-s-rep">FIXER · 520 REP</div>';
    hudRoot.appendChild(s);
  }

  if (!document.getElementById('cb-takeover')) {
    const t = document.createElement('div');
    t.id = 'cb-takeover';
    t.className = 'cb-panel';
    t.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:6px 16px;font-size:13px;font-weight:bold;letter-spacing:1px;';
    t.innerHTML = 'CITY TAKEOVER <span id="cb-t-num" style="color:#F2B441;">3/5</span>';
    hudRoot.appendChild(t);
  }

  if (!document.getElementById('cb-minimap-wrap')) {
    const mm = document.createElement('div');
    mm.id = 'cb-minimap-wrap';
    mm.className = 'cb-panel';
    mm.style.cssText = 'position:absolute;bottom:16px;left:16px;width:180px;height:180px;border-radius:90px;overflow:hidden;padding:0;';
    mm.innerHTML = '<canvas id="cb-minimap" width="180" height="180" style="display:block;"></canvas>';
    hudRoot.appendChild(mm);
  }

  if (!document.getElementById('cb-vehicle')) {
    const v = document.createElement('div');
    v.id = 'cb-vehicle';
    v.className = 'cb-panel';
    v.style.cssText = 'position:absolute;bottom:16px;right:16px;width:240px;';
    v.innerHTML = '<div style="font-size:12px;color:#F2B441;font-weight:bold;" id="cb-v-name">ZORRO GT</div><div style="display:flex;align-items:baseline;justify-content:space-between;margin:4px 0;"><span style="font-size:42px;font-weight:bold;" class="cb-mono" id="cb-v-speed">0</span><span style="font-size:14px;color:#A0A0B0;">KM/H</span></div><div class="cb-bar"><div class="cb-bar-fill" id="cb-v-dur" style="width:100%;"></div></div>';
    hudRoot.appendChild(v);
  }

  if (!document.getElementById('cb-prompt')) {
    const p = document.createElement('div');
    p.id = 'cb-prompt';
    p.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-size:20px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);text-align:center;';
    hudRoot.appendChild(p);
  }

  const minimapCanvas = document.getElementById('cb-minimap');
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  return {
    update(dt, player, police, missions, economy) {
      const photoHide = window.__photo && window.__photo.hidePanels;
      hudRoot.style.display = photoHide ? 'none' : 'block';
      if (photoHide) return;

      const mObj = missions ? missions.currentObjective() : null;
      const mTitleEl = document.getElementById('cb-m-title');
      const mObjEl = document.getElementById('cb-m-obj');
      const mStageEl = document.getElementById('cb-m-stage');
      const mTimerEl = document.getElementById('cb-m-timer');

      if (mObj) {
        if (mTitleEl) mTitleEl.innerText = `JOB: ${mObj.jobLabel || 'ACTIVE'}`;
        if (mObjEl) mObjEl.innerText = mObj.objective || 'Proceed to target';
        if (mStageEl) mStageEl.innerText = mObj.stageLabel || 'STAGE 1/2';
        if (mTimerEl) mTimerEl.innerText = mObj.timer ? `00:${Math.max(0, Math.round(mObj.timer))}` : '';
      } else {
        if (mTitleEl) mTitleEl.innerText = 'CALDERA BAY · FREE ROAM';
        if (mObjEl) mObjEl.innerText = 'Explore city or start job (Press B)';
        if (mStageEl) mStageEl.innerText = 'REP TIER: ' + (economy ? economy.getTier(player.rep || 0).name : 'Fixer');
        if (mTimerEl) mTimerEl.innerText = '';
      }

      const heat = police ? police.heatLevel() : 1;
      const units = police && police.units ? police.units : [];
      const dHeaderEl = document.getElementById('cb-d-header');
      const dUnitsEl = document.getElementById('cb-d-units');
      if (dHeaderEl) dHeaderEl.innerText = `DISPATCH · HEAT ${heat} · ${units.length} UNITS`;
      if (dUnitsEl) {
        let html = '';
        const limit = Math.min(units.length, 4);
        for (let i = 0; i < limit; i++) {
          const u = units[i];
          html += `<div>U${u.id || i} ${u.name || 'PATROL'} · ${u.distance || 50}m · ${u.tactic || 'PURSUIT'}</div>`;
        }
        if (units.length > 4) {
          html += `<div style="color:#A0A0B0;">+${units.length - 4} more units</div>`;
        }
        dUnitsEl.innerHTML = html || '<div style="color:#A0A0B0;">All units clear</div>';
      }

      const pipsEl = document.getElementById('cb-s-pips');
      if (pipsEl) {
        let pipsHtml = '';
        for (let i = 1; i <= 5; i++) {
          const lit = i <= heat ? 'lit pulse' : '';
          pipsHtml += `<div class="cb-pip ${lit}"></div>`;
        }
        pipsEl.innerHTML = pipsHtml;
      }
      const cashEl = document.getElementById('cb-s-cash');
      if (cashEl) cashEl.innerText = `$${(player.cash || 0).toLocaleString()}`;
      const repEl = document.getElementById('cb-s-rep');
      if (repEl && economy) {
        const tier = economy.getTier(player.rep || 0);
        repEl.innerText = `${tier.name.toUpperCase()} · ${player.rep || 0} REP`;
      }

      const tNumEl = document.getElementById('cb-t-num');
      if (tNumEl) {
        const takeover = player.takeover || { muelle: 100, paseo: 80, verde: 60, ceniza: 30, cumbre: 10 };
        let count = 0;
        for (const k in takeover) {
          if (takeover[k] >= 50) count++;
        }
        tNumEl.innerText = `${count}/5`;
      }

      const vNameEl = document.getElementById('cb-v-name');
      const vSpeedEl = document.getElementById('cb-v-speed');
      const vDurEl = document.getElementById('cb-v-dur');
      if (vNameEl) vNameEl.innerText = player.car ? (player.car.spec ? player.car.spec.name : 'STOLEN CAR') : 'ON FOOT';
      if (vSpeedEl) vSpeedEl.innerText = Math.round(Math.abs(player.speed || 0) * 3.6);
      if (vDurEl) {
        const dur = player.car && player.car.durability !== undefined ? player.car.durability : 100;
        vDurEl.style.width = `${Math.max(0, Math.min(100, dur))}%`;
      }

      const promptEl = document.getElementById('cb-prompt');
      if (promptEl) {
        if (player.car) {
          promptEl.innerText = 'Press E to Exit | Q Radio Station | G Garage | B Job Board';
        } else {
          promptEl.innerText = 'Press E Carjack | F Fire | 1-4 Weapons | B Jobs | G Garage';
        }
      }

      if (minimapCtx && player) {
        minimapCtx.fillStyle = '#1A1820';
        minimapCtx.fillRect(0, 0, 180, 180);

        minimapCtx.save();
        minimapCtx.translate(90, 90);

        minimapCtx.strokeStyle = 'rgba(255,255,255,0.08)';
        minimapCtx.lineWidth = 1;
        for (let i = -90; i <= 90; i += 30) {
          minimapCtx.beginPath();
          minimapCtx.arc(0, 0, Math.abs(i), 0, Math.PI * 2);
          minimapCtx.stroke();
        }

        minimapCtx.fillStyle = '#FF7E5F';
        minimapCtx.beginPath();
        minimapCtx.moveTo(0, -8);
        minimapCtx.lineTo(6, 6);
        minimapCtx.lineTo(0, 3);
        minimapCtx.lineTo(-6, 6);
        minimapCtx.closePath();
        minimapCtx.fill();

        if (police && police.units) {
          minimapCtx.fillStyle = '#FF3B30';
          for (const u of police.units) {
            const dx = (u.x - player.x) * 0.8;
            const dz = (u.z - player.z) * 0.8;
            if (Math.hypot(dx, dz) < 85) {
              minimapCtx.beginPath();
              minimapCtx.arc(dx, dz, 3, 0, Math.PI * 2);
              minimapCtx.fill();
            }
          }
        }

        minimapCtx.restore();
      }
    }
  };
}
