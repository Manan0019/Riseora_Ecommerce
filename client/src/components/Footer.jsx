import { Link } from "react-router-dom";
import { Icon } from "./Icons";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-brand-row">
        <div className="footer-brand">
          <span className="brand-mark footer-brand-mark">R</span>
          <div><strong>RISEORA</strong><small>HERBALS</small></div>
        </div>
        <p>Everyday herbal care with a calmer, simpler shopping experience.</p>
      </div>
      <div className="container footer-grid">
        <div>
          <h3>Explore</h3>
          <Link to="/shop">Shop all</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/orders">My orders</Link>
          <Link to="/track-order">Track order</Link>
        </div>
        <div>
          <h3>Customer care</h3>
          <span>Secure checkout</span>
          <Link to="/track-order">Order tracking</Link>
          <Link to="/policies/shipping">Shipping policy</Link>
          <Link to="/policies/returns">Returns & refunds</Link>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/terms">Terms</Link>
        </div>
        <div className="footer-promise">
          <Icon name="leaf" size={24} />
          <div><strong>Riseora care</strong><p>Product information, pricing and availability are managed directly from the Riseora admin dashboard.</p></div>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} Riseora Herbals. All rights reserved.</div>
    </footer>
  );
}
