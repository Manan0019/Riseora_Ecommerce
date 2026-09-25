# 🌿 Riseora E-Commerce

Official full-stack e-commerce platform for **Riseora Herbals**.

The platform is being developed to allow customers to browse Riseora products, place orders online, make payments, manage their accounts, and track their purchases.

The e-commerce application is currently being developed as an **independent system**. Integration with the Riseora ERP will be implemented after the core e-commerce platform is completed and stabilized.

---

## 🚧 Project Status

**Currently under active development.**

The first stage focuses on building the complete standalone e-commerce platform.

ERP integration will be introduced in a later phase.

---

## ✨ Planned Features

| Area            | Features                                                         |
| --------------- | ---------------------------------------------------------------- |
| Storefront      | Responsive homepage, product catalogue and product details       |
| Products        | Categories, variants, pricing and product images                 |
| Search          | Product search and filtering                                     |
| Cart            | Shopping cart and quantity management                            |
| Checkout        | Address selection and order summary                              |
| Customers       | Registration, login and customer profile                         |
| Orders          | Order placement, order history and order tracking                |
| Payments        | Cash on Delivery and online payment integration                  |
| Admin           | Product, inventory, customer and order management                |
| Inventory       | Product stock tracking                                           |
| Notifications   | Order confirmation and status notifications                      |
| ERP Integration | Product, stock and online-order synchronization with Riseora ERP |

---

## 🛠️ Tech Stack

| Layer              | Technology |
| ------------------ | ---------- |
| Frontend           | React      |
| Build Tool         | Vite       |
| Backend            | Node.js    |
| API                | Express.js |
| Database           | PostgreSQL |
| ORM                | Prisma     |
| Authentication     | JWT        |
| Version Control    | Git        |
| Repository Hosting | GitHub     |

Additional infrastructure such as payment gateways, cloud storage, email services and production hosting will be added during later development stages.

---

## 🏗️ Project Architecture

```text
Riseora-Ecommerce/
│
├── client/
│   ├── public/
│   ├── src/
│   └── package.json
│
├── server/
│   ├── src/
│   ├── prisma/
│   └── package.json
│
├── .gitignore
├── README.md
└── LICENSE
```

The frontend and backend are maintained in the same repository while remaining logically separated.

---

## 🔄 Future ERP Integration

The e-commerce platform is intentionally being developed separately from the existing Riseora ERP.

After the website is production-ready, a controlled synchronization layer will connect the two systems.

```text
Riseora ERP
     │
     │ Product / Stock Sync
     ▼
E-Commerce Platform
     │
     │ Online Orders
     ▼
Riseora ERP
```

Products will use shared identifiers such as SKUs so both systems can reliably identify the same inventory item.

Example:

```text
SKU: RISE-HO-100ML
```

Direct public access to the ERP database will not be used.

---

## 🔐 Environment Variables

Sensitive configuration must be stored in environment variables.

Example:

```env
DATABASE_URL=
JWT_SECRET=
PORT=
```

The real `.env` file is excluded from Git and must never be committed.

A `.env.example` file will be provided for required variable names without containing secret values.

---

## 💻 Local Development

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/Riseora-Ecommerce.git
```

Enter the project:

```bash
cd Riseora-Ecommerce
```

Install frontend dependencies:

```bash
cd client
npm install
```

Install backend dependencies:

```bash
cd ../server
npm install
```

Development commands will be documented as the frontend and backend setup is completed.

---

## 🗄️ Database

Riseora E-Commerce uses **PostgreSQL** as its primary database.

PostgreSQL was selected because the application contains highly relational business data including:

```text
Customers
Products
Product Variants
Inventory
Orders
Order Items
Payments
Addresses
Shipments
```

Database schema management and migrations are handled using **Prisma ORM**.

---

## 🌿 About Riseora Herbals

Riseora Herbals is focused on herbal and wellness products with an emphasis on quality, transparency and customer experience.

This platform is being developed to provide Riseora customers with a modern online shopping experience while eventually connecting online commerce with the company's internal ERP operations.

---

## 🗺️ Development Roadmap

```text
Phase 1
Project foundation and design system

Phase 2
Storefront and product catalogue

Phase 3
Cart and checkout

Phase 4
Customer authentication

Phase 5
Order management

Phase 6
Admin dashboard

Phase 7
Payment integration

Phase 8
Deployment and production hardening

Phase 9
Riseora ERP integration
```

---

## 🔒 Security

Sensitive credentials and production configuration are never stored in the repository.

Files such as the following are excluded from version control:

```text
.env
.env.local
node_modules/
dist/
logs/
```

Production credentials must be configured directly through the deployment environment.

---

## 📄 License

Copyright © Riseora Herbals.

Licensing information will be finalized before the production release.
