/**
 * Documents and email templates are customer-facing artefacts: they must be
 * accurate, escaped, and free of guarantee language.
 */
import { describe, expect, it } from "vitest";

import { brand } from "@/config/brand";
import { buildStorageDocument } from "@/lib/payments/documents";
import type { TransactionView } from "@/lib/payments/transactions";
import { EMAIL_TEMPLATE_IDS, EMAIL_TEMPLATES, renderEmail } from "@/lib/email/templates";

const transaction = (overrides: Partial<TransactionView> = {}): TransactionView =>
  ({
    id: "p1",
    bookingId: "b1",
    reference: "TX-ABC123",
    bookingReference: "PS-3F2A9C",
    title: "Dry garage in Southsea",
    kindLabel: "Original booking",
    status: "succeeded",
    statusLabel: "Paid",
    tone: "success",
    storagePence: 8000,
    serviceFeePence: 1000,
    totalPence: 9000,
    refundedTotalPence: 0,
    refundStatus: "none",
    refundLabel: "No refund",
    netPence: 9000,
    periodStart: "2026-01-01",
    periodEnd: "2026-02-01",
    occurredAt: "2026-01-01T10:00:00Z",
    paidAt: "2026-01-01T10:00:00Z",
    providerReference: "pi_123",
    documentsAvailable: true,
    ...overrides,
  }) as TransactionView;

const party = { name: "Jane Doe", email: "jane@example.com" };

describe("storage documents", () => {
  it("renders a receipt with the ledger amounts and references", () => {
    const doc = buildStorageDocument("receipt", transaction(), party);
    expect(doc.title).toBe("Payment receipt");
    expect(doc.filename).toBe("spacilo-receipt-TX-ABC123.html");
    expect(doc.html).toContain("£80");
    expect(doc.html).toContain("£90");
    expect(doc.html).toContain("PS-3F2A9C");
    expect(doc.html).toContain(brand.legalName);
  });

  it("shows refunded and net amounts only when money came back", () => {
    expect(buildStorageDocument("invoice", transaction(), party).html).not.toContain("Net paid");
    const refunded = buildStorageDocument(
      "invoice",
      transaction({ refundedTotalPence: 3000, netPence: 6000, refundLabel: "Partially refunded" }),
      party,
    );
    expect(refunded.html).toContain("Net paid");
    expect(refunded.html).toContain("£60");
  });

  it("refuses to produce a document for an unsettled payment", () => {
    expect(() =>
      buildStorageDocument("receipt", transaction({ documentsAvailable: false }), party),
    ).toThrow();
  });

  it("escapes user-supplied text", () => {
    const doc = buildStorageDocument("receipt", transaction({ title: "<script>x</script>" }), party);
    expect(doc.html).not.toContain("<script>");
    expect(doc.html).toContain("&lt;script&gt;");
  });
});

describe("email templates", () => {
  it("covers every operational message the marketplace sends", () => {
    expect(EMAIL_TEMPLATE_IDS.length).toBeGreaterThanOrEqual(19);
    for (const id of EMAIL_TEMPLATE_IDS) {
      expect(EMAIL_TEMPLATES[id].id).toBe(id);
    }
  });

  it("renders subject, html and a plain-text alternative", () => {
    for (const id of EMAIL_TEMPLATE_IDS) {
      const email = renderEmail(id, {
        name: "Jane",
        spaceTitle: "Dry garage",
        bookingReference: "PS-3F2A9C",
        startDate: "1 Jan 2026",
        endDate: "1 Feb 2026",
        amount: "£90.00",
        senderName: "Sam",
        subjectLine: "Update",
        body: "Details.",
      });
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain("<!doctype html>");
      expect(email.html).toContain('<meta name="viewport"');
      expect(email.html).toContain("<h1");
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.html).not.toContain("undefined");
    }
  });

  it("never promises safety or guarantees", () => {
    const banned = [/100% safe/i, /guaranteed safe/i, /fully insured/i, /zero risk/i];
    for (const id of EMAIL_TEMPLATE_IDS) {
      const email = renderEmail(id, {});
      for (const phrase of banned) expect(email.html).not.toMatch(phrase);
    }
  });

  it("escapes injected content", () => {
    const email = renderEmail("message-notification", { messagePreview: "<img src=x onerror=1>" });
    expect(email.html).not.toContain("<img src=x");
  });
});
