import { mediaUrl } from "../api/http";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import OfferProgress from "../components/OfferProgress";

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  if (items.length === 0) {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="cart" /></span><h1>Your cart is empty</h1><p>Discover Riseora products and add something to your routine.</p><Link className="button" to="/shop">Continue shopping</Link></div>;
  }

  return (
    <div className="container page-space cart-page">
      <div className="cart-heading"><div><p className="eyebrow">YOUR BAG</p><h1>Shopping cart</h1></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
      <div className="cart-layout">
        <div className="cart-list">
          {items.map((item) => (
            <div className="cart-item" key={item.variantId}>
              {item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt={item.productName} /> : <div className="mini-placeholder">R</div>}
              <div className="cart-item-main">
                <Link to={`/product/${item.productSlug}`}><strong>{item.productName}</strong></Link>
                <p>{item.variantName}</p>
                <div className="cart-controls"><div className="quantity-stepper mini"><button onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button></div><button className="link-button danger" onClick={() => removeItem(item.variantId)}>Remove</button></div>
              </div>
              <strong className="cart-line-price">₹{(item.price * item.quantity).toFixed(0)}</strong>
            </div>
          ))}
        </div>
        <aside className="summary-card"><h2>Order summary</h2><OfferProgress /><div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-row total"><span>Estimated total</span><strong>₹{subtotal.toFixed(0)}</strong></div><Link className="button wide" to="/checkout">Proceed to checkout <Icon name="arrow" size={18} /></Link><Link className="continue-link" to="/shop">Continue shopping</Link><Link className="continue-link" to="/routine-builder">Build a routine</Link></aside>
      </div>
    </div>
  );
}
