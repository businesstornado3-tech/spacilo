import { describe, expect, it } from "vitest";

import {
  addPoint,
  boundaryAreaPx,
  defaultBoundary,
  edgeLengthPx,
  isValidBoundary,
  MAX_POLYGON_POINTS,
  moveHandle,
  removePoint,
  selfIntersects,
  type CircleBoundary,
  type PolygonBoundary,
} from "@/lib/livescan/boundary";

const frame = { width: 1000, height: 1000 };

describe("boundary geometry", () => {
  it("measures a rectangle's area in pixels", () => {
    const boundary: PolygonBoundary = {
      shape: "rectangle",
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.2 },
        { x: 0.6, y: 0.7 },
        { x: 0.2, y: 0.7 },
      ],
    };
    expect(boundaryAreaPx(boundary, frame)).toBeCloseTo(400 * 500, 5);
  });

  it("keeps a square square when a corner is dragged", () => {
    const square = defaultBoundary("square") as PolygonBoundary;
    const moved = moveHandle(square, 2, { x: 0.9, y: 0.6 }) as PolygonBoundary;
    const width = edgeLengthPx(moved.points, 0, frame)!;
    const height = edgeLengthPx(moved.points, 1, frame)!;
    expect(width).toBeCloseTo(height, 5);
  });

  it("moves a free rectangle corner without constraining the others", () => {
    const rect = defaultBoundary("rectangle") as PolygonBoundary;
    const moved = moveHandle(rect, 1, { x: 0.95, y: 0.2 }) as PolygonBoundary;
    expect(moved.points[1]).toEqual({ x: 0.95, y: 0.2 });
    expect(moved.points[0]).toEqual(rect.points[0]);
  });

  it("clamps handles inside the frame", () => {
    const rect = defaultBoundary("rectangle") as PolygonBoundary;
    const moved = moveHandle(rect, 0, { x: -3, y: 4 }) as PolygonBoundary;
    expect(moved.points[0]).toEqual({ x: 0, y: 1 });
  });

  it("resizes a circle from its radius handle only", () => {
    const circle = defaultBoundary("circle") as CircleBoundary;
    const moved = moveHandle(circle, 1, { x: 0.9, y: 0.6 }) as CircleBoundary;
    expect(moved.centre).toEqual(circle.centre);
    expect(moved.radius).toBeCloseTo(0.4, 5);
  });

  it("adds and removes polygon points within limits", () => {
    let polygon = defaultBoundary("polygon") as PolygonBoundary;
    polygon = addPoint(polygon, 0) as PolygonBoundary;
    expect(polygon.points).toHaveLength(5);
    while (polygon.points.length < MAX_POLYGON_POINTS) {
      polygon = addPoint(polygon, 0) as PolygonBoundary;
    }
    expect((addPoint(polygon, 0) as PolygonBoundary).points).toHaveLength(MAX_POLYGON_POINTS);

    let small: PolygonBoundary = {
      shape: "polygon",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ],
    };
    small = removePoint(small, 0) as PolygonBoundary;
    expect(small.points).toHaveLength(3);
  });

  it("detects a self-crossing outline as invalid", () => {
    const bowtie = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 },
    ];
    expect(selfIntersects(bowtie)).toBe(true);
    expect(isValidBoundary({ shape: "polygon", points: bowtie })).toBe(false);
    expect(isValidBoundary(defaultBoundary("rectangle"))).toBe(true);
  });
});
