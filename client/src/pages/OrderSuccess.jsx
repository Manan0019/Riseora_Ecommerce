import { Link, useParams } from "react-router-dom";

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  return <div className="container page-space"><div className="success-card"><div className="success-icon">✓</div><p className="eyebrow">ORDER RECEIVED</p><h1>Thank you for your order</h1><p>Your order number is <strong>{orderNumber}</strong>.</p><p>COD payment is pending until delivery. Add your real confirmation/notification workflow before production launch.</p><div className="hero-actions"><Link className="button" to="/shop">Continue shopping</Link><Link className="button button-secondary" to="/orders">My orders</Link></div></div></div>;
}
