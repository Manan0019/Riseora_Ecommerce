import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";

export default function AuthBrand({ label = "RISEORA HERBALS" }) {
  return <div className="auth-brand-lockup"><Link to="/" aria-label="Riseora home"><BrandLogo variant="vertical" /></Link><span>{label}</span></div>;
}
