export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <h3>Riseora Herbals</h3>
          <p>Thoughtful herbal wellness products with a simple, transparent shopping experience.</p>
        </div>
        <div>
          <h4>Customer care</h4>
          <p>Add your support email, WhatsApp number and business hours before launch.</p>
        </div>
        <div>
          <h4>Policies</h4>
          <p>Add shipping, returns, privacy and terms pages before production launch.</p>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} Riseora Herbals. All rights reserved.</div>
    </footer>
  );
}
