import BrandLogo from "./BrandLogo";

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function addressText(value) {
  if (!value) return "";
  return [value.line1, value.line2, value.landmark, value.city, value.state, value.postalCode, value.country].filter(Boolean).join(", ");
}

export default function InvoiceDocument({ data, admin = false }) {
  if (!data) return null;
  const { invoice, order } = data;
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const orderItemsById = new Map((order.items || []).map((item) => [item.id, item]));
  return (
    <div className="invoice-page-wrap">
      <div className="invoice-actions no-print">
        <button className="button" onClick={() => window.print()}>Print / Save PDF</button>
        <span>{admin ? "Admin invoice copy" : "Customer invoice"}</span>
      </div>
      <article className="invoice-sheet">
        <header className="invoice-header">
          <div><div className="invoice-brand-logo"><BrandLogo /></div><p className="eyebrow">TAX INVOICE</p><h1>{invoice.sellerName}</h1><p>{addressText(invoice.sellerAddress)}</p>{invoice.sellerGstin && <p><strong>GSTIN:</strong> {invoice.sellerGstin}</p>}</div>
          <div className="invoice-meta"><strong>{invoice.invoiceNumber}</strong><span>Issued {new Date(invoice.issuedAt).toLocaleDateString()}</span><span>Order {order.orderNumber}</span><span>Payment: {order.paymentMethod}</span></div>
        </header>

        <section className="invoice-bill-grid">
          <div><small>BILL TO</small><strong>{invoice.buyerName}</strong><p>{addressText(invoice.buyerAddress)}</p><p>{order.customerPhone}</p>{order.customerEmail && <p>{order.customerEmail}</p>}</div>
          <div><small>SHIP TO</small><strong>{order.customerName}</strong><p>{addressText(order.shippingAddress)}</p></div>
        </section>

        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Taxable</th><th>GST</th><th>Tax</th><th>Total</th></tr></thead>
            <tbody>{lines.map((line) => { const orderItem = orderItemsById.get(line.orderItemId); return <tr key={line.orderItemId}><td><strong>{line.productName}</strong><small>{line.variantName || line.sku}{orderItem?.isComplimentary ? ` • FREE • ${orderItem.promotionLabel || "Offer"}` : ""}</small></td><td>{line.hsnCode || "—"}</td><td>{line.quantity}</td><td>{money(line.taxableAmount)}</td><td>{Number(line.gstRate || 0).toFixed(2)}%</td><td>{money(line.taxAmount)}</td><td>{orderItem?.isComplimentary ? "FREE" : money(line.lineTotal)}</td></tr>; })}</tbody>
          </table>
        </div>

        <section className="invoice-total-grid">
          <div className="invoice-tax-note"><p>Prices are treated as tax-inclusive for invoice calculation. HSN/SAC and GST rates are taken from the product variant snapshot captured with the order.</p></div>
          <div className="invoice-totals">
            <span>Taxable value <strong>{money(invoice.taxableTotal)}</strong></span>
            {Number(invoice.cgstTotal) > 0 && <span>CGST <strong>{money(invoice.cgstTotal)}</strong></span>}
            {Number(invoice.sgstTotal) > 0 && <span>SGST <strong>{money(invoice.sgstTotal)}</strong></span>}
            {Number(invoice.igstTotal) > 0 && <span>IGST <strong>{money(invoice.igstTotal)}</strong></span>}
            <span>Tax total <strong>{money(invoice.taxTotal)}</strong></span>
            {Number(order.shippingFee) > 0 && <span>Shipping / service fee <strong>{money(order.shippingFee)}</strong></span>}
            <span className="grand">Grand total <strong>{money(invoice.grandTotal)}</strong></span>
          </div>
        </section>

        <footer className="invoice-footer"><span>Computer-generated invoice</span><span>Thank you for choosing Riseora.</span></footer>
      </article>
    </div>
  );
}
