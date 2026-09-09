import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { brand } from "@/config/brand";
import { deletionSections } from "@/data/data-deletion";
import { googleSections } from "@/data/google-data";
import { isPrivateRoute, isPublicStaticRoute } from "@/lib/seo/routes";

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

const allGoogleText = googleSections
  .map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`)
  .join(" ");
const allDeletionText = deletionSections
  .map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`)
  .join(" ");

describe("privacy page — Google user data disclosures", () => {
  const privacy = readText("src/routes/privacy.tsx");

  it("renders the Google section on the public privacy route", () => {
    expect(privacy).toContain("Google User Data and YouTube Integration");
    expect(privacy).toContain("googleSections");
  });

  it("states WHAT Google user data is accessed, with the exact scopes", () => {
    expect(allGoogleText).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(allGoogleText).toContain("https://www.googleapis.com/auth/youtube.readonly");
    expect(allGoogleText).toMatch(/does not access Gmail/i);
  });

  it("states HOW Google user data is used", () => {
    expect(googleSections.some((s) => /How .* uses Google user data/i.test(s.heading))).toBe(true);
    expect(allGoogleText).toMatch(/Connect YouTube/);
    expect(allGoogleText).toMatch(/train, retrain or improve AI/i);
  });

  it("states WITH WHOM Google user data is shared", () => {
    expect(googleSections.some((s) => /shares, transfers or discloses/i.test(s.heading))).toBe(true);
    expect(allGoogleText).toMatch(/does not sell, rent or licence Google user data/i);
  });

  it("states the security mechanisms that protect Google user data", () => {
    expect(googleSections.some((s) => /protects Google user data/i.test(s.heading))).toBe(true);
    expect(allGoogleText).toMatch(/AES-GCM/);
    expect(allGoogleText).toMatch(/single-use and expires/i);
    expect(allGoogleText).toMatch(/HTTPS/);
  });

  it("covers revocation, deletion and Google limited use", () => {
    expect(allGoogleText).toContain("https://myaccount.google.com/permissions");
    expect(allGoogleText).toContain("Google API Services User Data Policy");
  });

  it("makes no unverified certification or retention-period claims", () => {
    expect(allGoogleText).not.toMatch(/SOC 2|ISO 27001|penetration test/i);
  });
});

describe("data deletion instructions page", () => {
  const page = readText("src/routes/legal.data-deletion.tsx");

  it("renders with the required title and links", () => {
    expect(page).toContain("Data Deletion Instructions");
    expect(page).toContain('to="/privacy"');
    expect(page).toContain('to="/legal"');
  });

  it("gives a real contact route and no invented timeframe", () => {
    expect(allDeletionText).toContain(brand.supportEmail);
    expect(brand.supportEmail).not.toContain("example");
    expect(allDeletionText).toMatch(/do not publish a guaranteed turnaround time/i);
  });

  it("explains identification, tokens and lawful retention", () => {
    expect(allDeletionText).toMatch(/email address you used/i);
    expect(allDeletionText).toMatch(/access token/i);
    expect(allDeletionText).toMatch(/legal, accounting, tax/i);
  });
});

describe("compliance routes stay public", () => {
  it("privacy, legal and data-deletion are public and indexable", () => {
    for (const route of ["/privacy", "/legal", "/legal/data-deletion"]) {
      expect(isPrivateRoute(route)).toBe(false);
    }
    expect(isPublicStaticRoute("/legal/data-deletion")).toBe(true);
  });
});

describe("OAuth integration is unchanged", () => {
  const oauth = readText("src/lib/marketing/oauth.ts");
  const callback = readText("src/routes/api/public/marketing/oauth/$platform.ts");

  it("keeps the YouTube scopes", () => {
    expect(oauth).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(oauth).toContain("https://www.googleapis.com/auth/youtube.readonly");
  });

  it("keeps the Instagram Login scopes", () => {
    const instagram = readText("src/lib/marketing/instagram-login.ts");
    expect(instagram).toContain("instagram_business_basic");
    expect(instagram).toContain("instagram_business_content_publish");
  });

  it("keeps the Facebook page scopes", () => {
    expect(oauth).toContain("pages_manage_posts");
    expect(oauth).toContain("pages_show_list");
  });

  it("keeps the shared public callback route for every platform", () => {
    for (const platform of ["youtube", "facebook", "instagram"]) {
      expect(callback).toContain(`"${platform}"`);
    }
    expect(callback).toContain("/api/public/marketing/oauth/$platform");
  });
});
