import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useCart } from "../context/CartContext";

export default function RecoverCart() {
  const { cartToken } = useParams();
  const navigate = useNavigate();
  const { replaceCart } = useCart();
  const [state, setState] = useState({ loading: true, error: "", unavailableCount: 0 });

  useEffect(() => {
    apiFetch(`/cart-recovery/${cartToken}`)
      .then((response) => {
        replaceCart(response.data.items || []);
        try { localStorage.setItem("riseora_cart_recovery_token", response.data.cartToken); } catch {}
        setState({ loading: false, error: "", unavailableCount: Number(response.data.unavailableCount || 0) });
      })
      .catch((error) => setState({ loading: false, error: error.message, unavailableCount: 0 }));
  }, [cartToken]);

  if (state.loading) return <div className="container page-space"><div className="recovery-state"><span className="route-loading"><span>R</span></span><h1>Restoring your cart…</h1></div></div>;
  if (state.error) return <div className="container page-space"><div className="recovery-state"><p className="eyebrow">CART RECOVERY</p><h1>This link can’t be used</h1><p>{state.error}</p><Link className="button" to="/shop">Continue shopping</Link></div></div>;

  return <div className="container page-space"><div className="recovery-state"><p className="eyebrow">WELCOME BACK</p><h1>Your cart is restored.</h1>{state.unavailableCount > 0 && <p>{state.unavailableCount} item{state.unavailableCount === 1 ? "" : "s"} could not be restored because stock changed.</p>}<button className="button" onClick={() => navigate("/cart", { replace: true })}>View cart</button><Link className="button button-secondary" to="/shop">Keep shopping</Link></div></div>;
}
