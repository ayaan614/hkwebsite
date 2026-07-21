# HK Accessories — Premium Fashion & Collectibles E-Commerce Website

[![Live Preview](https://img.shields.io/badge/Live-Preview-brightgreen?style=for-the-badge)](#)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

---

## 📖 About

**HK Accessories** is a fully client-side, single-page e-commerce storefront for a Pakistan-based fashion accessories and collectibles brand. It is built with **vanilla HTML, CSS, and ES Modules JavaScript** — no frameworks, no build steps, no dependencies. Simply open `index.html` in a browser.

The store sells across four departments:

| Department | Products |
|---|---|
| 💍 **Jewelry** | Gold & rhodium plated rings, earrings, bracelets, pendants, jewelry sets |
| 🚗 **Diecast** | Premium 1:18 / 1:24 / 1:32 die-cast metal model cars & motorcycles |
| 🎮 **Toys** | Action figures, RC cars, educational puzzles, plush toys |
| 👕 **Clothing** | Cotton tees, fleece hoodies, sportswear, denim jackets |

---

## ✨ Features

- **Hash-based SPA routing** — navigate between pages without full reloads
- **Product catalog** with live sidebar filters (price range, material, availability, sale)
- **Product detail pages** with image gallery, size/variation selector, and dynamic pricing
- **Shopping cart drawer** with quantity controls and persistent localStorage state
- **Wishlist** stored in localStorage
- **Predictive search** with live suggestions
- **Order via WhatsApp** — one-click WhatsApp ordering integration
- **Mobile-first responsive design** — full mobile drawer nav and touch-friendly UI
- **Cash on Delivery** checkout flow
- **Order tracking** page
- **Mega menu** navigation for desktop
- **Recently viewed** products tracker
- **Newsletter signup** form

---

## 🗂️ Project Structure

```
hk-accessories/
├── index.html                   # Main HTML shell (SPA host)
├── style.css                    # All styles — design system, components, pages
├── js/
│   ├── app.js                   # Main app controller — routing, rendering, events
│   ├── store.js                 # Global state — cart, wishlist, recently viewed
│   └── wc-api.js                # Data layer — mock/WooCommerce REST API adapter
├── data/
│   └── products.json            # Product catalog (mock data — 200+ products)
├── generate_products.py         # Python script to generate mock product data
├── import_hkaccessories_products.py  # WooCommerce REST API importer script
└── .gitignore
```

---

## 🚀 Getting Started

### Option 1 — Open directly (no server needed for mock data)

```bash
# Clone the repo
git clone https://github.com/ayaan614/hkwebsite.git
cd hkwebsite

# Open in browser
# Simply double-click index.html
# OR serve with any static server:
npx serve .
# OR
python -m http.server 8080
```

Then visit `http://localhost:8080` (or the address shown).

> **Note:** The site uses `fetch()` to load `data/products.json`. You must serve it through a local server (not open as `file://`) for this to work correctly due to browser CORS policy.

---

### Option 2 — Connect to a live WooCommerce store

Edit `js/wc-api.js` and set:

```js
export const USE_MOCK_DATA = false;

const WC_BASE_URL = 'https://your-store.com/wp-json/wc/v3';
const WC_CONSUMER_KEY = 'ck_XXXXXXXXXXXX';
const WC_CONSUMER_SECRET = 'cs_XXXXXXXXXXXX';
```

> ⚠️ **Never commit real API credentials to Git.** Use a `.env` file or environment variable injection.

---

## 🐍 Python Scripts

### `generate_products.py`
Generates a realistic mock `data/products.json` with 200+ products across all four departments, including product variations (sizes, colors), stock statuses, pricing, and rich descriptions.

```bash
python generate_products.py
```

### `import_hkaccessories_products.py`
Imports real products from a WooCommerce REST API into `data/products.json` for use as mock data. Configure credentials at the top of the file before running.

```bash
python import_hkaccessories_products.py
```

---

## 🎨 Design System

The design uses a **luxury dark-gold** palette:

| Variable | Value | Usage |
|---|---|---|
| `--color-primary-dark` | `#1A1A2E` | Dark navy backgrounds |
| `--color-gold` | `#C9A84C` | Primary accent — buttons, highlights |
| `--color-charcoal` | `#2D2D2D` | Body text |
| `--color-soft-white` | `#FAF8F5` | Light backgrounds |
| `--color-sale` | `#C0392B` | Sale badges |

**Typography:** [Cinzel](https://fonts.google.com/specimen/Cinzel) (headings) + [Outfit](https://fonts.google.com/specimen/Outfit) (body) via Google Fonts.

---

## 📱 Browser Support

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 14+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Internet Explorer | ❌ Not supported |

---

## 📦 Deployment

This is a **pure static site** — deploy to any static hosting platform:

- **GitHub Pages** — push to `gh-pages` branch or enable in repo settings
- **Netlify** — drag & drop the folder or connect the repo
- **Vercel** — `vercel --prod` from the project root
- **Cloudflare Pages** — connect the GitHub repo

No build step required. No `npm install`. No configuration.

---

## 🛒 Cash on Delivery

All orders on this site are fulfilled via **Cash on Delivery (COD)** across Pakistan, with delivery in 3–5 business days through courier partners.

WhatsApp ordering is supported directly via the product pages.

---

## 📄 License

This project is proprietary and belongs to **HK Accessories**. Unauthorized reproduction or redistribution is not permitted.

---

## 📬 Contact

- 🌐 Website: [hkaccessories.pk](#)
- 💬 WhatsApp: [+92 300 1234567](https://wa.me/923001234567)
- 📸 Instagram: [@HKAccessories](#)
- 📘 Facebook: [HK Accessories](#)
