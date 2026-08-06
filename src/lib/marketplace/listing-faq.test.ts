import { describe, expect, it } from "vitest";

import { buildListingFaq } from "@/lib/marketplace/listing-faq";

describe("buildListingFaq", () => {
  it("omits questions the host has not answered", () => {
    const questions = buildListingFaq({}).map((e) => e.question);
    expect(questions).not.toContain("How do I get access to this space?");
    expect(questions).not.toContain("Is there a minimum storage period?");
  });

  it("always answers payment, cancellation and insurance", () => {
    const questions = buildListingFaq({}).map((e) => e.question);
    expect(questions).toContain("How is payment handled?");
    expect(questions).toContain("Can I cancel?");
    expect(questions).toContain("Is my stuff insured?");
  });

  it("never claims cover or guarantees safety", () => {
    const answers = buildListingFaq({ monthly_price_pence: 8000 })
      .map((e) => e.answer)
      .join(" ")
      .toLowerCase();
    expect(answers).not.toMatch(/fully insured|guaranteed safe|100% safe|zero risk/);
  });

  it("prices from the host rate plus the service fee", () => {
    const entry = buildListingFaq({ monthly_price_pence: 8000 }).find(
      (e) => e.question === "What will I pay?",
    );
    expect(entry?.answer).toContain("£80");
    expect(entry?.answer).toContain("£9.60");
  });

  it("describes access using the host's own fields", () => {
    const entry = buildListingFaq({
      access_type: "daytime",
      access_frequency: "weekly",
      access_notes: "Please text before arriving.",
    }).find((e) => e.question === "How do I get access to this space?");
    expect(entry?.answer).toContain("Daytime access");
    expect(entry?.answer).toContain("weekly visits");
    expect(entry?.answer).toContain("Please text before arriving.");
  });

  it("surfaces host restrictions when the host wrote them", () => {
    const entry = buildListingFaq({ restriction_notes: "No paint or fuel." }).find((e) =>
      e.question.startsWith("Is there anything this host"),
    );
    expect(entry?.answer).toBe("No paint or fuel.");
  });
});
