/**
 * Shared EarnRoom email layout.
 *
 * Provider-agnostic on purpose: this module only RENDERS HTML and plain text.
 * No provider, API key, domain or send path is configured here, and nothing in
 * this folder may send an email.
 *
 * Design constraints:
 * - Table-based, 600px max, single column: renders in Outlook and Gmail.
 * - Inline styles only — email clients strip <style> blocks unpredictably.
 * - Light background always, with `color-scheme` so dark-mode clients tint
 *   rather than invert the layout into something unreadable.
 * - Accessible: real <h1>, semantic lists, role="presentation" on layout
 *   tables, ≥16px body text, 44px tap targets, visible link text.
 */
import { brand } from "@/config/brand";

const EMAIL_LOGO_URL =
  "https://earnroom.co.uk/__l5e/assets-v1/" +
  "2ed11e8d-a66b-4710-8062-1c468565b872/earnroom-lockup.png";

export const EMAIL_PALETTE = {
  /** Deep navy — headings and body copy. */
  ink: "#0b1b2b",
  muted: "#5b6b7b",
  /** Emerald — the single accent used for actions. */
  accent: "#0d6b4f",
  accentInk: "#ffffff",
  surface: "#ffffff",
  canvas: "#f4f7f5",
  border: "#d7dee6",
} as const;

export interface EmailButton {
  label: string;
  /** Absolute URL. Left as a token until the production domain is configured. */
  url: string;
}

export interface EmailFact {
  label: string;
  value: string;
}

export interface EmailContent {
  /** Inbox preview line. Kept short and specific — never marketing copy. */
  preheader: string;
  heading: string;
  /** Paragraphs, in order. */
  paragraphs: string[];
  facts?: EmailFact[];
  button?: EmailButton;
  /** Small print under the action, e.g. a safety or expiry note. */
  footnote?: string;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraph = (text: string): string =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${
    EMAIL_PALETTE.ink
  }">${escapeHtml(text)}</p>`;

const factsTable = (facts: EmailFact[]): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1px solid ${
    EMAIL_PALETTE.border
  };border-radius:12px;background:${EMAIL_PALETTE.canvas}">
      <tbody>${facts
        .map(
          (fact) =>
            `<tr><th scope="row" style="text-align:left;padding:10px 16px;font-size:14px;font-weight:400;color:${
              EMAIL_PALETTE.muted
            }">${escapeHtml(fact.label)}</th><td style="text-align:right;padding:10px 16px;font-size:15px;font-weight:600;color:${
              EMAIL_PALETTE.ink
            }">${escapeHtml(fact.value)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;

const button = (cta: EmailButton): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tbody><tr><td style="border-radius:12px;background:${EMAIL_PALETTE.accent}">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;min-height:44px;padding:13px 24px;font-size:16px;font-weight:600;line-height:18px;color:${
          EMAIL_PALETTE.accentInk
        };text-decoration:none;border-radius:12px">${escapeHtml(cta.label)}</a>
      </td></tr></tbody>
    </table>`;

/** Full, standalone HTML document for one email. */
export function renderEmailHtml(content: EmailContent): string {
  return `<!doctype html>
<html lang="en-GB" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_PALETTE.canvas};color:${EMAIL_PALETTE.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_PALETTE.canvas}">
<tbody><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${EMAIL_PALETTE.surface};border:1px solid ${EMAIL_PALETTE.border};border-radius:16px">
    <tbody>
      <tr><td style="padding:24px 24px 0">
        <img src="${EMAIL_LOGO_URL}" width="250" alt="${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline)}" style="display:block;width:250px;max-width:100%;height:auto;border:0">
      </td></tr>
      <tr><td style="padding:16px 24px 8px">
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:${EMAIL_PALETTE.ink}">${escapeHtml(content.heading)}</h1>
        ${content.paragraphs.map(paragraph).join("")}
        ${content.facts && content.facts.length > 0 ? factsTable(content.facts) : ""}
        ${content.button ? button(content.button) : ""}
        ${
          content.footnote
            ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${EMAIL_PALETTE.muted}">${escapeHtml(content.footnote)}</p>`
            : ""
        }
      </td></tr>
      <tr><td style="padding:16px 24px 24px;border-top:1px solid ${EMAIL_PALETTE.border}">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${EMAIL_PALETTE.muted}">
          ${escapeHtml(brand.legalName)} · ${escapeHtml(brand.supportEmail)}<br>
          You're receiving this because of activity on your ${escapeHtml(brand.name)} account.
        </p>
      </td></tr>
    </tbody>
  </table>
</td></tr></tbody>
</table>
</body>
</html>`;
}

/** Plain-text alternative — required for deliverability and screen readers. */
export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.heading, "", ...content.paragraphs];
  if (content.facts?.length) {
    lines.push("");
    for (const fact of content.facts) lines.push(`${fact.label}: ${fact.value}`);
  }
  if (content.button) lines.push("", `${content.button.label}: ${content.button.url}`);
  if (content.footnote) lines.push("", content.footnote);
  lines.push("", `${brand.legalName} · ${brand.supportEmail}`);
  return lines.join("\n");
}
