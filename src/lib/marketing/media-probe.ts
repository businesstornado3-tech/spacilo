/**
 * MP4 media probe.
 *
 * The requested dimensions are never trusted. After a worker returns a file we
 * read the container itself and report what is actually inside it, so a video
 * is only ever marked ready when a real, playable MP4 exists.
 *
 * Pure module: operates on bytes, no network, no file system.
 */
export type MediaProbe = {
  ok: boolean;
  bytes: number;
  container: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudioTrack: boolean;
  reason: string | null;
};

type Box = { type: string; start: number; end: number };

function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 1 + 3),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(view.getBigUint64(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push({ type, start: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function findBox(view: DataView, path: readonly string[], start: number, end: number): Box | null {
  let boxes = readBoxes(view, start, end);
  let found: Box | null = null;
  for (const type of path) {
    found = boxes.find((box) => box.type === type) ?? null;
    if (!found) return null;
    boxes = readBoxes(view, found.start, found.end);
  }
  return found;
}

/** Reads the real duration, dimensions and track make-up of an MP4/MOV file. */
export function probeMp4(buffer: ArrayBuffer): MediaProbe {
  const bytes = buffer.byteLength;
  const base: MediaProbe = {
    ok: false,
    bytes,
    container: null,
    durationSeconds: null,
    width: null,
    height: null,
    fps: null,
    hasAudioTrack: false,
    reason: null,
  };
  if (bytes < 1024) return { ...base, reason: "The file is too small to be a video." };

  const view = new DataView(buffer);
  const top = readBoxes(view, 0, bytes);
  const ftyp = top.find((box) => box.type === "ftyp");
  if (!ftyp) return { ...base, reason: "The file is not an MP4 container." };
  const brand = String.fromCharCode(
    view.getUint8(ftyp.start),
    view.getUint8(ftyp.start + 1),
    view.getUint8(ftyp.start + 2),
    view.getUint8(ftyp.start + 3),
  );
  const moov = top.find((box) => box.type === "moov");
  if (!moov) return { ...base, container: brand, reason: "The file has no playable movie index." };

  const mvhd = findBox(view, ["mvhd"], moov.start, moov.end);
  let duration: number | null = null;
  if (mvhd) {
    const version = view.getUint8(mvhd.start);
    if (version === 1) {
      const timescale = view.getUint32(mvhd.start + 20);
      const units = Number(view.getBigUint64(mvhd.start + 24));
      duration = timescale > 0 ? units / timescale : null;
    } else {
      const timescale = view.getUint32(mvhd.start + 12);
      const units = view.getUint32(mvhd.start + 16);
      duration = timescale > 0 ? units / timescale : null;
    }
  }

  let width: number | null = null;
  let height: number | null = null;
  let hasAudio = false;
  let fps: number | null = null;

  for (const trak of readBoxes(view, moov.start, moov.end).filter((box) => box.type === "trak")) {
    const tkhd = findBox(view, ["tkhd"], trak.start, trak.end);
    const hdlr = findBox(view, ["mdia", "hdlr"], trak.start, trak.end);
    const handler = hdlr
      ? String.fromCharCode(
          view.getUint8(hdlr.start + 8),
          view.getUint8(hdlr.start + 9),
          view.getUint8(hdlr.start + 10),
          view.getUint8(hdlr.start + 11),
        )
      : "";
    if (handler === "soun") hasAudio = true;
    if (handler === "vide" && tkhd) {
      const version = view.getUint8(tkhd.start);
      // tkhd payload: the fixed-point width/height sit right after the 36-byte
      // display matrix — 88 bytes in for the 64-bit variant, 76 for the 32-bit one.
      const dimensionOffset = tkhd.start + (version === 1 ? 88 : 76);
      if (dimensionOffset + 8 <= tkhd.end) {
        width = view.getUint32(dimensionOffset) / 65536;
        height = view.getUint32(dimensionOffset + 4) / 65536;
      }
      const mdhd = findBox(view, ["mdia", "mdhd"], trak.start, trak.end);
      const stts = findBox(view, ["mdia", "minf", "stbl", "stts"], trak.start, trak.end);
      if (mdhd && stts) {
        const mdhdVersion = view.getUint8(mdhd.start);
        const timescale = view.getUint32(mdhd.start + (mdhdVersion === 1 ? 20 : 12));
        const sampleDelta = stts.start + 16 <= stts.end ? view.getUint32(stts.start + 12) : 0;
        if (timescale > 0 && sampleDelta > 0) fps = Math.round(timescale / sampleDelta);
      }
    }
  }

  if (!width || !height) {
    return {
      ...base,
      container: brand,
      durationSeconds: duration,
      reason: "No video track found.",
    };
  }

  return {
    ok: true,
    bytes,
    container: brand,
    durationSeconds: duration,
    width: Math.round(width),
    height: Math.round(height),
    fps,
    hasAudioTrack: hasAudio,
    reason: null,
  };
}

export type MediaExpectation = {
  aspect: "9:16" | "16:9" | "1:1";
  seconds: number;
  /** Allowed drift in seconds between requested and actual duration. */
  toleranceSeconds?: number;
  expectAudio?: boolean;
};

export type MediaValidation = {
  passed: boolean;
  probe: MediaProbe;
  failures: string[];
};

const RATIOS: Record<MediaExpectation["aspect"], number> = {
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
};

/** Checks the file that actually arrived against what the campaign asked for. */
export function validateMedia(buffer: ArrayBuffer, expect: MediaExpectation): MediaValidation {
  const probe = probeMp4(buffer);
  const failures: string[] = [];
  if (!probe.ok) {
    failures.push(probe.reason ?? "The file is not a playable video.");
    return { passed: false, probe, failures };
  }
  const ratio = probe.width! / probe.height!;
  if (Math.abs(ratio - RATIOS[expect.aspect]) > 0.05) {
    failures.push(
      `The finished file is ${probe.width}×${probe.height}, which is not ${expect.aspect}.`,
    );
  }
  const tolerance = expect.toleranceSeconds ?? 1.5;
  if (probe.durationSeconds === null) {
    failures.push("The finished file reports no duration.");
  } else if (Math.abs(probe.durationSeconds - expect.seconds) > tolerance) {
    failures.push(
      `The finished file runs ${probe.durationSeconds.toFixed(1)}s, not the requested ${expect.seconds}s.`,
    );
  }
  if (expect.expectAudio && !probe.hasAudioTrack) failures.push("The finished file has no sound.");
  return { passed: failures.length === 0, probe, failures };
}
