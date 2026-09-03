import { describe, expect, it } from "vitest";

import { itemListJsonLd, webPageJsonLd } from "./structured-data";

describe("discovery structured data", () => {
  it("builds factual WebPage and ItemList shapes", () => {
    const page = webPageJsonLd({ name: "Tools", description: "EarnRoom tools", path: "/tools" });
    const list = itemListJsonLd([{ name: "Item Scanner", path: "/tools/item-scanner" }]);
    expect(page["@type"]).toBe("WebPage");
    expect(list["itemListElement"]).toHaveLength(1);
    expect(JSON.stringify({ page, list })).not.toMatch(/undefined/);
  });
});
