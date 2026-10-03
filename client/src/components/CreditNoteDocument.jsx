import BrandLogo from "./BrandLogo";

function money(value) { return `₹${Number(value || 0).toFixed(2)}`; }
function addressText(value) { return value ? [value.line1, value.line2, value.landmark, value.city, value.state, value.postalCode, value.country].filter(Boolean).join(", ") : ""; }

export default function CreditNoteDocument({ data, admin = false }) {
  if (!data) return null;
  const { creditNote, invoice, returnRequest, order } = data;
  const lines = Array.isArray(creditNote.lines) ? creditNote.lines : [];
  return <div className="invoice-page-wrap phase45-credit-wrap">
    <div className="invoice-actions no-print"><button className="button" onClick={() => window.print()}>Print / Save PDF</button><span>{admin ? "Admin credit-note copy" : "Customer credit note"}</span></div>
    <article className="invoice-sheet phase45-credit-sheet">
      <header className="invoice-header">
        <div><div className="invoice-brand-logo"><BrandLogo /></div><p className="eyebrow">TAX CREDIT NOTE</p><h1>{invoice?.sellerName || "Riseora Herbals"}</h1><p>{addressText(invoice?.sellerAddress)}</p>{invoice?.sellerGstin && <p><strong>GSTIN:</strong> {invoice.sellerGstin}</p>}{invoice?.sellerPan && <p><strong>PAN:</strong> {invoice.sellerPan}</p>}</div>
        <div className="invoice-meta"><strong>{creditNote.creditNoteNumber}</strong><span>Issued {new Date(creditNote.issuedAt).toLocaleDateString("en-IN")}</span><span>Against invoice {invoice?.invoiceNumber}</span><span>Return {returnRequest.returnNumber}</span>{invoice?.placeOfSupply && <span>Place of supply: {invoice.placeOfSupply}</span>}</div>
      </header>
      <section className="invoice-bill-grid"><div><small>CUSTOMER</small><strong>{order.customerName}</strong><p>{addressText(order.shippingAddress)}</p><p>{order.customerPhone}</p>{order.customerEmail && <p>{order.customerEmail}</p>}</div><div><small>REASON</small><strong>{creditNote.reason || returnRequest.reason || "Returned goods / refund"}</strong><p>Refund method: {returnRequest.refundMethod?.replaceAll("_", " ") || "—"}</p>{returnRequest.refundReference && <p>Reference: {returnRequest.refundReference}</p>}</div></section>
      <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Taxable</th><th>GST</th><th>Tax reversal</th><th>Credit</th></tr></thead><tbody>{lines.map((line) => <tr key={`${line.orderItemId}-${line.sku}`}><td><strong>{line.productName}</strong><small>{line.variantName || line.sku}</small></td><td>{line.hsnCode || "—"}</td><td>{line.quantity}</td><td>{money(line.taxableAmount)}</td><td>{Number(line.gstRate || 0).toFixed(2)}%</td><td>{money(line.taxAmount)}</td><td>{money(line.lineTotal)}</td></tr>)}</tbody></table></div>
      <section className="invoice-total-grid"><div className="invoice-tax-note"><p>This credit note reverses the tax value associated with the refunded returned goods. Confirm production GST treatment and filing with Riseora's accountant.</p></div><div className="invoice-totals"><span>Taxable reversal <strong>{money(creditNote.taxableTotal)}</strong></span>{Number(creditNote.cgstTotal) > 0 && <span>CGST reversal <strong>{money(creditNote.cgstTotal)}</strong></span>}{Number(creditNote.sgstTotal) > 0 && <span>SGST reversal <strong>{money(creditNote.sgstTotal)}</strong></span>}{Number(creditNote.igstTotal) > 0 && <span>IGST reversal <strong>{money(creditNote.igstTotal)}</strong></span>}<span>Tax reversal <strong>{money(creditNote.taxTotal)}</strong></span><span className="grand">Credit total <strong>{money(creditNote.grandTotal)}</strong></span></div></section>
      <footer className="invoice-footer"><span>Computer-generated credit note</span><span>Reference order {order.orderNumber}</span></footer>
    </article>
  </div>;
}
