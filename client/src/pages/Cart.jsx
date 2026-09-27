import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  if (items.length === 0) {
    return <div className="container page-space empty-state"><h1>Your cart is empty</h1><p>Add products from the Riseora shop.</p><Link className="button" to="/shop">Continue shopping</Link></div>;
  }

  return (
    <div className="container page-space">
      <h1>Shopping cart</h1>
      <div className="cart-layout">
        <div className="cart-list">
          {items.map((item) => (
            <div className="cart-item" key={item.variantId}>
              {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} /> : <div className="mini-placeholder">R</div>}
              <div className="cart-item-main">
                <Link to={`/product/${item.productSlug}`}><strong>{item.productName}</strong></Link>
                <p>{item.variantName} • {item.sku}</p>
                <div className="cart-controls">
                  <input type="number" min="1" max={item.stockQuantity} value={item.quantity} onChange={(event) => updateQuantity(item.variantId, Number(event.target.value))} />
                  <button className="link-button danger" onClick={() => removeItem(item.variantId)}>Remove</button>
                </div>
              </div>
              <strong>₹{(item.price * item.quantity).toFixed(0)}</strong>
            </div>
          ))}
        </div>
        <aside className="summary-card">
          <h2>Order summary</h2>
          <div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div>
          <div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div>
          <Link className="button wide" to="/checkout">Proceed to checkout</Link>
        </aside>
      </div>
    </div>
  );
}
