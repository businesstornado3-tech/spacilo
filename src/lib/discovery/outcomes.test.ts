import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { CAPABILITIES } from "@/lib/discovery/capabilities";
import { outcomeCards, OUTCOMES, outcomeDestination } from "@/lib/discovery/outcomes";
import { Route as DiscoverRoute } from "@/routes/discover";

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("outcome-led Discover", () => {
  it("publishes user outcomes rather than the capability directory", () => {
    const cards = outcomeCards();
    expect(cards).toHaveLength(9);
    expect(cards.map((card) => card.title)).toEqual(expect.arrayContaining([
      "Organise my belongings",
      "Arrange my stuff before moving",
      "Find out how much space I need",
      "Make money from unused space",
      "Find storage near me",
      "Store furniture temporarily",
      "Make better use of a garage or spare room",
      "Store business stock or equipment",
      "Student or short-term storage",
    ]));
    expect(cards.map((card) => card.title)).not.toEqual(CAPABILITIES.map((capability) => capability.name));
    expect(cards.every((card) => card.to.startsWith("/"))).toBe(true);
  });

  it("routes each initial outcome to its most useful next action", () => {
    const destinations = new Map(outcomeCards().map((card) => [card.id, card.to]));
    expect(destinations).toEqual(new Map([
      ["organise_belongings", "/spacefit/stuff"],
      ["moving_soon", "/spacefit/stuff"],
      ["how_much_space", "/spacefit/stuff"],
      ["earn_from_space", "/spacefit/space"],
      ["storage_near_me", "/search"],
      ["furniture_temporarily", "/search"],
      ["use_space_better", "/spacefit/space"],
      ["business_stock", "/search"],
      ["student_storage", "/search"],
    ]));
    expect(OUTCOMES.filter((outcome) => outcome.publish).every((outcome) => outcomeDestination(outcome).startsWith("/"))).toBe(true);
  });

  it("keeps Discover separate from Tools while preserving crawlable cross-links", () => {
    const discover = read("src/routes/discover.tsx");
    const tools = read("src/routes/tools.tsx");
    expect(discover).toContain("outcomeCards");
    expect(discover).not.toContain("capabilityIndex");
    expect(discover).toContain('to="/tools"');
    expect(discover).toContain('to="/search"');
    expect(discover).toContain("GUIDE_CLUSTERS");
    expect(tools).toContain("capabilityIndex");
    expect(tools).toContain("CAPABILITIES");
  });

  it("keeps the canonical and unique problem-oriented metadata", async () => {
    const head = await DiscoverRoute.options.head?.({} as never);
    expect(head?.links?.[0]?.href).toMatch(/\/discover$/);
    expect(head?.meta).toContainEqual({ name: "description", content: expect.stringContaining("organise belongings") });
    expect(JSON.stringify(head?.scripts)).toContain("Organise my belongings");
    expect(JSON.stringify(head?.scripts)).not.toContain("Item Scanner");
  });

  it("derives supporting capabilities through the existing intent matcher", () => {
    const cards = outcomeCards();
    expect(cards.find((card) => card.id === "organise_belongings")?.capabilities).toEqual(expect.arrayContaining(["Item Scanner"]));
    expect(cards.find((card) => card.id === "storage_near_me")?.capabilities).toEqual(expect.arrayContaining(["Location Search"]));
  });
});
