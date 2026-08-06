/**
 * Renter receipts and invoices.
 *
 * PRESENTATION ONLY. A document is a rendering of ledger rows the server
 * already wrote — it never computes, adjusts or invents an amount, and it is
 * only ever produced for a settled payment.
 */
import { brand } from "@/config/brand";
import { formatDate, formatPrice } from "@/lib/format";
import type { TransactionView } from "@/lib/payments/transactions";

export type DocumentKind = "receipt" | "invoice";

export interface DocumentParty {
  name: string;
  email: string;
}

export interface StorageDocument {
  kind: DocumentKind;
  title: string;
  filename: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const row = (label: string, value: string, strong = false): string =>
  `<tr><th scope="row" style="text-align:left;padding:8px 0;font-weight:${
    strong ? 700 : 400
  };color:#1f2a37">${escapeHtml(label)}</th><td style="text-align:right;padding:8px 0;font-weight:${
    strong ? 700 : 400
  };font-variant-numeric:tabular-nums;color:#0b1b2b">${escapeHtml(value)}</td></tr>`;

/**
 * Builds a printable, self-contained HTML document for one transaction.
 * A receipt evidences money received; an invoice itemises what it was for.
 */
export function buildStorageDocument(
  kind: DocumentKind,
  transaction: TransactionView,
  party: DocumentParty,
): StorageDocument {
  if (!transaction.documentsAvailable) {
    throw new Error("Documents are only available for settled payments");
  }

  const title = kind === "receipt" ? "Payment receipt" : "Invoice";
  const issued = transaction.paidAt ?? transaction.occurredAt;
  const period =
    transaction.periodStart && transaction.periodEnd
      ? `${formatDate(transaction.periodStart)} – ${formatDate(transaction.periodEnd)}`
      : "See booking";

  const lines = [
    row(`${transaction.kindLabel} — storage`, formatPrice(transaction.storagePence)),
    row(`${brand.name} service fee`, formatPrice(transaction.serviceFeePence)),
    row("Total paid", formatPrice(transaction.totalPence), true),
  ];
  if (transaction.refundedTotalPence > 0) {
    lines.push(
      row("Refunded", `− ${formatPrice(transaction.refundedTotalPence)}`),
      row("Net paid", formatPrice(transaction.netPence), true),
    );
  }

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${title} ${transaction.reference} — ${brand.name}`)}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px 20px; background:#ffffff; color:#0b1b2b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .doc { max-width:640px; margin:0 auto; }
  .brand { font-size:20px; font-weight:700; letter-spacing:-0.01em; color:#0d6b4f; }
  h1 { font-size:24px; margin:16px 0 4px; }
  .muted { color:#5b6b7b; font-size:14px; margin:0; }
  table { width:100%; border-collapse:collapse; margin-top:24px; font-size:15px; }
  tbody tr:last-child th, tbody tr:last-child td { border-top:1px solid #d7dee6; }
  .meta { margin-top:24px; font-size:14px; line-height:1.7; color:#1f2a37; }
  footer { margin-top:32px; font-size:12px; color:#5b6b7b; line-height:1.6; }
  @media print { body { padding:0; } }
</style>
</head>
<body>
  <main class="doc">
    <p class="brand">${escapeHtml(brand.name)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">Reference ${escapeHtml(transaction.reference)} · Issued ${escapeHtml(
      formatDate(issued),
    )}</p>

    <div class="meta">
      <div><strong>Billed to:</strong> ${escapeHtml(party.name)} (${escapeHtml(party.email)})</div>
      <div><strong>Booking:</strong> ${escapeHtml(transaction.title)} · ${escapeHtml(
        transaction.bookingReference,
      )}</div>
      <div><strong>Storage period:</strong> ${escapeHtml(period)}</div>
      <div><strong>Status:</strong> ${escapeHtml(transaction.statusLabel)}${
        transaction.refundedTotalPence > 0 ? ` · ${escapeHtml(transaction.refundLabel)}` : ""
      }</div>
      ${
        transaction.providerReference
          ? `<div><strong>Payment reference:</strong> ${escapeHtml(
              transaction.providerReference,
            )}</div>`
          : ""
      }
    </div>

    <table>
      <caption class="muted" style="text-align:left;padding-bottom:8px">Amounts in GBP</caption>
      <tbody>${lines.join("")}</tbody>
    </table>

    <footer>
      <p>${escapeHtml(brand.legalName)} · ${escapeHtml(brand.supportEmail)}</p>
      <p>This document is generated from ${escapeHtml(
        brand.name,
      )}'s payment records. VAT treatment is not shown and must be confirmed before live trading.</p>
    </footer>
  </main>
</body>
</html>`;

  return {
    kind,
    title,
    filename: `${brand.shortName.toLowerCase()}-${kind}-${transaction.reference}.html`,
    html,
  };
}

/** Browser-only: hands the generated document to the user as a download. */
export function downloadStorageDocument(doc: StorageDocument): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = doc.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
