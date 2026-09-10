/**
 * Regression cover for the setup handshake failing with HTTP 403.
 *
 * EarnRoom's edge protection rejects Python's default caller name
 * ("Python-urllib/x.y") with 403 before the request reaches EarnRoom, so the
 * Windows worker could pair only if it names itself. This test fails if that
 * header is ever dropped again.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const core = readFileSync("worker/desktop/earnroom_core.py", "utf8");

describe("windows worker http identity", () => {
  it("names itself instead of using Python's default caller name", () => {
    expect(core).toContain('USER_AGENT = "EarnRoom-Video-Worker/1.0"');
    expect(core).toContain('"User-Agent": USER_AGENT');
  });

  it("sends every request through the one place that sets it", () => {
    const requests = core.match(/request\.Request\(/g) ?? [];
    expect(requests).toHaveLength(1);
    expect(core).toMatch(/def pair\([\s\S]*?post\(/);
    expect(core).toMatch(/def heartbeat\([\s\S]*?post\(/);
  });
});
