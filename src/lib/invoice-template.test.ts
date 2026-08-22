import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_INVOICE_TEMPLATE,
  INVOICE_SECTION_IDS,
  INVOICE_TEMPLATE_PRESETS,
  calcInvoiceGst,
  mergeInvoiceTemplate,
} from "./invoice-template.ts";

describe("invoicing (iProjectX platform default)", () => {
  it("defaults the commercial invoice to the iProjectX brand, not a customer", () => {
    assert.equal(DEFAULT_INVOICE_TEMPLATE.company_name, "iProjectX");
    assert.equal(DEFAULT_INVOICE_TEMPLATE.company_email, "billing@iprojectx.com");
    assert.equal(DEFAULT_INVOICE_TEMPLATE.gst_enabled, true);
    assert.equal(DEFAULT_INVOICE_TEMPLATE.gst_percent, 18);
    assert.deepEqual(
      INVOICE_TEMPLATE_PRESETS.map((p) => p.id),
      ["standard", "compact", "modern"],
    );
    assert.equal(INVOICE_SECTION_IDS.length, 10);
  });

  it("adds GST on exclusive amounts and extracts it from inclusive ones", () => {
    const exclusive = calcInvoiceGst(10_000, {
      gst_enabled: true,
      gst_percent: 10,
      gst_label: "GST",
      gst_inclusive: false,
    });
    assert.equal(exclusive.subtotal_cents, 10_000);
    assert.equal(exclusive.gst_cents, 1_000);
    assert.equal(exclusive.total_cents, 11_000);

    const inclusive = calcInvoiceGst(11_000, {
      gst_enabled: true,
      gst_percent: 10,
      gst_label: "GST",
      gst_inclusive: true,
    });
    assert.equal(inclusive.total_cents, 11_000);
    assert.equal(inclusive.subtotal_cents, 10_000);
    assert.equal(inclusive.gst_cents, 1_000);
  });

  it("treats GST-off invoices as the stored amount with no tax line", () => {
    const off = calcInvoiceGst(5_000, mergeInvoiceTemplate({ gst_enabled: false }));
    assert.equal(off.enabled, false);
    assert.equal(off.gst_cents, 0);
    assert.equal(off.total_cents, 5_000);
  });
});
