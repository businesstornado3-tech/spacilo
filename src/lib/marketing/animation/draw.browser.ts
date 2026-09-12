/**
 * Browser Local figure and environment painter.
 *
 * Everything here is drawn with plain canvas geometry from the character and
 * environment libraries: no stock artwork, no generated imagery, no network
 * call, no cost. The same inputs always paint the same pixels.
 *
 * Browser-only module. Never imported during server rendering.
 */
import {
  character,
  expression as expressionSpec,
  pose as poseSpec,
  type CharacterMotion,
  type Expression,
  type Pose,
} from "./characters";
import type { CharacterLook } from "./casting";
import { environment, type EnvShape, type EnvironmentId } from "./environments";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

/* ------------------------------------------------------------ environments */

export type CameraFrame = {
  /** Extra scale applied by the camera move. */
  scale: number;
  /** Pan in pixels. */
  panX: number;
  panY: number;
};

function paintEnvShape(
  ctx: CanvasRenderingContext2D,
  shape: EnvShape,
  width: number,
  height: number,
) {
  ctx.beginPath();
  if (shape.kind === "rect") {
    const x = shape.x * width;
    const y = shape.y * height;
    const w = shape.w * width;
    const h = shape.h * height;
    const radius = (shape.radius ?? 0) * width;
    if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
  } else if (shape.kind === "circle") {
    ctx.arc(shape.x * width, shape.y * height, shape.r * width, 0, Math.PI * 2);
  } else {
    shape.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x * width, point.y * height);
      else ctx.lineTo(point.x * width, point.y * height);
    });
    if (shape.closed) ctx.closePath();
  }
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = Math.max(1, (shape.lineWidth ?? 0.003) * width);
    ctx.stroke();
  }
}

/**
 * Paints one depth layer of an environment. Layers move at different speeds
 * under the same camera move, which is what produces the 2.5D depth.
 */
export function drawEnvironmentLayer(
  ctx: CanvasRenderingContext2D,
  id: EnvironmentId,
  layer: "back" | "mid" | "fore",
  frame: { width: number; height: number; camera: CameraFrame },
) {
  const env = environment(id);
  const depth = layer === "back" ? 0.3 : layer === "mid" ? 0.65 : 1;
  const { width, height, camera } = frame;

  ctx.save();
  ctx.translate(width / 2 + camera.panX * depth, height / 2 + camera.panY * depth);
  const scale = 1 + (camera.scale - 1) * (0.6 + depth * 0.5);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);

  if (layer === "back") {
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, env.sky[0]);
    wash.addColorStop(1, env.sky[1]);
    ctx.fillStyle = wash;
    // Painted oversized so a camera push never reveals an empty edge.
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, height * 1.6);
  }

  for (const shape of env[layer]) paintEnvShape(ctx, shape, width, height);
  ctx.restore();
}

/** Where a character's feet belong in this environment. */
export function groundLine(id: EnvironmentId): number {
  return environment(id).ground;
}

/* ------------------------------------------------------------- characters */

export type FigureRequest = {
  characterId: string;
  pose: Pose;
  expression: Expression;
  motion: CharacterMotion;
  /** Centre of the figure, in pixels. */
  x: number;
  /** Where the feet stand, in pixels. */
  groundY: number;
  /** Total figure height in pixels. */
  height: number;
  facing: 1 | -1;
  /**
   * This campaign's fixed appearance for this person. Absent falls back to the
   * library default, so nothing breaks when no casting was supplied.
   */
  look?: CharacterLook | null;
  /** Seconds since the character entered the scene. */
  elapsed: number;
  /** 0..1 fade for the character's entrance. */
  opacity: number;
};

type Point = { x: number; y: number };

function limb(from: Point, angle: number, length: number): Point {
  // Angle 0 points straight down; positive swings the limb forward.
  return { x: from.x + Math.sin(angle) * length, y: from.y + Math.cos(angle) * length };
}

function stroke(ctx: CanvasRenderingContext2D, points: Point[], widthPx: number, colour: string) {
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = widthPx;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Small deterministic motion offsets, per primitive. No randomness anywhere. */
function motionOffsets(motion: CharacterMotion, elapsed: number, height: number) {
  const breathe = Math.sin(elapsed * 1.8) * height * 0.004;
  const walkCycle = Math.sin(elapsed * 6.2);
  switch (motion) {
    case "walkIn":
      return {
        dx: -(1 - easeOut(elapsed / 1.1)) * height * 0.55,
        dy: breathe,
        swing: walkCycle,
        head: 0,
        arm: 0,
      };
    case "walkOut":
      return {
        dx: easeOut(elapsed / 1.1) * height * 0.55,
        dy: breathe,
        swing: walkCycle,
        head: 0,
        arm: 0,
      };
    case "lookAround":
      return { dx: 0, dy: breathe, swing: 0, head: Math.sin(elapsed * 1.5) * 0.28, arm: 0 };
    case "lookAtPhone":
      return { dx: 0, dy: breathe, swing: 0, head: -0.06, arm: Math.sin(elapsed * 2.4) * 0.05 };
    case "gesture":
    case "point":
      return { dx: 0, dy: breathe, swing: 0, head: 0.06, arm: Math.sin(elapsed * 2.1) * 0.16 };
    case "pickUp":
      return {
        dx: 0,
        dy: breathe - easeOut(elapsed / 1.2) * height * 0.02,
        swing: 0,
        head: -0.1,
        arm: 0,
      };
    case "putDown":
      return {
        dx: 0,
        dy: breathe + easeOut(elapsed / 1.2) * height * 0.03,
        swing: 0,
        head: -0.12,
        arm: 0,
      };
    case "nod":
      return { dx: 0, dy: breathe, swing: 0, head: Math.sin(elapsed * 3.2) * 0.12, arm: 0 };
    case "smallWave":
      return { dx: 0, dy: breathe, swing: 0, head: 0.04, arm: Math.sin(elapsed * 6) * 0.35 };
    case "relief":
      return {
        dx: 0,
        dy: breathe - Math.sin(elapsed * 1.2) * height * 0.006,
        swing: 0,
        head: 0.08,
        arm: 0,
      };
    case "idle":
    default:
      return { dx: 0, dy: breathe, swing: 0, head: Math.sin(elapsed * 0.8) * 0.03, arm: 0 };
  }
}

function drawCarriedBox(
  ctx: CanvasRenderingContext2D,
  centre: Point,
  size: number,
  stacked: boolean,
) {
  const draw = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#d7a86a";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, w * 0.06);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = "#c1904f";
    ctx.fillRect(x, y, w, h * 0.16);
    ctx.fillRect(x + w / 2 - w * 0.02, y, w * 0.04, h);
  };
  draw(centre.x - size / 2, centre.y - size / 2, size, size * 0.82);
  if (stacked) draw(centre.x - size * 0.42, centre.y - size * 1.3, size * 0.84, size * 0.7);
}

function drawPhone(ctx: CanvasRenderingContext2D, at: Point, size: number) {
  ctx.fillStyle = "#1d2733";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function")
    ctx.roundRect(at.x - size * 0.22, at.y - size * 0.36, size * 0.44, size * 0.72, size * 0.08);
  else ctx.rect(at.x - size * 0.22, at.y - size * 0.36, size * 0.44, size * 0.72);
  ctx.fill();
  ctx.fillStyle = "#cdeadf";
  ctx.fillRect(at.x - size * 0.17, at.y - size * 0.3, size * 0.34, size * 0.6);
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  head: Point,
  radius: number,
  look: number,
  expression: Expression,
  design: ReturnType<typeof character>,
  facing: 1 | -1,
) {
  const face = expressionSpec(expression);
  const eyeY = head.y - radius * 0.08;
  const eyeGap = radius * 0.36;
  const offset = (face.eyeLook + look * 0.4) * radius * 0.18 * facing;

  for (const side of [-1, 1]) {
    const cx = head.x + side * eyeGap + offset;
    ctx.fillStyle = "#25303a";
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, radius * 0.09, radius * 0.11 * face.eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    // Brow: tilt carries most of the emotion.
    ctx.strokeStyle = design.hair;
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.14, eyeY - radius * 0.34 + side * face.browTilt * radius * 0.1);
    ctx.lineTo(cx + radius * 0.14, eyeY - radius * 0.34 - side * face.browTilt * radius * 0.1);
    ctx.stroke();
  }

  const mouthY = head.y + radius * 0.4;
  ctx.strokeStyle = "#8a5b4a";
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(head.x - radius * face.mouthWidth * 0.5 + offset, mouthY);
  ctx.quadraticCurveTo(
    head.x + offset,
    mouthY + face.mouthCurve * radius * 0.42,
    head.x + radius * face.mouthWidth * 0.5 + offset,
    mouthY,
  );
  ctx.stroke();
}

/**
 * Paints one character. Layers are drawn far-side first, so arms and carried
 * objects sit correctly in front of the body.
 */
export function drawCharacterFigure(ctx: CanvasRenderingContext2D, request: FigureRequest) {
  const design = request.look ?? character(request.characterId as never);
  // Appearance only: how wide the body is drawn and how large the head reads.
  const build = request.look?.build ?? 1;
  const headScale = request.look?.headScale ?? 1;
  const spec = poseSpec(request.pose);
  const move = motionOffsets(request.motion, request.elapsed, request.height);
  const H = request.height;
  const f = request.facing;

  const cx = request.x + move.dx * f;
  const ground = request.groundY + move.dy + spec.crouch * H * 0.4 - spec.lift * H;

  const hip: Point = { x: cx + spec.lean * H * 0.08 * f, y: ground - H * 0.46 };
  const shoulder: Point = { x: cx + spec.lean * H * 0.16 * f, y: ground - H * 0.8 };
  const headR = H * 0.1 * headScale;
  const headCentre: Point = {
    x: shoulder.x + (spec.headTurn + move.head) * H * 0.02 * f,
    y: ground - H * 0.9 + spec.headTilt * H * 0.008,
  };

  ctx.save();
  ctx.globalAlpha = request.opacity;

  /* contact shadow — grounds the figure in the scene */
  ctx.save();
  ctx.globalAlpha = request.opacity * 0.18;
  ctx.fillStyle = "#1d2733";
  ctx.beginPath();
  ctx.ellipse(cx, request.groundY, H * 0.17, H * 0.026, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const limbWidth = H * 0.055;

  /* far leg + far arm */
  const farHip: Point = { x: hip.x - H * 0.045 * f, y: hip.y };
  const farKnee = limb(farHip, (spec.legFar + move.swing * 0.3) * f, H * 0.24);
  const farFoot = limb(farKnee, (spec.legFar * 0.2 - move.swing * 0.18) * f, H * 0.22);
  stroke(ctx, [farHip, farKnee, farFoot], limbWidth, shade(design.trousers, -0.12));

  const farShoulder: Point = { x: shoulder.x - H * 0.06 * f, y: shoulder.y + H * 0.02 };
  const farElbow = limb(
    farShoulder,
    (spec.armFar.shoulder + move.arm - move.swing * 0.3) * f,
    H * 0.2,
  );
  const farHand = limb(
    farElbow,
    (spec.armFar.shoulder + spec.armFar.elbow + move.arm) * f,
    H * 0.19,
  );
  stroke(ctx, [farShoulder, farElbow, farHand], limbWidth * 0.86, shade(design.sleeve, -0.1));

  /* near leg */
  const nearHip: Point = { x: hip.x + H * 0.045 * f, y: hip.y };
  const nearKnee = limb(nearHip, (spec.legNear - move.swing * 0.3) * f, H * 0.24);
  const nearFoot = limb(nearKnee, (spec.legNear * 0.2 + move.swing * 0.18) * f, H * 0.22);
  stroke(ctx, [nearHip, nearKnee, nearFoot], limbWidth, design.trousers);

  /* shoes */
  ctx.fillStyle = design.shoes;
  for (const foot of [farFoot, nearFoot]) {
    ctx.beginPath();
    ctx.ellipse(
      foot.x + H * 0.015 * f,
      foot.y + H * 0.012,
      H * 0.045,
      H * 0.018,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  /* torso */
  ctx.beginPath();
  ctx.moveTo(shoulder.x - H * 0.105 * build, shoulder.y);
  ctx.quadraticCurveTo(
    shoulder.x - H * 0.12 * build,
    hip.y - H * 0.1,
    hip.x - H * 0.085 * build,
    hip.y + H * 0.02,
  );
  ctx.lineTo(hip.x + H * 0.085 * build, hip.y + H * 0.02);
  ctx.quadraticCurveTo(
    shoulder.x + H * 0.12 * build,
    hip.y - H * 0.1,
    shoulder.x + H * 0.105 * build,
    shoulder.y,
  );
  ctx.quadraticCurveTo(
    shoulder.x,
    shoulder.y - H * 0.05,
    shoulder.x - H * 0.105 * build,
    shoulder.y,
  );
  ctx.closePath();
  const torso = ctx.createLinearGradient(shoulder.x, shoulder.y, shoulder.x, hip.y);
  torso.addColorStop(0, shade(design.top, 0.08));
  torso.addColorStop(1, design.top);
  ctx.fillStyle = torso;
  ctx.fill();

  /* neck + head */
  ctx.fillStyle = shade(design.skin, -0.08);
  ctx.fillRect(headCentre.x - H * 0.026, headCentre.y, H * 0.052, H * 0.07);
  ctx.beginPath();
  ctx.ellipse(headCentre.x, headCentre.y, headR * 0.92, headR, 0, 0, Math.PI * 2);
  ctx.fillStyle = design.skin;
  ctx.fill();

  /* hair */
  ctx.fillStyle = design.hair;
  ctx.beginPath();
  if (design.hairStyle === "bob") {
    ctx.ellipse(
      headCentre.x,
      headCentre.y - headR * 0.1,
      headR * 1.02,
      headR * 1.02,
      0,
      Math.PI,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      headCentre.x - headR * 0.9,
      headCentre.y + headR * 0.15,
      headR * 0.24,
      headR * 0.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.ellipse(
      headCentre.x + headR * 0.9,
      headCentre.y + headR * 0.15,
      headR * 0.24,
      headR * 0.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else if (design.hairStyle === "tied") {
    ctx.ellipse(
      headCentre.x,
      headCentre.y - headR * 0.16,
      headR * 0.98,
      headR * 0.86,
      0,
      Math.PI,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headCentre.x - headR * f, headCentre.y - headR * 0.5, headR * 0.34, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.ellipse(
      headCentre.x,
      headCentre.y - headR * 0.2,
      headR * 0.96,
      headR * 0.8,
      0,
      Math.PI,
      Math.PI * 2,
    );
    ctx.fill();
  }

  drawFace(ctx, headCentre, headR, move.head, request.expression, design, f);

  /* glasses, when this campaign's character wears them */
  if (request.look?.glasses) {
    ctx.strokeStyle = "#2c3742";
    ctx.lineWidth = Math.max(1, headR * 0.08);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(
        headCentre.x + side * headR * 0.36,
        headCentre.y - headR * 0.08,
        headR * 0.26,
        headR * 0.22,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(headCentre.x - headR * 0.1, headCentre.y - headR * 0.08);
    ctx.lineTo(headCentre.x + headR * 0.1, headCentre.y - headR * 0.08);
    ctx.stroke();
  }

  /* near arm, plus whatever is being carried */
  const nearShoulder: Point = { x: shoulder.x + H * 0.06 * f, y: shoulder.y + H * 0.02 };
  const nearElbow = limb(
    nearShoulder,
    (spec.armNear.shoulder - move.arm + move.swing * 0.3) * f,
    H * 0.2,
  );
  const nearHand = limb(
    nearElbow,
    (spec.armNear.shoulder + spec.armNear.elbow - move.arm) * f,
    H * 0.19,
  );

  if (spec.carry === "box" || spec.carry === "boxes") {
    const centre = { x: (farHand.x + nearHand.x) / 2, y: (farHand.y + nearHand.y) / 2 - H * 0.02 };
    drawCarriedBox(ctx, centre, H * 0.26, spec.carry === "boxes");
  }

  stroke(ctx, [nearShoulder, nearElbow, nearHand], limbWidth * 0.86, design.sleeve);
  ctx.fillStyle = design.skin;
  ctx.beginPath();
  ctx.arc(nearHand.x, nearHand.y, H * 0.032, 0, Math.PI * 2);
  ctx.arc(farHand.x, farHand.y, H * 0.03, 0, Math.PI * 2);
  ctx.fill();

  if (spec.carry === "phone") drawPhone(ctx, { x: nearHand.x, y: nearHand.y - H * 0.02 }, H * 0.2);

  ctx.restore();
}

/** Lightens or darkens a hex colour deterministically, for simple shading. */
export function shade(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const channels = [0, 2, 4].map((offset) => {
    const base = parseInt(value.slice(offset, offset + 2), 16);
    const next = amount >= 0 ? base + (255 - base) * amount : base * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, next)))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}
