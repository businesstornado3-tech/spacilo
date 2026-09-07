/**
 * Voice, music and sound-effect adapters.
 *
 * Provider-neutral by contract. The rules that matter:
 *   - voice and audio are produced automatically as part of a generation, never
 *     as a separate founder action;
 *   - an unavailable local voice never silently falls back to a paid API;
 *   - an asset whose licence is unknown is never used.
 */
export type AssetLicenceClass =
  | "LOCAL_LICENSED_ASSET"
  | "OPEN_LICENSED_ASSET"
  | "GENERATED_ASSET"
  | "USER_PROVIDED_ASSET";

export const USABLE_LICENCE_CLASSES: readonly AssetLicenceClass[] = [
  "LOCAL_LICENSED_ASSET",
  "OPEN_LICENSED_ASSET",
  "GENERATED_ASSET",
  "USER_PROVIDED_ASSET",
];

export type AssetProvenance = {
  id: string;
  title: string;
  licenceClass: AssetLicenceClass | null;
  licence: string | null;
  source: string | null;
  attribution: string | null;
};

/** An asset may only be used when its licensing position is actually known. */
export function mayUseAsset(asset: AssetProvenance): { allowed: boolean; reason: string } {
  if (!asset.licenceClass || !USABLE_LICENCE_CLASSES.includes(asset.licenceClass)) {
    return { allowed: false, reason: `Licensing for "${asset.title}" is unknown, so it cannot be used.` };
  }
  if (!asset.licence) {
    return { allowed: false, reason: `No licence is recorded for "${asset.title}".` };
  }
  return { allowed: true, reason: `${asset.title} — ${asset.licence}.` };
}

/* ------------------------------------------------------------------ voice */

export type VoiceStyle = "warm" | "confident" | "friendly" | "professional";
export type VoiceGender = "female" | "male" | "unspecified";

export type VoiceOption = {
  id: string;
  label: string;
  locale: string;
  gender: VoiceGender;
  style: VoiceStyle;
};

export type VoiceAdapter = {
  id: string;
  label: string;
  /** True where compute happens on the worker itself. */
  local: boolean;
  chargeable: boolean;
  voices: readonly VoiceOption[];
};

/**
 * Adapters known to the orchestrator. A worker only offers the ones it has
 * actually installed; this list is the contract, not a claim of availability.
 */
export const VOICE_ADAPTERS: readonly VoiceAdapter[] = [
  {
    id: "local-open-tts",
    label: "On-worker British English voice",
    local: true,
    chargeable: false,
    voices: [
      { id: "uk-female-warm", label: "British female, warm", locale: "en-GB", gender: "female", style: "warm" },
      { id: "uk-male-warm", label: "British male, warm", locale: "en-GB", gender: "male", style: "warm" },
      { id: "uk-female-professional", label: "British female, professional", locale: "en-GB", gender: "female", style: "professional" },
      { id: "uk-male-professional", label: "British male, professional", locale: "en-GB", gender: "male", style: "professional" },
    ],
  },
];

export type VoiceSelection =
  | { ok: true; adapter: VoiceAdapter; voice: VoiceOption }
  | { ok: false; status: "VOICE_UNAVAILABLE"; reason: string };

export function selectVoice(input: {
  /** Adapter ids the chosen worker reports as installed. */
  available: readonly string[];
  gender?: VoiceGender;
  style?: VoiceStyle;
  paidAllowed?: boolean;
}): VoiceSelection {
  const adapters = VOICE_ADAPTERS.filter(
    (adapter) =>
      input.available.includes(adapter.id) && (adapter.chargeable ? input.paidAllowed === true : true),
  );
  const adapter = adapters.find((entry) => entry.local) ?? adapters[0];
  if (!adapter) {
    return {
      ok: false,
      status: "VOICE_UNAVAILABLE",
      reason: "The selected worker cannot generate a voiceover. Choose another worker.",
    };
  }
  const voice =
    adapter.voices.find(
      (entry) =>
        (!input.gender || entry.gender === input.gender) &&
        (!input.style || entry.style === input.style),
    ) ??
    adapter.voices.find((entry) => !input.gender || entry.gender === input.gender) ??
    adapter.voices[0]!;
  return { ok: true, adapter, voice };
}

/* ------------------------------------------------------------------ music */

export type MusicMood =
  | "reassuring"
  | "emotional"
  | "energetic"
  | "professional"
  | "family"
  | "business";

export type MusicTrack = AssetProvenance & { mood: MusicMood; seconds: number };

/**
 * The open-licensed bed library shipped with the worker. Each entry records
 * where it came from so provenance survives into the video record.
 */
export const MUSIC_LIBRARY: readonly MusicTrack[] = [
  { id: "bed-open-air", title: "Open Air", mood: "reassuring", seconds: 60, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
  { id: "bed-new-chapter", title: "New Chapter", mood: "emotional", seconds: 60, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
  { id: "bed-forward", title: "Forward", mood: "energetic", seconds: 45, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
  { id: "bed-steady", title: "Steady", mood: "professional", seconds: 60, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
  { id: "bed-home", title: "Home", mood: "family", seconds: 60, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
  { id: "bed-ledger", title: "Ledger", mood: "business", seconds: 45, licenceClass: "OPEN_LICENSED_ASSET", licence: "CC0 1.0", source: "EarnRoom worker asset pack", attribution: null },
];

export type MusicSelection =
  | { ok: true; track: MusicTrack; provenance: string }
  | { ok: false; status: "AUDIO_UNAVAILABLE"; reason: string };

export function selectMusic(input: {
  mood: MusicMood;
  seconds: number;
  /** Track ids the chosen worker actually has on disk. */
  available: readonly string[];
}): MusicSelection {
  const usable = MUSIC_LIBRARY.filter(
    (track) => input.available.includes(track.id) && mayUseAsset(track).allowed,
  );
  const track =
    usable.find((entry) => entry.mood === input.mood && entry.seconds >= input.seconds) ??
    usable.find((entry) => entry.mood === input.mood) ??
    usable[0];
  if (!track) {
    return {
      ok: false,
      status: "AUDIO_UNAVAILABLE",
      reason: "No open-licensed music is available on the selected worker.",
    };
  }
  return { ok: true, track, provenance: mayUseAsset(track).reason };
}

/** Campaign objective → music mood. Deterministic, so it can be reviewed. */
export function moodForObjective(objective: string): MusicMood {
  const value = objective.toLowerCase();
  if (value.includes("host") || value.includes("income") || value.includes("earn")) return "business";
  if (value.includes("move") || value.includes("family") || value.includes("home")) return "family";
  if (value.includes("student") || value.includes("launch")) return "energetic";
  if (value.includes("trust") || value.includes("safe") || value.includes("secure")) return "reassuring";
  if (value.includes("story") || value.includes("downsiz")) return "emotional";
  return "professional";
}
