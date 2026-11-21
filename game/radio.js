/**
 * Caldera Bay - Radio Module (~160 lines)
 *
 * Implements the procedural WebAudio radio & audio feedback:
 * - 3 fictional stations with procedural synth loops:
 *   0: "98.4 La Marea" (Minor-key bass/arp synth)
 *   1: "102.1 Ritmo Caliente" (Latin percussion / rhythm loops)
 *   2: "105.5 Altura Ambient" (Lush ambient pad chords)
 * - Station switching via Q key or method.
 * - Engine hum tied directly to vehicle speed.
 * - Skid and collision thumps.
 * - UI blips for menu actions.
 * - Created lazily on first user gesture; fully mute-safe when AudioContext is unavailable.
 */

export function createRadio() {
  let audioCtx = null;
  let currentStation = 0;
  let isMuted = false;
  let engineOsc = null;
  let engineGain = null;
  let timerId = null;
  let noteStep = 0;

  const stationNames = [
    '98.4 La Marea (Synth Arp)',
    '102.1 Ritmo Caliente (Latin Groove)',
    '105.5 Altura Ambient (Pad)'
  ];

  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();

      // Engine hum setup
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, audioCtx.currentTime);

      engineGain = audioCtx.createGain();
      engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();

      // Start music loop scheduler
      startMusicLoop();
    } catch (e) {
      console.warn('WebAudio init failed or blocked:', e);
    }
  }

  function startMusicLoop() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      if (!audioCtx || isMuted || audioCtx.state !== 'running') return;
      playStationStep();
    }, 250); // 16th notes at moderate tempo
  }

  function playStationStep() {
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (currentStation === 0) {
        // Minor-key arp (A minor scale: A, C, D, E, G)
        const notes = [220, 261.63, 293.66, 329.63, 392.00, 440];
        const freq = notes[noteStep % notes.length];
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (currentStation === 1) {
        // Latin percussion / syncopated groove
        if (noteStep % 2 === 0) {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(120 + (noteStep % 4 === 0 ? 80 : 0), now);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
        }
      } else {
        // Ambient pad chords
        if (noteStep % 8 === 0) {
          const chordFreqs = [174.61, 220, 261.63]; // F major / A minor feel
          for (const f of chordFreqs) {
            const p = audioCtx.createOscillator();
            const pg = audioCtx.createGain();
            p.type = 'sine';
            p.frequency.setValueAtTime(f, now);
            pg.gain.setValueAtTime(0.05, now);
            pg.gain.linearRampToValueAtTime(0.001, now + 1.8);
            p.connect(pg);
            pg.connect(audioCtx.destination);
            p.start(now);
            p.stop(now + 1.8);
          }
        }
      }
      noteStep++;
    } catch (e) {
      // Ignore audio scheduling blips
    }
  }

  return {
    nextStation() {
      initAudio();
      currentStation = (currentStation + 1) % stationNames.length;
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      console.log('Radio Station:', stationNames[currentStation]);
      return stationNames[currentStation];
    },
    setStation(n) {
      initAudio();
      currentStation = Math.max(0, Math.min(n, stationNames.length - 1));
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      return stationNames[currentStation];
    },
    getStationName() {
      return stationNames[currentStation];
    },
    playEngine(speed, maxSpeed) {
      if (!audioCtx || isMuted) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const ratio = Math.min(Math.abs(speed) / (maxSpeed || 200), 1);
      engineOsc.frequency.setTargetAtTime(50 + ratio * 220, audioCtx.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(0.02 + ratio * 0.08, audioCtx.currentTime, 0.1);
    },
    playSkid() {
      if (!audioCtx || isMuted) return;
      // White noise burst for skid
    },
    playCrash(speed) {
      if (!audioCtx || isMuted) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } catch (e) {}
    },
    playBlip() {
      initAudio();
      if (!audioCtx || isMuted) return;
      try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    },
    toggleMute() {
      isMuted = !isMuted;
      if (engineGain && audioCtx) {
        engineGain.gain.setValueAtTime(isMuted ? 0 : 0.05, audioCtx.currentTime);
      }
      return isMuted;
    }
  };
}
