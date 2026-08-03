import { describe, expect, it } from "vitest";

import { hostEntryTarget } from "./host-entry";

describe("hostEntryTarget", () => {
  it("sends unauthenticated visitors to signup as a host", () => {
    expect(hostEntryTarget(false)).toEqual({ to: "/signup", search: { mode: "host" } });
  });

  it("sends authenticated users straight into the existing listing wizard", () => {
    expect(hostEntryTarget(true)).toEqual({ to: "/host/spaces/new" });
  });
});
