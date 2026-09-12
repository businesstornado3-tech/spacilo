/**
 * Free soundtrack — synthesised in the founder's own browser.
 *
 * Every sound in an EarnRoom browser video is generated here with the Web
 * Audio API from the plan in `audio.ts`: a soft chord bed, a little filtered
 * room tone and short percussive effects. Nothing is downloaded, licensed or
 * paid for, and no voice is faked.
 *
 * Browser-only module. Nothing here is imported during server rendering.
 */
import type { AudioCueKind, BrowserAudioPlan } from "./audio";

type Ctx = OfflineAudioContext;

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Says plainly whether this browser can make the soundtrack. */
export function audioSupport(): { supported: boolean; reason: string } {
  if (typeof window === "undefined")
    return { supported: false, reason: "Not running in a browser." };
  if (typeof OfflineAudioContext === "undefined")
    return { supported: false, reason: "This browser cannot generate sound." };
  if (typeof AudioEncoder === "undefined")
    return {
      supported: false,
      reason: "This browser cannot record a sound track into the video file.",
    };
  return { supported: true, reason: "This browser can make the soundtrack locally, at no cost." };
}

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic pseudo-noise: the same video always sounds the same.
  let seed = 0x1f2e3d4c;
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function tone(
  ctx: Ctx,
  bus: GainNode,
  options: {
    at: number;
    seconds: number;
    hz: number;
    peak: number;
    type: OscillatorType;
    attack?: number;
    detune?: number;
  },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = options.type;
  osc.frequency.value = options.hz;
  if (options.detune) osc.detune.value = options.detune;
  const attack = options.attack ?? 0.6;
  gain.gain.setValueAtTime(0.0001, options.at);
  gain.gain.linearRampToValueAtTime(options.peak, options.at + attack);
  gain.gain.setValueAtTime(options.peak, options.at + Math.max(attack, options.seconds - 0.5));
  gain.gain.exponentialRampToValueAtTime(0.0001, options.at + options.seconds);
  osc.connect(gain).connect(bus);
  osc.start(options.at);
  osc.stop(options.at + options.seconds + 0.05);
}

function blip(
  ctx: Ctx,
  bus: GainNode,
  at: number,
  hz: number,
  seconds: number,
  peak: number,
  type: OscillatorType = "sine",
  slideTo?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + seconds);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(bus);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

function thud(
  ctx: Ctx,
  bus: GainNode,
  at: number,
  seconds: number,
  peak: number,
  cutoff: number,
  source: AudioBuffer,
) {
  const node = ctx.createBufferSource();
  node.buffer = source;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  node.connect(filter).connect(gain).connect(bus);
  node.start(at, 0, seconds + 0.05);
}

function effect(
  ctx: Ctx,
  bus: GainNode,
  kind: AudioCueKind,
  at: number,
  gain: number,
  noise: AudioBuffer,
) {
  switch (kind) {
    case "footstep":
      thud(ctx, bus, at, 0.16, 0.5 * gain, 900, noise);
      break;
    case "boxMove":
      thud(ctx, bus, at, 0.34, 0.45 * gain, 1800, noise);
      break;
    case "boxPlace":
      thud(ctx, bus, at, 0.28, 0.7 * gain, 420, noise);
      blip(ctx, bus, at + 0.02, 120, 0.18, 0.25 * gain, "triangle", 70);
      break;
    case "doorOpen":
      thud(ctx, bus, at, 0.9, 0.4 * gain, 700, noise);
      blip(ctx, bus, at, 180, 0.85, 0.18 * gain, "sawtooth", 90);
      break;
    case "phoneOn":
      blip(ctx, bus, at, 880, 0.1, 0.35 * gain, "sine", 1320);
      break;
    case "confirm":
      blip(ctx, bus, at, 784, 0.14, 0.3 * gain);
      blip(ctx, bus, at + 0.11, 1046, 0.22, 0.28 * gain);
      break;
    case "shutter":
      thud(ctx, bus, at, 0.09, 0.3 * gain, 4200, noise);
      break;
    case "riseSwell":
      blip(ctx, bus, at, 220, 1.1, 0.22 * gain, "triangle", 880);
      break;
    case "brandResolve":
      blip(ctx, bus, at, 523, 0.5, 0.3 * gain);
      blip(ctx, bus, at + 0.12, 659, 0.6, 0.26 * gain);
      blip(ctx, bus, at + 0.24, 784, 0.9, 0.24 * gain);
      break;
    case "roomTone":
    default:
      break;
  }
}

/**
 * Renders the whole soundtrack offline. Returns raw stereo samples ready to be
 * encoded into the video file.
 */
export async function renderAudioPlan(plan: BrowserAudioPlan): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(plan.seconds * plan.sampleRate));
  const ctx = new OfflineAudioContext(2, frames, plan.sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);

  const musicBus = ctx.createGain();
  musicBus.gain.value = plan.mix.music;
  const ambienceBus = ctx.createGain();
  ambienceBus.gain.value = plan.mix.ambience;
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = plan.mix.sfx;
  musicBus.connect(master);
  ambienceBus.connect(master);
  sfxBus.connect(master);

  const noise = noiseBuffer(ctx, 1.5);

  for (const section of plan.music) {
    const seconds = Math.max(0.4, section.seconds);
    section.chord.forEach((interval, voice) => {
      tone(ctx, musicBus, {
        at: section.at,
        seconds,
        hz: midiToHz(section.root + interval),
        peak: (0.24 * section.intensity) / Math.max(1, section.chord.length * 0.7),
        type: voice === 0 ? "triangle" : "sine",
        attack: Math.min(1.2, seconds * 0.35),
        detune: voice * 3,
      });
    });
    if (section.pulse) {
      const beats = Math.floor(seconds / 0.75);
      for (let beat = 0; beat < beats; beat += 1) {
        blip(
          ctx,
          musicBus,
          section.at + beat * 0.75,
          midiToHz(section.root + 12),
          0.16,
          0.1 * section.intensity,
          "sine",
        );
      }
    }
  }

  for (const section of plan.ambience) {
    const node = ctx.createBufferSource();
    node.buffer = noise;
    node.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, section.at);
    gain.gain.linearRampToValueAtTime(section.level * 0.25, section.at + 0.4);
    gain.gain.setValueAtTime(
      section.level * 0.25,
      section.at + Math.max(0.5, section.seconds - 0.4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, section.at + section.seconds);
    node.connect(filter).connect(gain).connect(ambienceBus);
    node.start(section.at);
    node.stop(section.at + section.seconds + 0.05);
  }

  for (const cue of plan.sfx) {
    effect(ctx, sfxBus, cue.kind, cue.at, cue.gain, noise);
  }

  return ctx.startRendering();
}
