/**
 * HK Accessories - Main Application Controller
 * Handles routing, page rendering, event bindings, search, cart operations, and WooCommerce connection.
 */

import { 
    getProducts, 
    getProductById, 
    getCategories, 
    getSearchSuggestions, 
    placeOrder,
    getWhatsAppOrderUrl,
    USE_MOCK_DATA
} from './wc-api.js';

import { 
    getRouteInfo, 
    subscribe, 
    getCart, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    clearCart,
    getCartTotal, 
    getCartCount, 
    getRecentlyViewed, 
    addToRecentlyViewed, 
    toggleWishlist, 
    isInWishlist, 
    getWishlist,
    isProductInStock
} from './store.js';


// --- IMAGE OPTIMIZATION HELPER ---
function getOptimizedImgTag({ src, alt = '', className = '', width = 400, height = 400, isEager = false, aspectRatio = '1/1', objectFit = 'cover', extraAttrs = '' }) {
    if (!src) return '';
    let optimizedSrc = src;
    
    if (optimizedSrc.includes('ring_img.jpeg') || optimizedSrc.includes('ring_img.jpg')) {
        optimizedSrc = 'ring_img.webp';
    } else if ((optimizedSrc.startsWith('/uploads/') || optimizedSrc.startsWith('uploads/')) && !optimizedSrc.includes('wp-content')) {
        if (optimizedSrc.endsWith('.png') || optimizedSrc.endsWith('.jpeg') || optimizedSrc.endsWith('.jpg')) {
            optimizedSrc = optimizedSrc.substring(0, optimizedSrc.lastIndexOf('.')) + '.webp';
        }
    } else if (optimizedSrc.includes('images.unsplash.com')) {
        try {
            const urlObj = new URL(optimizedSrc);
            urlObj.searchParams.set('fm', 'webp');
            urlObj.searchParams.set('q', '80');
            urlObj.searchParams.set('auto', 'format');
            urlObj.searchParams.set('w', width.toString());
            optimizedSrc = urlObj.toString();
        } catch (e) {
            // fallback
        }
    }

    const loadingAttr = isEager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
    const classAttr = className ? `class="${className}"` : '';
    const styleAttr = `style="aspect-ratio: ${aspectRatio}; object-fit: ${objectFit};"`;

    return `<img src="${optimizedSrc}" alt="${escapeHtml(alt)}" ${classAttr} width="${width}" height="${height}" ${loadingAttr} ${styleAttr} ${extraAttrs}>`;
}

// DOM Element Selections
const appContainer = document.getElementById('app');
const cartDrawer = document.getElementById('cart-drawer');
const cartDrawerOverlay = document.getElementById('cart-drawer-overlay');
const mobileDrawer = document.getElementById('mobile-drawer');
const mobileDrawerOverlay = document.getElementById('mobile-drawer-overlay');
const cartCountBadge = document.getElementById('cart-count');
const wishlistCountBadge = document.getElementById('wishlist-count');
const searchInput = document.getElementById('search-input');
const searchSuggestions = document.getElementById('search-suggestions');
const searchForm = document.getElementById('search-form');

// State tracking for catalog filters
let catalogFilters = {
    department: '',
    category: '',
    priceMin: '',
    priceMax: '',
    onSale: false,
    sortBy: 'newest',
    attributes: {},
    page: 1,
    limit: 12
};

// --- INITIALIZE APPLICATION ---
function init() {
    // Bind routing events
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('DOMContentLoaded', () => {
        handleRoute();
        updateHeaderBadges();
        renderCartDrawer();
    });

    // Bind global drawer toggles
    document.getElementById('btn-cart-toggle')?.addEventListener('click', toggleCartDrawer);
    document.getElementById('btn-cart-close')?.addEventListener('click', closeCartDrawer);
    cartDrawerOverlay?.addEventListener('click', closeCartDrawer);

    document.getElementById('btn-mobile-menu-open')?.addEventListener('click', toggleMobileDrawer);
    document.getElementById('btn-mobile-menu-close')?.addEventListener('click', closeMobileDrawer);
    mobileDrawerOverlay?.addEventListener('click', closeMobileDrawer);

    // Global delegated click listener for cart drawer links & checkout navigation
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href') || '';
        if (link.closest('#cart-drawer') || href.includes('#/checkout') || href.includes('checkout.html') || href.includes('#/cart')) {
            closeCartDrawer();
            closeMobileDrawer();
        }
    });

    // Bind Wishlist toggle to show drawer or page (Let's route to a pre-filtered wishlist state or page)
    document.getElementById('btn-wishlist-toggle').addEventListener('click', () => {
        window.location.hash = '#/wishlist';
    });

    // Bind Predictive Search
    searchInput.addEventListener('input', handlePredictiveSearch);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchSuggestions.classList.remove('active');
        }
    });
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            searchSuggestions.classList.remove('active');
            window.location.hash = `#/search?q=${encodeURIComponent(query)}`;
        }
    });

    // Mobile Search inside drawer
    const mobileSearchForm = document.getElementById('mobile-search-form');
    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchForm && mobileSearchInput) {
        mobileSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = mobileSearchInput.value.trim();
            if (query) {
                toggleMobileDrawer();
                window.location.hash = `#/search?q=${encodeURIComponent(query)}`;
            }
        });
    }

    // Bind mobile menu accordion
    const mobileSubToggles = document.querySelectorAll('.mobile-sub-toggle');
    mobileSubToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const subMenu = toggle.nextElementSibling;
            const icon = toggle.querySelector('i');
            subMenu.classList.toggle('active');
            if (subMenu.classList.contains('active')) {
                icon.className = 'fa-solid fa-minus';
            } else {
                icon.className = 'fa-solid fa-plus';
            }
        });
    });

    // Subscribe to global store changes
    subscribe((event, data) => {
        updateHeaderBadges();
        if (event === 'cart_changed') {
            renderCartDrawer();
            // Re-render cart/checkout pages if active
            const currentRoute = getRouteInfo();
            if (currentRoute.page === 'cart') {
                renderCartPage();
            } else if (currentRoute.page === 'checkout') {
                renderCheckoutPage();
            }
        }
    });
}

// --- UTILITY / GENERAL DRAWERS ---
function openCartDrawer() {
    if (cartDrawer) cartDrawer.classList.add('active');
    if (cartDrawerOverlay) cartDrawerOverlay.classList.add('active');
}

function closeCartDrawer() {
    if (cartDrawer) cartDrawer.classList.remove('active');
    if (cartDrawerOverlay) cartDrawerOverlay.classList.remove('active');
}

function toggleCartDrawer() {
    if (cartDrawer) cartDrawer.classList.toggle('active');
    if (cartDrawerOverlay) cartDrawerOverlay.classList.toggle('active');
}

function closeMobileDrawer() {
    if (mobileDrawer) mobileDrawer.classList.remove('active');
    if (mobileDrawerOverlay) mobileDrawerOverlay.classList.remove('active');
    const openBtn = document.getElementById('btn-mobile-menu-open');
    if (openBtn) {
        openBtn.classList.remove('hamburger-open');
    }
}

function toggleMobileDrawer() {
    if (mobileDrawer && mobileDrawer.classList.contains('active')) {
        closeMobileDrawer();
    } else {
        if (mobileDrawer) mobileDrawer.classList.add('active');
        if (mobileDrawerOverlay) mobileDrawerOverlay.classList.add('active');
        const openBtn = document.getElementById('btn-mobile-menu-open');
        if (openBtn) {
            openBtn.classList.add('hamburger-open');
        }
    }
}

function updateHeaderBadges() {
    cartCountBadge.textContent = getCartCount();
    wishlistCountBadge.textContent = getWishlist().length;
}

// --- PREDICTIVE LIVE VISUAL SEARCH HANDLER ---
let currentSelectedSuggestionIndex = -1;

function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escapedText = escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}

async function handlePredictiveSearch() {
    const query = searchInput.value.trim();
    currentSelectedSuggestionIndex = -1;

    if (query.length < 2) {
        searchSuggestions.classList.remove('active');
        return;
    }

    const { suggestions, totalMatches } = await getSearchSuggestions(query);

    if (!suggestions || suggestions.length === 0) {
        searchSuggestions.innerHTML = `
            <div class="suggestion-no-results">
                <i class="fa-solid fa-magnifying-glass"></i>
                <div>No matching products for "<strong>${escapeHtml(query)}</strong>"</div>
            </div>
        `;
        searchSuggestions.classList.add('active');
        return;
    }

    let html = `
        <div class="suggestion-header-bar">
            <span>Matching Products (${totalMatches})</span>
            <span style="font-size:0.68rem; text-transform:none; font-weight:normal; color:#94A3B8;">Press ↑↓ to navigate</span>
        </div>
    `;

    html += suggestions.map((item, idx) => {
        const hasDiscount = item.on_sale && item.regular_price > item.price;
        return `
            <a href="#/product/${item.id}" class="suggestion-item" data-index="${idx}">
                <div class="suggestion-img-wrap">
                    <img src="${item.image}" alt="${escapeHtml(item.title)}" class="suggestion-img" onerror="this.src='https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=100&q=80'">
                </div>
                <div class="suggestion-info">
                    <div class="suggestion-title">${highlightMatch(item.title, query)}</div>
                    <div class="suggestion-meta">
                        <div class="suggestion-price-box">
                            <span class="suggestion-price">PKR ${item.price?.toLocaleString()}</span>
                            ${hasDiscount ? `<span class="suggestion-regular-price">PKR ${item.regular_price?.toLocaleString()}</span>` : ''}
                        </div>
                        <span class="suggestion-dept">${escapeHtml(item.department)} · ${escapeHtml(item.category)}</span>
                    </div>
                </div>
            </a>
        `;
    }).join('');

    if (totalMatches > suggestions.length) {
        html += `
            <a href="#/shop?q=${encodeURIComponent(query)}" class="suggestion-footer-btn">
                View all ${totalMatches} results for "${escapeHtml(query)}" <i class="fa-solid fa-arrow-right" style="margin-left:4px;"></i>
            </a>
        `;
    }

    searchSuggestions.innerHTML = html;
    searchSuggestions.classList.add('active');

    // Bind click handlers to hide suggestion box after navigating
    searchSuggestions.querySelectorAll('.suggestion-item, .suggestion-footer-btn').forEach(item => {
        item.addEventListener('click', () => {
            searchSuggestions.classList.remove('active');
        });
    });
}

// Keyboard Navigation & Click Outside Dismissal for Live Search
document.addEventListener('keydown', (e) => {
    if (!searchSuggestions || !searchSuggestions.classList.contains('active')) return;

    const items = searchSuggestions.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentSelectedSuggestionIndex = (currentSelectedSuggestionIndex + 1) % items.length;
        updateSuggestionHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentSelectedSuggestionIndex = (currentSelectedSuggestionIndex - 1 + items.length) % items.length;
        updateSuggestionHighlight(items);
    } else if (e.key === 'Enter' && currentSelectedSuggestionIndex >= 0) {
        e.preventDefault();
        items[currentSelectedSuggestionIndex].click();
    } else if (e.key === 'Escape') {
        searchSuggestions.classList.remove('active');
    }
});

function updateSuggestionHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === currentSelectedSuggestionIndex) {
            item.classList.add('keyboard-selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('keyboard-selected');
        }
    });
}

// Hide live search dropdown when clicking anywhere outside
document.addEventListener('click', (e) => {
    if (searchContainer && !searchContainer.contains(e.target)) {
        searchSuggestions?.classList.remove('active');
    }
});

// --- ROUTER SYSTEM ---
function handleRoute() {
    // Save any checkout lead info BEFORE route changes!
    checkAndSaveCheckoutLeadBeforeRoute('route_change');

    // Scroll to top on route change
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    const route = getRouteInfo();
    
    // Close all slide-out drawers on route navigation
    closeCartDrawer();
    closeMobileDrawer();
    
    // Update active nav links in header
    updateActiveNavLinks(route);

    // Set page title for SEO
    let title = 'HK Accessories | Premium Accessible Fashion Jewelry & Collectibles';
    
    // Router Switch
    switch(route.page) {
        case 'home':
            title = 'HK Accessories | Premium Accessible Jewelry & Collectibles Pakistan';
            renderHomePage();
            break;
        case 'jewelry':
            title = 'Premium Fashion Jewelry Collection | HK Accessories';
            handleCatalogRouting('jewelry', route.param);
            break;
        case 'diecast':
            title = 'Detailed Metal Diecast Collection | HK Accessories';
            handleCatalogRouting('diecast', route.param);
            break;
        case 'toys':
            title = 'Premium Kids Toys & Brain Puzzles | HK Accessories';
            handleCatalogRouting('toys', route.param);
            break;
        case 'clothing':
            title = 'Casual Clothing & Apparel | HK Accessories';
            handleCatalogRouting('clothing', route.param);
            break;
        case 'product':
            renderProductDetailPage(route.param);
            break;
        case 'cart':
            title = 'Shopping Bag | HK Accessories';
            renderCartPage();
            break;
        case 'checkout':
            title = 'Guest Checkout | HK Accessories';
            renderCheckoutPage();
            break;
        case 'tracking':
            title = 'Track Your Order | HK Accessories';
            renderOrderTrackingPage();
            break;
        case 'about':
            title = 'About HK Accessories - Premium Accessible Brand';
            renderAboutPage(route.param);
            break;
        case 'contact':
            title = 'Contact Customer Support | HK Accessories';
            renderContactPage();
            break;
        case 'wishlist':
            title = 'Saved Wishlist | HK Accessories';
            renderWishlistPage();
            break;
        case 'new-arrivals':
            title = 'New Arrivals - Latest Collections | HK Accessories';
            handleSpecialCatalogRouting('new-arrivals');
            break;
        case 'sale':
            title = 'Exclusive Sales & Discounts | HK Accessories';
            handleSpecialCatalogRouting('sale');
            break;
        case 'search':
            title = 'Search Results | HK Accessories';
            handleSpecialCatalogRouting('search');
            break;
        default:
            title = 'Page Not Found | HK Accessories';
            render404Page();
    }

    document.title = title;
}

function updateActiveNavLinks(route) {
    const links = document.querySelectorAll('.desktop-nav .nav-link');
    links.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        
        if (route.page === 'home' && href === '#/') {
            link.classList.add('active');
        } else if (route.page === 'jewelry' && href === '#/jewelry') {
            link.classList.add('active');
        } else if (route.page === 'diecast' && href === '#/diecast') {
            link.classList.add('active');
        } else if (route.page === 'toys' && href === '#/toys') {
            link.classList.add('active');
        } else if (route.page === 'clothing' && href === '#/clothing') {
            link.classList.add('active');
        } else if (route.page === 'new-arrivals' && href === '#/new-arrivals') {
            link.classList.add('active');
        } else if (route.page === 'sale' && href === '#/sale') {
            link.classList.add('active');
        } else if (route.page === 'about' && href === '#/about') {
            link.classList.add('active');
        } else if (route.page === 'contact' && href === '#/contact') {
            link.classList.add('active');
        }
    });
}

// --- RENDER LOADER ---
function renderLoader(container) {
    container.innerHTML = `
        <div class="page-loader">
            <div class="spinner"></div>
        </div>
    `;
}

// ==========================================================================
// VIEW RENDERERS (PAGES & MODULES)
// ==========================================================================

// --- 1. HOMEPAGE VIEW ---
async function renderHomePage() {
    renderLoader(appContainer);

    try {
        // Fetch data concurrently for components
        const jewelryNew = await getProducts({ department: 'jewelry', sortBy: 'newest', limit: 4 });
        const jewelryBest = await getProducts({ department: 'jewelry', sortBy: 'popularity', limit: 4 });
        const diecastFeatured = await getProducts({ department: 'diecast', sortBy: 'popularity', limit: 4 });
        const toysFeatured = await getProducts({ department: 'toys', sortBy: 'popularity', limit: 4 });
        const clothingFeatured = await getProducts({ department: 'clothing', sortBy: 'popularity', limit: 4 });
        const jewelryCats = await getCategories('jewelry');

        let html = `
            <!-- 1. Hero Banner (Jewelry Focused) -->
            <section class="hero-banner">
                ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1605100804763-247f67b3557e", alt: "HK Accessories Jewelry", className: "hero-bg", width: 1600, height: 600, isEager: true, aspectRatio: "16/9" })}
                <div class="hero-overlay"></div>
                <div class="container">
                    <div class="hero-content">
                        <span class="hero-tag">HK Fashion Jewelry</span>
                        <h1 class="hero-title">Refined Elegance, <span>Attainable Luxury</span></h1>
                        <p class="hero-description">Discover a carefully curated collection of gold-plated rings, elegant pendants, and premium accessories tailored for your styling & gifting needs.</p>
                        <div class="hero-actions-btn">
                            <a href="#/jewelry" class="btn btn-gold">Explore Jewelry</a>
                            <a href="#/new-arrivals" class="btn btn-outline-dark" style="border-color: #FFFFFF; color: #FFFFFF;">New Arrivals</a>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 2. Shop Jewelry by Category -->
            <section class="category-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Shop Jewelry by Category</h2>
                        <p class="section-subtitle">Exquisite necklaces, stackable rings, adjustable couple rings, and velvet jewelry boxes.</p>
                    </div>
                    <div class="category-grid">
                        ${jewelryCats.slice(0, 6).map(cat => `
                            <a href="#/jewelry/${cat.name}" class="category-card">
                                <div class="category-img-wrapper">
                                    ${getOptimizedImgTag({ src: cat.image || "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=400&q=80", alt: cat.name, width: 400, height: 300, isEager: true, aspectRatio: "4/3" })}
                                </div>
                                <h3>${escapeHtml(cat.name)}</h3>
                            </a>
                        `).join('')}
                    </div>
                </div>
            </section>

            <!-- 3. New Jewelry Arrivals -->
            <section class="products-sec" style="background-color: var(--color-bg-offset);">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">New Jewelry Arrivals</h2>
                        <p class="section-subtitle">Fresh additions to our jewelry collection, crafted for premium styling.</p>
                    </div>
                    <div class="product-grid">
                        ${renderProductCards(jewelryNew.products)}
                    </div>
                    <div style="text-align: center; margin-top: 40px;">
                        <a href="#/jewelry" class="btn btn-primary">View All Jewelry</a>
                    </div>
                </div>
            </section>

            <!-- 4. Best Selling Jewelry -->
            <section class="products-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Best-Selling Jewelry</h2>
                        <p class="section-subtitle">Our most popular designs, loved and reviewed by customers across Pakistan.</p>
                    </div>
                    <div class="product-grid">
                        ${renderProductCards(jewelryBest.products)}
                    </div>
                </div>
            </section>

            <!-- 5. Jewelry Campaign Box -->
            <section class="campaign-sec">
                <div class="container campaign-container">
                    <div class="campaign-content">
                        <h2>Gifts that Matter</h2>
                        <p>Discover our range of premium fashion couple rings, adjustable rings, and packaging boxes. Order a custom-made message card with your order and send it directly to your loved ones. Complete with our signature gift box.</p>
                        <a href="#/jewelry/Couple Rings" class="btn btn-gold">Shop Couple Collection</a>
                    </div>
                    <div class="campaign-img-wrapper">
                        ${getOptimizedImgTag({ src: "ring_img.webp", alt: "Couple Rings Gift", width: 600, height: 600, aspectRatio: "1/1" })}
                    </div>
                </div>
            </section>

            <!-- 6. Separate Department Cards (Diecast, Toys, Clothing) -->
            <section class="departments-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Explore Departments</h2>
                        <p class="section-subtitle">Discover our highly requested diecast collectibles, children's toys, and casual clothing collections.</p>
                    </div>
                    <div class="departments-grid">
                        <!-- Diecast Card -->
                        <div class="dept-card">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908", alt: "Diecast Collectibles", className: "dept-card-bg", width: 600, height: 400, aspectRatio: "3/2" })}
                            <div class="dept-overlay">
                                <h3>Diecast Department</h3>
                                <p>Premium heavy alloy model cars, motorbikes and collectibles.</p>
                                <a href="#/diecast" class="btn btn-gold btn-sm">Shop Diecast</a>
                            </div>
                        </div>
                        <!-- Toys Card -->
                        <div class="dept-card">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338", alt: "Premium Toys", className: "dept-card-bg", width: 600, height: 400, aspectRatio: "3/2" })}
                            <div class="dept-overlay">
                                <h3>Toys & Games</h3>
                                <p>Action figures, educational puzzle blocks, and remote control cars.</p>
                                <a href="#/toys" class="btn btn-gold btn-sm">Shop Toys</a>
                            </div>
                        </div>
                        <!-- Clothing Card -->
                        <div class="dept-card">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1605100804763-247f67b3557e", alt: "Clothing Apparel", className: "dept-card-bg", width: 600, height: 400, aspectRatio: "3/2" })}
                            <div class="dept-overlay">
                                <h3>Clothing Department</h3>
                                <p>Relaxed-fit cotton tees, fleece hoodies, and trendy apparel.</p>
                                <a href="#/clothing" class="btn btn-gold btn-sm">Shop Clothing</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 7. Featured Diecast products -->
            <section class="products-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Featured Diecast Collectibles</h2>
                        <p class="section-subtitle">Accurately detailed scales (1:24, 1:18, 1:32) with opening doors and rubber tires.</p>
                    </div>
                    <div class="product-grid">
                        ${renderProductCards(diecastFeatured.products)}
                    </div>
                    <div style="text-align: center; margin-top: 40px;">
                        <a href="#/diecast" class="btn btn-outline-dark">View All Diecast</a>
                    </div>
                </div>
            </section>

            <!-- 8. Featured Toys -->
            <section class="products-sec" style="background-color: var(--color-bg-offset);">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Trending Toys & Puzzles</h2>
                        <p class="section-subtitle">Creative play and brain teasers for children of all age groups.</p>
                    </div>
                    <div class="product-grid">
                        ${renderProductCards(toysFeatured.products)}
                    </div>
                    <div style="text-align: center; margin-top: 40px;">
                        <a href="#/toys" class="btn btn-outline-dark">View All Toys</a>
                    </div>
                </div>
            </section>

            <!-- 9. Featured Clothing -->
            <section class="products-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Featured Clothing</h2>
                        <p class="section-subtitle">Comfortable streetwear staples tailored from premium combed cotton fabrics.</p>
                    </div>
                    <div class="product-grid">
                        ${renderProductCards(clothingFeatured.products)}
                    </div>
                    <div style="text-align: center; margin-top: 40px;">
                        <a href="#/clothing" class="btn btn-outline-dark">View All Clothing</a>
                    </div>
                </div>
            </section>

            <!-- 10. Why Shop With HK Accessories -->
            <section class="why-sec" style="background-color: var(--color-bg-offset);">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Why Shop With Us</h2>
                        <p class="section-subtitle">Experience a secure and premium customer-focused local e-commerce store.</p>
                    </div>
                    <div class="why-grid">
                        <div class="why-card">
                            <i class="fa-solid fa-gem why-icon"></i>
                            <h3>Curated Quality</h3>
                            <p>All jewelry designs are carefully handpicked, inspected, and packed in luxury gift boxes before dispatch.</p>
                        </div>
                        <div class="why-card">
                            <i class="fa-solid fa-truck-moving why-icon"></i>
                            <h3>Cash on Delivery</h3>
                            <p>Pay conveniently at your doorstep upon receiving your parcel. Reliable shipping across Pakistan in 3-5 days.</p>
                        </div>
                        <div class="why-card">
                            <i class="fa-brands fa-whatsapp why-icon"></i>
                            <h3>WhatsApp Support</h3>
                            <p>Place orders, request tracking info, or get assistance instantly with our responsive WhatsApp support.</p>
                        </div>
                        <div class="why-card">
                            <i class="fa-solid fa-shield-heart why-icon"></i>
                            <h3>E-Commerce Trust</h3>
                            <p>Secure online shopping experience with easy returns, exchange policies, and no hidden charges.</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 11. Customer reviews -->
            <section class="reviews-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">What Our Customers Say</h2>
                        <p class="section-subtitle">Read reviews from verified purchasers from Lahore, Karachi, Islamabad, and across Pakistan.</p>
                    </div>
                    <div class="reviews-grid">
                        <div class="review-card">
                            <div class="review-rating"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
                            <p class="review-content">"The ring size is adjustable so it fits perfectly on my finger. Plating is very bright and has not turned black after weeks of regular wear. Beautiful packaging!"</p>
                            <div class="review-author">
                                <div class="author-avatar">AK</div>
                                <div class="author-info">
                                    <h4>Ayesha Khan</h4>
                                    <span>Verified Buyer, Lahore</span>
                                </div>
                            </div>
                        </div>
                        <div class="review-card">
                            <div class="review-rating"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
                            <p class="review-content">"Bought a 1:24 diecast metal sports car for my office desk. The details are astonishing! Open doors, realistic tires and nice heavy metal feel. Highly recommend."</p>
                            <div class="review-author">
                                <div class="author-avatar">AR</div>
                                <div class="author-info">
                                    <h4>Ali Rehman</h4>
                                    <span>Verified Buyer, Islamabad</span>
                                </div>
                            </div>
                        </div>
                        <div class="review-card">
                            <div class="review-rating"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i></div>
                            <p class="review-content">"Outstanding customer support. They guided me through sizes on WhatsApp and even sent actual pictures. T-shirt fabric is extremely soft and breathable."</p>
                            <div class="review-author">
                                <div class="author-avatar">UN</div>
                                <div class="author-info">
                                    <h4>Usman Niaz</h4>
                                    <span>Verified Buyer, Karachi</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 12. Social media gallery -->
            <section class="social-sec">
                <div class="container">
                    <div class="section-title-wrapper">
                        <h2 class="section-title">Share Your Style</h2>
                        <p class="section-subtitle">Tag @HKAccessories on Instagram to get featured on our feed.</p>
                    </div>
                    <div class="social-grid">
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f", alt: "Jewelry IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1581235720704-06d3acfcb36f", alt: "Diecast IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1603561591411-07134e71a2a9", alt: "Earrings IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1605100804763-247f67b3557e", alt: "Clothing Apparel IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1629224316810-9d8805b95e76", alt: "Box IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                        <div class="social-item">
                            ${getOptimizedImgTag({ src: "https://images.unsplash.com/photo-1587654780291-39c9404d746b", alt: "Toys IG", width: 300, height: 300, isEager: false })}
                            <div class="social-item-overlay"><i class="fa-brands fa-instagram"></i></div>
                        </div>
                    </div>
                </div>
            </section>

        `;

        appContainer.innerHTML = html;

        // Bind homepage forms
        bindProductCardEvents();
    } catch(err) {
        console.error(err);
        appContainer.innerHTML = `<div class="container" style="padding: 100px 0; text-align: center;"><h2>Error loading homepage database</h2><p>${err.message}</p></div>`;
    }
}

// --- 2. DEPARTMENT & CATALOG VIEW ---
async function handleCatalogRouting(department, categoryParam = null) {
    renderLoader(appContainer);
    const route = getRouteInfo();
    
    // Reset or update global catalog filter state
    catalogFilters.department = department;
    catalogFilters.category = categoryParam ? decodeURIComponent(categoryParam) : '';
    catalogFilters.priceMin = route.queryParams?.priceMin || '';
    catalogFilters.priceMax = route.queryParams?.priceMax || '';
    catalogFilters.onSale = false;
    catalogFilters.page = 1;
    
    renderCatalogPage();
}

async function handleSpecialCatalogRouting(type) {
    renderLoader(appContainer);
    
    catalogFilters.department = '';
    catalogFilters.category = '';
    catalogFilters.priceMin = '';
    catalogFilters.priceMax = '';
    catalogFilters.onSale = false;
    catalogFilters.page = 1;
    
    if (type === 'new-arrivals') {
        catalogFilters.sortBy = 'newest';
    } else if (type === 'sale') {
        catalogFilters.onSale = true;
    } else if (type === 'search') {
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
        const q = urlParams.get('q') || '';
        catalogFilters.search = q;
        searchInput.value = q;
    }
    
    // Check if wishlist filter is active (special local filter)
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const filterType = urlParams.get('filter');
    if (filterType === 'wishlist') {
        renderWishlistPage();
        return;
    }

    renderCatalogPage();
}

async function renderCatalogPage() {
    try {
        const categories = await getCategories(catalogFilters.department);
        const { products, totalItems, totalPages, currentPage } = await getProducts(catalogFilters);

        // Get matching department details
        const deptInfo = getDepartmentDetails(catalogFilters.department);
        
        let html = `
            <div class="container">
                <!-- 1. Department Promotion Banner -->
                <div class="dept-banner">
                    ${getOptimizedImgTag({ src: deptInfo.image, alt: deptInfo.title, className: "dept-banner-bg", width: 1600, height: 400, isEager: true, aspectRatio: "16/5" })}
                    <div class="dept-banner-overlay">
                        <h1>${escapeHtml(deptInfo.title)}</h1>
                        <p>${escapeHtml(deptInfo.subtitle)}</p>
                    </div>
                </div>

                <!-- Category bubbles list -->
                ${categories.length > 0 ? `
                    <div style="display: flex; gap: 12px; overflow-x: auto; padding: 10px 0; margin-bottom: 24px;">
                        <a href="#/${catalogFilters.department}" class="btn btn-sm ${!catalogFilters.category ? 'btn-gold' : 'btn-outline-dark'}" style="white-space: nowrap;">
                            All ${catalogFilters.department ? capitalize(catalogFilters.department) : 'Products'}
                        </a>
                        ${categories.map(cat => `
                            <a href="#/${catalogFilters.department}/${encodeURIComponent(cat.name)}" class="btn btn-sm ${catalogFilters.category === cat.name ? 'btn-gold' : 'btn-outline-dark'}" style="white-space: nowrap;">
                                ${escapeHtml(cat.name)} (${cat.count})
                            </a>
                        `).join('')}
                    </div>
                ` : ''}

                <!-- Catalog Grid Layout -->
                <div class="shop-layout">
                    
                    <!-- Filters Sidebar (Desktop) -->
                    <aside class="filters-sidebar">
                        <div class="filter-group">
                            <h4>Price Range (PKR)</h4>
                            <div class="price-inputs">
                                <input type="number" id="filter-price-min" placeholder="Min" value="${catalogFilters.priceMin}">
                                <span class="price-separator">-</span>
                                <input type="number" id="filter-price-max" placeholder="Max" value="${catalogFilters.priceMax}">
                            </div>
                        </div>
                        
                        ${catalogFilters.department === 'jewelry' ? `
                            <div class="filter-group">
                                <h4>Material & Plating</h4>
                                <div class="filter-list">
                                    ${['Gold Plated', 'Silver Plated', 'Rhodium', 'Sterling Silver', 'Xuping'].map(mat => `
                                        <label class="filter-item">
                                            <input type="checkbox" class="filter-material" value="${mat}" ${catalogFilters.attributes['Material/Plating'] === mat ? 'checked' : ''}>
                                            <span>${mat}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <div class="filter-group">
                            <h4>Availability</h4>
                            <label class="filter-item">
                                <input type="checkbox" id="filter-instock" ${catalogFilters.inStockOnly ? 'checked' : ''}>
                                <span>In Stock Only</span>
                            </label>
                            <label class="filter-item" style="margin-top: 8px;">
                                <input type="checkbox" id="filter-onsale" ${catalogFilters.onSale ? 'checked' : ''}>
                                <span>On Sale Items</span>
                            </label>
                        </div>
                        
                        <div class="filter-actions">
                            <button id="btn-apply-filters" class="btn btn-primary btn-full btn-sm">Apply Filters</button>
                            <button id="btn-clear-filters" class="btn btn-outline-dark btn-full btn-sm">Clear All</button>
                        </div>
                    </aside>

                    <!-- Products List Column -->
                    <div class="shop-content">
                        <!-- Top actions bar -->
                        <div class="catalog-top-actions">
                            <div class="results-count">
                                Showing <strong>${products.length}</strong> of <strong>${totalItems}</strong> products
                            </div>
                            <div class="sort-select-wrapper">
                                <label for="catalog-sort">Sort By:</label>
                                <select id="catalog-sort" class="sort-select">
                                    <option value="newest" ${catalogFilters.sortBy === 'newest' ? 'selected' : ''}>Newest Arrivals</option>
                                    <option value="price-asc" ${catalogFilters.sortBy === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                                    <option value="price-desc" ${catalogFilters.sortBy === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
                                    <option value="popularity" ${catalogFilters.sortBy === 'popularity' ? 'selected' : ''}>Popularity (Ratings)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Product Grid -->
                        ${products.length > 0 ? `
                            <div class="product-grid">
                                ${renderProductCards(products)}
                            </div>
                            
                            <!-- Pagination -->
                            ${totalPages > 1 ? `
                                <div class="pagination">
                                    <button class="page-btn" id="btn-page-prev" ${currentPage === 1 ? 'disabled' : ''}>
                                        <i class="fa-solid fa-chevron-left"></i>
                                    </button>
                                    ${Array.from({ length: totalPages }).map((_, idx) => `
                                        <button class="page-btn btn-page-number ${currentPage === idx + 1 ? 'active' : ''}" data-page="${idx + 1}">
                                            ${idx + 1}
                                        </button>
                                    `).join('')}
                                    <button class="page-btn" id="btn-page-next" ${currentPage === totalPages ? 'disabled' : ''}>
                                        <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                </div>
                            ` : ''}
                        ` : `
                            <div class="no-results-container">
                                <i class="fa-solid fa-circle-exclamation no-results-icon"></i>
                                <h3>No Products Found</h3>
                                <p>We couldn't find any products matching your filters or category choice.</p>
                                <button id="btn-reset-catalog" class="btn btn-gold">Reset Filters</button>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        appContainer.innerHTML = html;
        bindCatalogEvents();
        bindProductCardEvents();
    } catch(err) {
        console.error(err);
        appContainer.innerHTML = `<div class="container" style="padding: 100px 0; text-align: center;"><h2>Error loading catalog</h2><p>${err.message}</p></div>`;
    }
}

function getDepartmentDetails(dept) {
    switch(dept) {
        case 'jewelry':
            return {
                title: 'Elegant Jewelry Department',
                subtitle: 'Attainable luxury plating designs including rings, adjustable bracelets and bangles.',
                image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1600&q=80'
            };
        case 'diecast':
            return {
                title: 'Diecast Department',
                subtitle: 'Accurately detailed scale replicas in alloy metals and rubber components.',
                image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1600&q=80'
            };
        case 'toys':
            return {
                title: 'Toys & Brain Puzzles',
                subtitle: 'Safe, premium action figures, modular sets, STEM block kits and interactive puzzles.',
                image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1600&q=80'
            };
        case 'clothing':
            return {
                title: 'Casual Clothing Apparel',
                subtitle: 'Relaxed fit tees, double needle Fleece hoodies and premium accessories.',
                image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1600&q=80'
            };
        default:
            return {
                title: 'HK Catalog Collection',
                subtitle: 'Explore 500+ premium products across all departments.',
                image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1600&q=80'
            };
    }
}

function bindCatalogEvents() {
    // Apply filters button
    const applyBtn = document.getElementById('btn-apply-filters');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            catalogFilters.priceMin = document.getElementById('filter-price-min').value;
            catalogFilters.priceMax = document.getElementById('filter-price-max').value;
            catalogFilters.inStockOnly = document.getElementById('filter-instock').checked;
            catalogFilters.onSale = document.getElementById('filter-onsale').checked;
            
            // Checkboxes for material
            const materialCheckboxes = document.querySelectorAll('.filter-material:checked');
            if (materialCheckboxes.length > 0) {
                // Take first selected material for simplicity in routing
                catalogFilters.attributes['Material/Plating'] = materialCheckboxes[0].value;
            } else {
                delete catalogFilters.attributes['Material/Plating'];
            }
            
            catalogFilters.page = 1;
            renderCatalogPage();
        });
    }

    // Clear filters button
    const clearBtn = document.getElementById('btn-clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            catalogFilters.priceMin = '';
            catalogFilters.priceMax = '';
            catalogFilters.inStockOnly = false;
            catalogFilters.onSale = false;
            catalogFilters.attributes = {};
            catalogFilters.page = 1;
            renderCatalogPage();
        });
    }

    // Reset button inside empty state
    const resetBtn = document.getElementById('btn-reset-catalog');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            catalogFilters.priceMin = '';
            catalogFilters.priceMax = '';
            catalogFilters.inStockOnly = false;
            catalogFilters.onSale = false;
            catalogFilters.attributes = {};
            catalogFilters.category = '';
            catalogFilters.search = '';
            catalogFilters.page = 1;
            renderCatalogPage();
        });
    }

    // Sort selection
    const sortSelect = document.getElementById('catalog-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            catalogFilters.sortBy = sortSelect.value;
            catalogFilters.page = 1;
            renderCatalogPage();
        });
    }

    // Pagination numbers
    const pageNumBtns = document.querySelectorAll('.btn-page-number');
    pageNumBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catalogFilters.page = parseInt(btn.dataset.page, 10);
            renderCatalogPage();
        });
    });

    const prevPageBtn = document.getElementById('btn-page-prev');
    if (prevPageBtn && !prevPageBtn.disabled) {
        prevPageBtn.addEventListener('click', () => {
            catalogFilters.page -= 1;
            renderCatalogPage();
        });
    }

    const nextPageBtn = document.getElementById('btn-page-next');
    if (nextPageBtn && !nextPageBtn.disabled) {
        nextPageBtn.addEventListener('click', () => {
            catalogFilters.page += 1;
            renderCatalogPage();
        });
    }
}

// --- 3. WISHLIST LOCAL PAGE ---
function renderWishlistPage() {
    const list = getWishlist();
    let html = `
        <div class="container" style="padding: 48px 0;">
            <div class="section-title-wrapper">
                <h2 class="section-title">Your Saved Wishlist</h2>
                <p class="section-subtitle">Bookmark your favorite jewelry designs and collectibles.</p>
            </div>
            
            ${list.length > 0 ? `
                <div class="product-grid" id="wishlist-grid">
                    ${list.map(p => `
                        <div class="product-card">
                            <div class="product-image-wrapper">
                                <img src="${p.image}" alt="${p.title}">
                                <button class="wishlist-btn-overlay in-wishlist btn-remove-wishlist-direct" data-id="${p.id}" title="Remove from wishlist">
                                    <i class="fa-solid fa-heart"></i>
                                </button>
                            </div>
                            <div class="product-details">
                                <div class="product-cat">${escapeHtml(p.department)}</div>
                                <a href="#/product/${p.id}" class="product-title">${escapeHtml(p.title)}</a>
                                <div class="product-pricing" style="margin-top: 14px;">
                                    <span class="current-price">PKR ${p.price.toLocaleString()}</span>
                                </div>
                                <a href="#/product/${p.id}" class="btn btn-gold btn-sm" style="margin-top: 16px;">View Item</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-results-container">
                    <i class="fa-regular fa-heart no-results-icon"></i>
                    <h3>Your Wishlist is Empty</h3>
                    <p>Tap the heart icon on any jewelry, diecast, or clothing product to save it here.</p>
                    <a href="#/jewelry" class="btn btn-gold">Explore Jewelry</a>
                </div>
            `}
        </div>
    `;

    appContainer.innerHTML = html;

    // Bind wishlist remove events
    const removeBtns = document.querySelectorAll('.btn-remove-wishlist-direct');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            // Toggle will remove
            toggleWishlist({ id });
            renderWishlistPage();
        });
    });
}

// --- Helper to extract product size options from variations or attributes ---
function getProductSizes(p) {
    if (!p) return [];

    // 1. Extract from variations array if present
    if (Array.isArray(p.variations) && p.variations.length > 0) {
        const sizes = [];
        for (const v of p.variations) {
            if (!v || typeof v !== 'object') continue;
            const vAttrs = Array.isArray(v.attributes) ? v.attributes : [];
            let sizeAttr = vAttrs.find(a => a && a.name && /size|ring|dress|bangle/i.test(a.name));
            if (!sizeAttr && vAttrs.length > 0) {
                sizeAttr = vAttrs[0];
            }

            if (sizeAttr) {
                const rawOption = sizeAttr.option || sizeAttr.value || '';
                const attrName = sizeAttr.name || 'Size';
                
                const stockSt = v.stock_status || 'instock';
                let isInstock = stockSt === 'instock';
                if (v.is_in_stock === false) isInstock = false;
                if (v.stock_quantity !== null && v.stock_quantity !== undefined && v.stock_quantity <= 0) {
                    isInstock = false;
                }

                sizes.push({
                    variationId: v.id,
                    attrName: attrName,
                    rawOption: rawOption,
                    cleanLabel: formatSizeLabel(rawOption),
                    isInstock: isInstock,
                    price: v.price !== undefined ? v.price : p.price,
                    regularPrice: v.regular_price !== undefined ? v.regular_price : p.regular_price
                });
            }
        }
        
        const hasSizeKeyword = sizes.some(s => /size|ring|dress|bangle/i.test(s.attrName));
        if (hasSizeKeyword || (sizes.length > 0 && sizes.length <= 15)) {
            return sizes;
        }
    }

    // 2. Fallback to top-level attributes object if variations not detailed
    if (p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)) {
        for (const [k, v] of Object.entries(p.attributes)) {
            if (/size|ring|dress|bangle/i.test(k) && v) {
                const opts = String(v).split(',').map(o => o.trim()).filter(Boolean);
                return opts.map(opt => ({
                    variationId: null,
                    attrName: k,
                    rawOption: opt,
                    cleanLabel: formatSizeLabel(opt),
                    isInstock: isProductInStock(p),
                    price: p.price,
                    regularPrice: p.regular_price
                }));
            }
        }
    }

    return [];
}

function formatSizeLabel(rawOption) {
    if (!rawOption) return '';
    const str = String(rawOption).trim();
    // Match pattern like "7 (Normal)", "6 (Small)", "5 (X Small)", "8 (Medium)", "9 (Large)"
    const m = str.match(/^(\d+)\s*\([^)]*\)$/);
    if (m) return m[1];

    const abbrevMap = {
        'small': 'S',
        'medium': 'M',
        'large': 'L',
        'extra large': 'XL',
        '2x large': '2XL',
        '3x large': '3XL'
    };
    if (abbrevMap[str.toLowerCase()]) {
        return abbrevMap[str.toLowerCase()];
    }

    return str;
}

// --- Helper to build Product cards ---
function renderProductCards(productsList) {
    return productsList.map((p, idx) => {
        const isEager = idx < 4;
        const isWish = isInWishlist(p.id);
        const hasDiscount = p.on_sale && p.regular_price > p.price;
        const discountPct = hasDiscount ? Math.round(((p.regular_price - p.price) / p.regular_price) * 100) : 0;
        const sizes = getProductSizes(p);
        const hasSizeOptions = sizes && sizes.length > 0;
        const mainImage = p.images && p.images.length > 0 ? p.images[0] : (p.image || '');

        return `
            <div class="product-card" data-id="${p.id}">
                <div class="product-image-wrapper">
                    ${getOptimizedImgTag({ src: mainImage, alt: p.title, width: 300, height: 300, isEager, aspectRatio: "1/1" })}
                    
                    <div class="product-badges">
                        ${hasDiscount ? `<span class="badge-sale">-${discountPct}% OFF</span>` : ''}
                        ${!isProductInStock(p) ? `<span class="badge-outofstock">Sold Out</span>` : ''}
                    </div>

                    <button class="wishlist-btn-overlay ${isWish ? 'in-wishlist' : ''} btn-toggle-wishlist" data-id="${p.id}">
                        <i class="${isWish ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>

                    <div class="quick-view-overlay">
                        <button class="btn-quick-view" data-id="${p.id}">Quick Details</button>
                    </div>
                </div>
                <div class="product-details">
                    <div class="product-cat">${escapeHtml(p.category || p.department || '')}</div>
                    <a href="#/product/${p.id}" class="product-title">${escapeHtml(p.title)}</a>
                    <div class="product-rating">
                        ${renderStars(p.average_rating || 5)}
                        <span class="rating-count">(${p.reviews ? p.reviews.length : 1})</span>
                    </div>
                    <div class="product-pricing">
                        <span class="current-price">PKR ${p.price?.toLocaleString()}</span>
                        ${hasDiscount ? `<span class="regular-price">PKR ${p.regular_price?.toLocaleString()}</span>` : ''}
                    </div>

                    ${hasSizeOptions ? `
                        <div class="card-size-section">
                            <div class="card-size-label">Select Size:</div>
                            <div class="card-size-options">
                                ${sizes.map(s => `
                                    <button type="button" 
                                        class="card-size-btn ${!s.isInstock ? 'disabled' : ''}" 
                                        data-variation-id="${s.variationId ?? ''}" 
                                        data-attr-name="${escapeHtml(s.attrName)}" 
                                        data-raw-option="${escapeHtml(s.rawOption)}"
                                        data-price="${s.price}"
                                        title="${escapeHtml(s.attrName)}: ${escapeHtml(s.rawOption)}${!s.isInstock ? ' (Out of Stock)' : ''}"
                                        ${!s.isInstock ? 'disabled' : ''}>
                                        ${escapeHtml(s.cleanLabel)}
                                    </button>
                                `).join('')}
                            </div>
                            <div class="card-size-warning" style="display:none;">Please select a size</div>
                        </div>
                    ` : ''}

                    <div class="card-action-row">
                        <button type="button" class="btn btn-gold btn-full btn-card-add-to-cart" data-id="${p.id}" ${!isProductInStock(p) ? 'disabled' : ''}>
                            <i class="fa-solid fa-bag-shopping"></i> ${isProductInStock(p) ? 'Add to Bag' : 'Sold Out'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderStars(rating) {
    let starsHtml = '';
    const rounded = Math.round(rating);
    for (let s = 1; s <= 5; s++) {
        if (s <= rounded) {
            starsHtml += `<i class="fa-solid fa-star"></i>`;
        } else {
            starsHtml += `<i class="fa-regular fa-star"></i>`;
        }
    }
    return starsHtml;
}

function bindProductCardEvents() {
    // 1. Wishlist Toggle Buttons
    const wishBtns = document.querySelectorAll('.btn-toggle-wishlist');
    wishBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            const product = await getProductById(id);
            if (product) {
                toggleWishlist(product);
                const isWishNow = isInWishlist(id);
                btn.className = `wishlist-btn-overlay ${isWishNow ? 'in-wishlist' : ''} btn-toggle-wishlist`;
                btn.querySelector('i').className = `${isWishNow ? 'fa-solid' : 'fa-regular'} fa-heart`;
            }
        });
    });

    // 2. Quick View click handles or standard title clicks redirect
    const quickBtns = document.querySelectorAll('.btn-quick-view');
    quickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.id;
            window.location.hash = `#/product/${id}`;
        });
    });

    // 3. Card Size Pill Selection
    const cardSizeBtns = document.querySelectorAll('.card-size-btn');
    cardSizeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.disabled || btn.classList.contains('disabled')) return;

            const card = btn.closest('.product-card');
            if (!card) return;

            // Remove active state from sibling buttons in this card
            card.querySelectorAll('.card-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Store selection on card dataset
            card.dataset.selectedVarId = btn.dataset.variationId || '';
            card.dataset.selectedAttrName = btn.dataset.attrName || '';
            card.dataset.selectedRawOption = btn.dataset.rawOption || '';

            // Hide warning if visible
            const warningEl = card.querySelector('.card-size-warning');
            if (warningEl) warningEl.style.display = 'none';

            // Dynamically update card price if variation price exists
            const varPrice = parseFloat(btn.dataset.price);
            if (!isNaN(varPrice) && varPrice > 0) {
                const currentPriceEl = card.querySelector('.current-price');
                if (currentPriceEl) {
                    currentPriceEl.textContent = `PKR ${varPrice.toLocaleString()}`;
                }
            }
        });
    });

    // 4. Card Add to Bag / Add to Cart Button Click
    const cardAddBtns = document.querySelectorAll('.btn-card-add-to-cart');
    cardAddBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.disabled) return;

            const card = btn.closest('.product-card');
            if (!card) return;

            const productId = parseInt(btn.dataset.id, 10);
            const product = await getProductById(productId);
            if (!product) return;

            const sizeSection = card.querySelector('.card-size-section');
            const hasSizes = !!sizeSection;

            if (hasSizes) {
                const selectedRawOption = card.dataset.selectedRawOption;
                if (!selectedRawOption) {
                    // Show clear error message: "Please select a size."
                    const warningEl = card.querySelector('.card-size-warning');
                    if (warningEl) warningEl.style.display = 'block';

                    // Shake size pills options container for visual feedback
                    const optionsBox = card.querySelector('.card-size-options');
                    if (optionsBox) {
                        optionsBox.classList.remove('shake-warning');
                        void optionsBox.offsetWidth; // Trigger reflow
                        optionsBox.classList.add('shake-warning');
                    }
                    return;
                }
            }

            // Build cart item parameters
            const attrName = card.dataset.selectedAttrName || 'Size';
            const rawOption = card.dataset.selectedRawOption || '';
            const selectedAttributes = rawOption ? { [attrName]: rawOption } : {};
            const variationId = card.dataset.selectedVarId ? parseInt(card.dataset.selectedVarId, 10) : null;
            const price = card.dataset.selectedPrice ? parseFloat(card.dataset.selectedPrice) : product.price;

            const cartItem = {
                ...product,
                price: price,
                variationId: variationId
            };

            addToCart(cartItem, 1, selectedAttributes);

            // Visual button confirmation
            const origHtml = btn.innerHTML;
            btn.classList.add('btn-added-success');
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Added!`;

            setTimeout(() => {
                btn.classList.remove('btn-added-success');
                btn.innerHTML = origHtml;
            }, 1200);

            // Open cart drawer
            openCartDrawer();
        });
    });
}

// --- 4. PRODUCT DETAIL VIEW ---
async function renderProductDetailPage(id) {
    renderLoader(appContainer);

    try {
        const product = await getProductById(id);
        if (!product) {
            appContainer.innerHTML = `<div class="container" style="padding: 100px 0; text-align: center;"><h2>Product Not Found</h2><p>The product ID "${id}" does not exist in our system.</p><a href="#/" class="btn btn-gold">Back to Home</a></div>`;
            return;
        }

        // Add to recently viewed list
        addToRecentlyViewed(product);

        // Fetch related products (Strict division: same department ONLY)
        const relatedRes = await getProducts({ department: product.department, limit: 4 });
        const relatedProducts = relatedRes.products.filter(p => p.id !== product.id).slice(0, 4);

        const hasDiscount = product.on_sale && product.regular_price > product.price;
        const discountPct = hasDiscount ? Math.round(((product.regular_price - product.price) / product.regular_price) * 100) : 0;
        const isWish = isInWishlist(product.id);

        let html = `
            <div class="container" style="padding-top: 30px;">
                <!-- Breadcrumbs -->
                <div class="product-breadcrumbs">
                    <a href="#/">Home</a> / 
                    <a href="#/${product.department}">${capitalize(product.department)}</a> / 
                    <a href="#/${product.department}/${encodeURIComponent(product.category)}">${product.category}</a>
                </div>

                <div class="product-detail-layout">
                    <!-- Left: Images Column -->
                    <div class="product-gallery">
                        <div class="main-image-wrapper">
                            ${getOptimizedImgTag({ src: product.images[0], alt: product.title, width: 800, height: 800, isEager: true, aspectRatio: "1/1", extraAttrs: 'id="main-product-gallery-img"' })}
                        </div>
                        <div class="thumbnails-grid">
                            ${product.images.map((img, idx) => `
                                <div class="thumbnail-item ${idx === 0 ? 'active' : ''}" data-src="${img}">
                                    ${getOptimizedImgTag({ src: img, alt: `${product.title} Thumb ${idx + 1}`, width: 120, height: 120, aspectRatio: "1/1" })}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Right: Info Details Column -->
                    <div class="product-info-col">
                        <h1 class="detail-title">${escapeHtml(product.title)}</h1>
                        
                        <div class="detail-meta">
                            <div class="product-rating">
                                ${renderStars(product.average_rating)}
                                <span class="rating-count">(${product.reviews ? product.reviews.length : 1} Customer Reviews)</span>
                            </div>
                            <span class="detail-sku">SKU: ${product.sku}</span>
                            <span class="stock-status-badge ${isProductInStock(product) ? 'stock-instock' : 'stock-outofstock'}">
                                ${isProductInStock(product) ? 'In Stock' : 'Sold Out'}
                            </span>
                        </div>

                        <div class="detail-pricing">
                            ${(() => {
                                // Determine displayed price for variable products
                                if (product.variations && product.variations.length > 0) {
                                    // Find lowest variation price
                                    const prices = product.variations.map(v => v.price).filter(p => p != null);
                                    const minPrice = Math.min(...prices);
                                    const maxPrice = Math.max(...prices);
                                    const priceText = minPrice === maxPrice ? `PKR ${minPrice.toLocaleString()}` : `PKR ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}`;
                                    return `<span class="current-price">${priceText}</span>` + (hasDiscount ? `
                                        <span class="regular-price">PKR ${product.regular_price?.toLocaleString()}</span>
                                        <span class="badge-sale" style="position: static; margin-left: 10px;">-${discountPct}% OFF</span>` : '');
                                } else {
                                    // Use standard price
                                    return `<span class="current-price">PKR ${product.price?.toLocaleString()}</span>` + (hasDiscount ? `
                                        <span class="regular-price">PKR ${product.regular_price?.toLocaleString()}</span>
                                        <span class="badge-sale" style="position: static; margin-left: 10px;">-${discountPct}% OFF</span>` : '');
                                }
                            })()}
                        </div>

                        ${product.variations && product.variations.length > 0 ? `
                            <div class="size-selector">
                                <div class="size-selector-label" style="font-weight: 600; margin-bottom: 8px;">Select Size:</div>
                                ${(() => {
                                    const sizeAbbrevMap = {
                                        'S': 'Small',
                                        'M': 'Medium',
                                        'L': 'Large',
                                        'XL': 'Extra Large',
                                        'XXL': '2X Large',
                                        '3XL': '3X Large'
                                    };
                                    return product.variations.map(v => {
                                        // Match any attribute name containing 'size' (e.g. 'Dress Size', 'Clothing Size', 'Ring Size', 'Bangle Size')
                                        const sizeAttr = v.attributes.find(a => a.name.toLowerCase().includes('size')) || v.attributes[0];
                                        let rawLabel = sizeAttr ? (sizeAttr.option || sizeAttr.value || 'Size') : 'Size';
                                        // Map standalone codes like 'S', 'M', 'L', 'XL' to full names while preserving existing full labels like '6 (Small)' or 'Medium'
                                        const sizeLabel = sizeAbbrevMap[rawLabel.toUpperCase()] || rawLabel;
                                        const disabled = v.stock_status !== 'instock' ? 'disabled' : '';
                                        return `<button type="button" class="size-option-btn btn btn-outline-dark" data-variation-id="${v.id}">${escapeHtml(sizeLabel)}</button>`;
                                    }).join(' ');
                                })()}
                            </div>
                        ` : ''}

                        <div class="detail-desc">${product.description || product.short_description || ''}</div>

                        <!-- Attribute selection if sizing / variations are present -->
                        <div class="detail-specs">
                            <h4>Specifications & Attributes</h4>
                            <div class="specs-table">
                                ${Object.entries(product.attributes).map(([key, val]) => `
                                    <div class="specs-row">
                                        <span class="specs-label">${key}</span>
                                        <span class="specs-value">${val}</span>
                                    </div>
                                `).join('')}
                                <div class="specs-row">
                                    <span class="specs-label">Delivery Service</span>
                                    <span class="specs-value">Cash on Delivery across Pakistan</span>
                                </div>
                            </div>
                        </div>

                        <!-- Purchase action controls -->
                        ${isProductInStock(product) ? `
                            <div class="purchase-controls">
                                <div class="qty-add-row">
                                    <div class="qty-selector">
                                        <button class="qty-btn" id="btn-qty-minus">-</button>
                                        <input type="number" value="1" min="1" max="${(product.stock_quantity !== null && product.stock_quantity !== undefined) ? product.stock_quantity : 99}" class="qty-input" id="detail-qty-input">
                                        <button class="qty-btn" id="btn-qty-plus">+</button>
                                    </div>
                                    <button class="btn btn-primary btn-full" id="btn-add-to-cart-detail" ${product.variations && product.variations.length > 0 ? 'disabled' : ''}>
                                        <i class="fa-solid fa-bag-shopping"></i> Add to Bag
                                    </button>
                                    <div id="size-select-warning" class="text-danger" style="margin-top:4px; display:none;">Please select a size</div>
                                </div>
                                <div class="action-buttons-stack">
                                    <button class="btn btn-outline-dark btn-full btn-toggle-wishlist-detail" data-id="${product.id}">
                                        <i class="${isWish ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${isWish ? 'Remove from Wishlist' : 'Add to Wishlist'}
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <div style="margin-bottom: 30px;">
                                <div style="padding: 12px; background: #FEE2E2; color: #991B1B; border-radius: 6px; font-weight: 600; text-align: center;">
                                    <i class="fa-solid fa-circle-xmark"></i> This item is currently out of stock
                                </div>
                            </div>
                        `}

                        <!-- Trust Messaging badges -->
                        <div class="trust-badges-grid">
                            <div class="trust-badge-item">
                                <i class="fa-solid fa-box-open"></i>
                                <strong>Gift-Ready Packaging</strong>
                                <p>HK Presentation velvet boxes</p>
                            </div>
                            <div class="trust-badge-item">
                                <i class="fa-solid fa-hand-holding-dollar"></i>
                                <strong>Cash on Delivery</strong>
                                <p>Pay at your doorstep</p>
                            </div>
                            <div class="trust-badge-item">
                                <i class="fa-solid fa-headset"></i>
                                <strong>Responsive Support</strong>
                                <p>Direct chat on WhatsApp</p>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Related Products Section (Strictly Isolated by Department) -->
                ${relatedProducts.length > 0 ? `
                    <section class="related-sec">
                        <div class="section-title-wrapper" style="margin-bottom: 32px; text-align: left;">
                            <h3 class="section-title" style="font-size: 1.6rem; padding-bottom: 8px;">Recommended From Same Department</h3>
                            <p class="section-subtitle" style="margin: 0; text-align: left;">Other premium products under ${capitalize(product.department)}.</p>
                        </div>
                        <div class="product-grid">
                            ${renderProductCards(relatedProducts)}
                        </div>
                    </section>
                ` : ''}

                <!-- Recently Viewed Slider Section -->
                ${renderRecentlyViewedSection(product.id)}

            </div>
        `;

        appContainer.innerHTML = html;
        bindProductDetailEvents(product);
        bindProductCardEvents();
    } catch(err) {
        console.error(err);
        appContainer.innerHTML = `<div class="container" style="padding: 100px 0; text-align: center;"><h2>Error loading product details</h2><p>${err.message}</p></div>`;
    }
}

function renderRecentlyViewedSection(currentId) {
    const list = getRecentlyViewed().filter(p => p.id !== currentId).slice(0, 4);
    if (list.length === 0) return '';
    
    return `
        <section class="related-sec" style="margin-top: 60px;">
            <div class="section-title-wrapper" style="margin-bottom: 32px; text-align: left;">
                <h3 class="section-title" style="font-size: 1.6rem; padding-bottom: 8px;">Recently Viewed Products</h3>
            </div>
            <div class="product-grid">
                ${list.map(p => `
                    <div class="product-card">
                        <div class="product-image-wrapper">
                            <img src="${p.image}" alt="${p.title}">
                        </div>
                        <div class="product-details">
                            <div class="product-cat">${escapeHtml(p.category)}</div>
                            <a href="#/product/${p.id}" class="product-title">${escapeHtml(p.title)}</a>
                            <div class="product-pricing" style="margin-top: 14px;">
                                <span class="current-price">PKR ${p.price.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function bindProductDetailEvents(product) {
    console.log('bindProductDetailEvents called for product ID', product.id);

    // Thumbnail Swapping
    const thumbs = document.querySelectorAll('.thumbnail-item');
    const mainImg = document.getElementById('main-product-gallery-img');
    thumbs.forEach(thumb => {
        thumb.addEventListener('click', () => {
            thumbs.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            mainImg.src = thumb.dataset.src;
        });
    });

    // Quantity selectors
    const qtyInput = document.getElementById('detail-qty-input');
    const minusBtn = document.getElementById('btn-qty-minus');
    const plusBtn = document.getElementById('btn-qty-plus');
    if (qtyInput && minusBtn && plusBtn) {
        const maxStock = (product.stock_quantity !== null && product.stock_quantity !== undefined) ? product.stock_quantity : 99;
        minusBtn.addEventListener('click', () => {
            let val = parseInt(qtyInput.value, 10);
            if (isNaN(val) || val <= 1) {
                qtyInput.value = 1;
            } else {
                qtyInput.value = val - 1;
            }
        });
        plusBtn.addEventListener('click', () => {
            let val = parseInt(qtyInput.value, 10);
            if (isNaN(val) || val < 1) {
                qtyInput.value = 1;
            } else if (val < maxStock) {
                qtyInput.value = val + 1;
            }
        });
        qtyInput.addEventListener('change', () => {
            let val = parseInt(qtyInput.value, 10);
            if (isNaN(val) || val < 1) {
                qtyInput.value = 1;
            } else if (val > maxStock) {
                qtyInput.value = maxStock;
            }
        });
    }

    // Add to Cart
    let selectedVariation = null;
    const warningEl = document.getElementById('size-select-warning');
    // Size selector event handling (delegated)
    const sizeSelectorContainer = document.querySelector('.size-selector');
    const addCartBtn = document.getElementById('btn-add-to-cart-detail');
    if (sizeSelectorContainer) {
        sizeSelectorContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.size-option-btn');
            if (!btn) return;
            // Clear active state for all buttons
            const allButtons = sizeSelectorContainer.querySelectorAll('.size-option-btn');
            allButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const varId = parseInt(btn.dataset.variationId, 10);
            selectedVariation = product.variations.find(v => v.id === varId);
            // Update price display
            const priceSpan = document.querySelector('.detail-pricing .current-price');
            if (priceSpan && selectedVariation) {
                priceSpan.textContent = `PKR ${selectedVariation.price?.toLocaleString()}`;
            }
            // Update stock badge
            const stockBadge = document.querySelector('.stock-status-badge');
            if (stockBadge && selectedVariation) {
                if (selectedVariation.stock_status === 'instock' && selectedVariation.stock_quantity > 0) {
                    stockBadge.textContent = 'In Stock';
                    stockBadge.className = 'stock-status-badge stock-instock';
                } else {
                    stockBadge.textContent = 'Sold Out';
                    stockBadge.className = 'stock-status-badge stock-outofstock';
                }
            }
            // Enable add to cart button
            if (addCartBtn) addCartBtn.disabled = false;
            // Hide warning if any
            if (warningEl) warningEl.style.display = 'none';
        });
    }

    if (addCartBtn) {
        addCartBtn.addEventListener('click', () => {
            // If product has variations, ensure a variation is selected
            if (product.variations && product.variations.length > 0 && !selectedVariation) {
                if (warningEl) warningEl.style.display = 'block';
                return;
            }
            const qty = parseInt(qtyInput.value, 10);
            // Read selected attributes
            const selAttrs = {};
            if (selectedVariation && selectedVariation.attributes) {
                selectedVariation.attributes.forEach(attr => {
                    selAttrs[attr.name] = attr.option;
                });
            }
            // Pass variation details to cart
            const cartItem = {
                ...product,
                price: selectedVariation ? selectedVariation.price : product.price,
                selectedAttributes: selAttrs,
                variationId: selectedVariation ? selectedVariation.id : null
            };
            addToCart(cartItem, qty, selAttrs);
            toggleCartDrawer();
        });
    }



    // Wishlist Toggle Detail page
    const wishBtn = document.querySelector('.btn-toggle-wishlist-detail');
    if (wishBtn) {
        wishBtn.addEventListener('click', () => {
            toggleWishlist(product);
            const isNowWish = isInWishlist(product.id);
            wishBtn.innerHTML = `<i class="${isNowWish ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${isNowWish ? 'Remove from Wishlist' : 'Add to Wishlist'}`;
            updateHeaderBadges();
        });
    }
}

// --- 5. CART PAGE VIEW ---
function renderCartPage() {
    const items = getCart();
    const subtotal = getCartTotal();

    let html = `
        <div class="container" style="padding: 48px 0;">
            <h1 style="margin-bottom: 30px; font-size: 2.2rem;">Your Shopping bag</h1>
            
            ${items.length > 0 ? `
                <div class="cart-page-layout">
                    <!-- Left: Items list -->
                    <div class="cart-table-container">
                        <div class="cart-header-row">
                            <span>Product</span>
                            <span>Price</span>
                            <span>Quantity</span>
                            <span style="text-align: right;">Total</span>
                        </div>
                        ${items.map(item => `
                            <div class="cart-item-row" data-id="${item.id}" data-attrs='${JSON.stringify(item.selectedAttributes)}'>
                                <div class="cart-item-info">
                                    ${getOptimizedImgTag({ src: item.image, alt: item.title, className: "cart-item-img", width: 100, height: 100, aspectRatio: "1/1" })}
                                    <div class="cart-item-details">
                                        <h3><a href="#/product/${item.id}">${escapeHtml(item.title)}</a></h3>
                                        ${Object.keys(item.selectedAttributes).length > 0 ? `
                                            <span>${Object.entries(item.selectedAttributes).map(([k,v]) => `${k}: ${v}`).join(', ')}</span>
                                        ` : ''}
                                        <button class="cart-item-remove btn-remove-cart-item" data-id="${item.id}">
                                            <i class="fa-solid fa-trash-can"></i> Remove
                                        </button>
                                    </div>
                                </div>
                                <div class="cart-item-price">
                                    PKR ${item.price.toLocaleString()}
                                </div>
                                <div>
                                    <div class="qty-selector" style="height: 38px;">
                                        <button class="qty-btn btn-cart-qty-minus" data-id="${item.id}" data-variation-id="${item.variationId ?? ''}">-</button>
                                        <input type="number" value="${item.quantity}" min="1" class="qty-input cart-qty-input" data-id="${item.id}" data-variation-id="${item.variationId ?? ''}">
                                        <button class="qty-btn btn-cart-qty-plus" data-id="${item.id}" data-variation-id="${item.variationId ?? ''}">+</button>
                                    </div>
                                </div>
                                <div style="text-align: right; font-weight: 600;" class="current-price">
                                    PKR ${(item.price * item.quantity).toLocaleString()}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Right: Summary Sidebar -->
                    <div class="cart-summary-sidebar">
                        <h3>Summary</h3>
                        <div class="summary-row">
                            <span>Bag Subtotal</span>
                            <span>PKR ${subtotal.toLocaleString()}</span>
                        </div>
                        <div class="summary-row">
                            <span>Shipping</span>
                            <span style="color: var(--color-success); font-weight: 500;">FREE (COD)</span>
                        </div>
                        
                        <!-- Coupon Code -->
                        <div class="coupon-wrapper">
                            <input type="text" id="cart-coupon-input" placeholder="Promo / Discount Code">
                            <button id="btn-apply-coupon" class="btn btn-primary btn-sm">Apply</button>
                        </div>
                        <div id="coupon-message" style="font-size: 0.82rem; margin-bottom: 12px; display: none;"></div>

                        <div class="summary-row total-row">
                            <span>Total</span>
                            <span id="cart-grand-total">PKR ${subtotal.toLocaleString()}</span>
                        </div>
                        <a href="#/checkout" class="btn btn-gold btn-full">Proceed to Checkout</a>
                        <a href="#/jewelry" class="btn btn-outline-dark btn-full" style="margin-top: 10px;">Continue Shopping</a>
                    </div>
                </div>
            ` : `
                <div class="no-results-container" style="background-color: #FFFFFF; border: 1px solid var(--color-border); border-radius: var(--border-radius-sm);">
                    <i class="fa-solid fa-bag-shopping no-results-icon"></i>
                    <h3>Your bag is currently empty</h3>
                    <p>Before you check out, you must add some products to your shopping bag.</p>
                    <a href="#/jewelry" class="btn btn-gold">Explore Jewelry Collection</a>
                </div>
            `}
        </div>
    `;

    appContainer.innerHTML = html;
    bindCartPageEvents();
}

function bindCartPageEvents() {
    const minusBtns = document.querySelectorAll('.btn-cart-qty-minus');
    minusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const variationId = btn.dataset.variationId ? parseInt(btn.dataset.variationId, 10) : null;
            const item = getCart().find(i => i.id === id && (i.variationId || null) === variationId);
            if (item && item.quantity > 1) {
                updateQuantity(id, item.selectedAttributes, item.quantity - 1, variationId);
            }
        });
    });

    const plusBtns = document.querySelectorAll('.btn-cart-qty-plus');
    plusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const variationId = btn.dataset.variationId ? parseInt(btn.dataset.variationId, 10) : null;
            const item = getCart().find(i => i.id === id && (i.variationId || null) === variationId);
            if (item) {
                updateQuantity(id, item.selectedAttributes, item.quantity + 1, variationId);
            }
        });
    });

    const cartQtyInputs = document.querySelectorAll('.cart-qty-input');
    cartQtyInputs.forEach(input => {
        input.addEventListener('change', () => {
            const id = parseInt(input.dataset.id, 10);
            const variationId = input.dataset.variationId ? parseInt(input.dataset.variationId, 10) : null;
            const item = getCart().find(i => i.id === id && (i.variationId || null) === variationId);
            let val = parseInt(input.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            if (item) {
                updateQuantity(id, item.selectedAttributes, val, variationId);
            }
        });
    });

    // Delete item button
    const removeBtns = document.querySelectorAll('.btn-remove-cart-item');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const variationId = btn.dataset.variationId ? parseInt(btn.dataset.variationId, 10) : null;
            const item = getCart().find(i => i.id === id && (i.variationId || null) === variationId);
            if (item) {
                removeFromCart(id, item.selectedAttributes, variationId);
            }
        });
    });

    // Coupon Code Apply
    const applyCouponBtn = document.getElementById('btn-apply-coupon');
    const couponInput = document.getElementById('cart-coupon-input');
    const couponMsg = document.getElementById('coupon-message');
    const grandTotal = document.getElementById('cart-grand-total');

    if (applyCouponBtn && couponInput) {
        applyCouponBtn.addEventListener('click', () => {
            const code = couponInput.value.trim().toUpperCase();
            if (!code) return;

            couponMsg.style.display = 'block';
            if (code === 'WELCOME10' || code === 'HK10' || code === 'EID10') {
                const subtotal = getCartTotal();
                const discount = Math.round(subtotal * 0.1);
                const finalTotal = subtotal - discount;
                
                couponMsg.className = 'text-success';
                couponMsg.style.color = 'var(--color-success)';
                couponMsg.textContent = `Coupon "${code}" applied successfully! 10% Discount (PKR ${discount.toLocaleString()}) subtracted.`;
                
                grandTotal.textContent = `PKR ${finalTotal.toLocaleString()}`;
            } else {
                couponMsg.className = 'text-sale';
                couponMsg.style.color = 'var(--color-sale)';
                couponMsg.textContent = `Invalid coupon code. Try code "WELCOME10" or "HK10".`;
            }
        });
    }
}

// --- 6. CHECKOUT PAGE VIEW ---
function renderCheckoutPage() {
    const items = getCart();
    const subtotal = getCartTotal();
    
    if (items.length === 0) {
        window.location.hash = '#/cart';
        return;
    }

    let html = `
        <div class="container" style="padding: 48px 0;">
            <h1 style="margin-bottom: 30px; font-size: 2.2rem;">Guest Checkout</h1>
            
            <div class="checkout-layout">
                <!-- Left: Billing/Shipping Details -->
                <div class="checkout-form-container">
                    <form id="checkout-details-form">
                        
                        <div class="checkout-section">
                            <h3 class="checkout-section-title">1. Shipping & Contact Details</h3>
                            <div class="form-grid">
                                <div class="form-group-custom">
                                    <label for="c-first-name">First Name *</label>
                                    <input type="text" id="c-first-name" required>
                                </div>
                                <div class="form-group-custom">
                                    <label for="c-last-name">Last Name *</label>
                                    <input type="text" id="c-last-name" required>
                                </div>
                                <div class="form-group-custom form-full-col">
                                    <label for="c-phone">WhatsApp/Phone Number (for delivery verification) *</label>
                                    <input type="tel" id="c-phone" placeholder="e.g. 03001234567" pattern="03[0-9]{9}" required>
                                </div>
                                <div class="form-group-custom form-full-col">
                                    <label for="c-email">Email Address *</label>
                                    <input type="email" id="c-email" required>
                                </div>
                                <div class="form-group-custom form-full-col">
                                    <label for="c-address">Street Address / Block / Area *</label>
                                    <input type="text" id="c-address" placeholder="House/Apartment number, Street, Sector..." required>
                                </div>
                                <div class="form-group-custom">
                                    <label for="c-city">City *</label>
                                    <select id="c-city" required>
                                        <option value="" disabled selected>Select your city</option>
                                        <option value="Lahore">Lahore</option>
                                        <option value="Karachi">Karachi</option>
                                        <option value="Islamabad">Islamabad</option>
                                        <option value="Rawalpindi">Rawalpindi</option>
                                        <option value="Faisalabad">Faisalabad</option>
                                        <option value="Multan">Multan</option>
                                        <option value="Peshawar">Peshawar</option>
                                        <option value="Quetta">Quetta</option>
                                        <option value="Sialkot">Sialkot</option>
                                        <option value="Gujranwala">Gujranwala</option>
                                    </select>
                                </div>
                                <div class="form-group-custom">
                                    <label for="c-province">Province *</label>
                                    <select id="c-province" required>
                                        <option value="Punjab">Punjab</option>
                                        <option value="Sindh">Sindh</option>
                                        <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa (KPK)</option>
                                        <option value="Balochistan">Balochistan</option>
                                        <option value="Federal">Islamabad Capital Territory</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="checkout-section" style="margin-top: 40px;">
                            <h3 class="checkout-section-title">2. Payment Method</h3>
                            <div class="payment-methods-selector">
                                <!-- COD Payment -->
                                <div class="payment-option active" id="pay-cod">
                                    <input type="radio" name="payment-method" value="cod" checked id="radio-cod">
                                    <div class="payment-option-text">
                                        <label for="radio-cod"><h5>💵 Cash on Delivery (COD)</h5></label>
                                        <p>Pay with cash directly to the courier agent upon receiving your shipment. Recommended option across Pakistan.</p>
                                    </div>
                                </div>

                                <!-- Bank / Manual Transfer -->
                                <div class="payment-option" id="pay-bank">
                                    <input type="radio" name="payment-method" value="bank" id="radio-bank">
                                    <div class="payment-option-text">
                                        <label for="radio-bank"><h5>🏦 Direct Bank Transfer / EasyPaisa (Manual)</h5></label>
                                        <p>Send payment directly to our official Meezan Bank account or EasyPaisa account. Orders dispatched upon verification.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Bank & Wallet Details Box -->
                            <div id="bank-details-box" style="margin-top: 14px; padding: 16px; background-color: var(--color-bg-offset); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); font-size: 0.88rem; display: none;">
                                <strong style="font-size: 0.95rem; color: var(--color-primary-dark); display: block; margin-bottom: 8px;">HK Accessories Official Payment Accounts:</strong>
                                
                                <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed var(--color-border);">
                                    <strong style="color: var(--color-primary);">🏦 Meezan Bank:</strong><br>
                                    📌 <strong>Account Title:</strong> Hina kaleem dogar<br>
                                    📌 <strong>Account Number:</strong> 02480106933374<br>
                                    📌 <strong>IBAN:</strong> PK22MEZN0002480106933374
                                </div>
                                
                                <div>
                                    <strong style="color: var(--color-primary);">📱 EasyPaisa:</strong><br>
                                    📌 <strong>Account Title:</strong> Hina kaleem<br>
                                    📌 <strong>EasyPaisa Number:</strong> 03364422188
                                </div>
                                
                                <em style="color: #64748B; margin-top: 10px; display: block;">Send your transaction screenshot to our WhatsApp (+92 317 4914140) after transferring for instant verification.</em>
                            </div>
                        </div>

                        <div class="checkout-section" style="margin-top: 40px;">
                            <h3 class="checkout-section-title">3. Order Comments (Optional)</h3>
                            <div class="form-group-custom form-full-col">
                                <label for="c-notes">Delivery Instructions or Gift message card text</label>
                                <textarea id="c-notes" rows="3" placeholder="Enter special notes for delivery, or text for gift card..."></textarea>
                            </div>
                        </div>

                        <div style="margin-top: 40px;">
                            <button type="submit" class="btn btn-gold btn-full" id="btn-submit-checkout">Place Order (COD)</button>
                        </div>
                    </form>
                </div>

                <!-- Right: Order items summary -->
                <div class="order-summary-box">
                    <h3 class="checkout-section-title">Order Summary</h3>
                    <div class="order-items-list">
                        ${items.map(item => `
                            <div class="checkout-item-row">
                                ${getOptimizedImgTag({ src: item.image, alt: item.title, className: "checkout-item-img", width: 80, height: 80, aspectRatio: "1/1" })}
                                <div class="checkout-item-info">
                                    <div class="checkout-item-title">${escapeHtml(item.title)}</div>
                                    <div class="checkout-item-qty">Qty: ${item.quantity} ${Object.keys(item.selectedAttributes).length > 0 ? `| ${Object.values(item.selectedAttributes).join(', ')}` : ''}</div>
                                </div>
                                <div class="checkout-item-price">PKR ${(item.price * item.quantity).toLocaleString()}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="summary-row">
                        <span>Items Subtotal</span>
                        <span>PKR ${subtotal.toLocaleString()}</span>
                    </div>
                    <div class="summary-row">
                        <span>Shipping Delivery</span>
                        <span style="color: var(--color-success); font-weight: 500;">FREE</span>
                    </div>
                    <div class="summary-row total-row">
                        <span>Order Total</span>
                        <span style="color: var(--color-primary); font-weight: 700;">PKR ${subtotal.toLocaleString()}</span>
                    </div>

                    <div style="font-size: 0.8rem; color: var(--color-text-muted); text-align: center; margin-top: 20px;">
                        <i class="fa-solid fa-lock" style="color: var(--color-accent);"></i> Secure Guest Checkout - No registration required.
                    </div>
                </div>
            </div>
        </div>
    `;

    appContainer.innerHTML = html;
    bindCheckoutEvents();
}

function bindCheckoutEvents() {
    const radioCod = document.getElementById('radio-cod');
    const radioBank = document.getElementById('radio-bank');
    const optionCod = document.getElementById('pay-cod');
    const optionBank = document.getElementById('pay-bank');
    const bankDetailsBox = document.getElementById('bank-details-box');
    const submitBtn = document.getElementById('btn-submit-checkout');

    if (radioCod && radioBank) {
        radioCod.addEventListener('change', () => {
            optionCod.classList.add('active');
            optionBank.classList.remove('active');
            bankDetailsBox.style.display = 'none';
            submitBtn.textContent = 'Place Order (COD)';
        });
        radioBank.addEventListener('change', () => {
            optionCod.classList.remove('active');
            optionBank.classList.add('active');
            bankDetailsBox.style.display = 'block';
            submitBtn.textContent = 'Place Order (Bank / Wallet Transfer)';
        });

        optionCod.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                radioCod.checked = true;
                radioCod.dispatchEvent(new Event('change'));
            }
        });
        optionBank.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                radioBank.checked = true;
                radioBank.dispatchEvent(new Event('change'));
            }
        });
    }

    // Real-Time Lead Capture
    const phoneInput = document.getElementById('c-phone');
    const fnameInput = document.getElementById('c-first-name');
    const lnameInput = document.getElementById('c-last-name');
    const emailInput = document.getElementById('c-email');

    phoneInput?.addEventListener('blur', () => checkAndSaveCheckoutLeadBeforeRoute('phone_blur'));
    fnameInput?.addEventListener('blur', () => checkAndSaveCheckoutLeadBeforeRoute('fname_blur'));
    lnameInput?.addEventListener('blur', () => checkAndSaveCheckoutLeadBeforeRoute('lname_blur'));
    emailInput?.addEventListener('blur', () => checkAndSaveCheckoutLeadBeforeRoute('email_blur'));

    // Standard Form Checkout Submission
    const checkoutForm = document.getElementById('checkout-details-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const selectedPayment = document.querySelector('input[name="payment-method"]:checked').value;
            const orderData = {
                firstName: document.getElementById('c-first-name').value.trim(),
                lastName: document.getElementById('c-last-name').value.trim(),
                phone: document.getElementById('c-phone').value.trim(),
                email: document.getElementById('c-email').value.trim(),
                address: document.getElementById('c-address').value.trim(),
                city: document.getElementById('c-city').value,
                state: document.getElementById('c-province').value,
                paymentMethod: selectedPayment,
                paymentStatus: selectedPayment === 'cod' ? 'Pending COD' : 'Pending Bank/Wallet Verification',
                note: document.getElementById('c-notes').value.trim(),
                items: getCart().map(i => ({ productId: i.id, title: i.title, quantity: i.quantity, price: i.price })),
                total: getCartTotal()
            };

            processFinalOrderSubmission(orderData);
        });
    }
}

// Handler for Direct Wallet Instant Gateway (JazzCash / EasyPaisa)
function triggerWalletGatewayModal(orderData, gateway, phone, amount) {
    const modal = document.getElementById('modal-wallet-push-prompt');
    const modalTitle = document.getElementById('wallet-modal-title');
    const modalDesc = document.getElementById('wallet-modal-desc');
    const modalPhone = document.getElementById('wallet-modal-phone');
    const modalAmount = document.getElementById('wallet-modal-amount');
    const timerEl = document.getElementById('wallet-timer');
    const mpinInput = document.getElementById('wallet-mpin-input');
    const confirmBtn = document.getElementById('btn-confirm-wallet-pay');
    const cancelBtn = document.getElementById('btn-cancel-wallet-pay');

    const providerName = gateway === 'jazzcash' ? 'JazzCash' : 'EasyPaisa';
    modalTitle.textContent = `${providerName} Direct Gateway`;
    modalDesc.innerHTML = `Sending USSD prompt to <strong>${phone}</strong>... Please enter your 4-digit ${providerName} MPIN below to complete payment.`;
    modalPhone.textContent = phone;
    modalAmount.textContent = `PKR ${amount.toLocaleString()}`;
    mpinInput.value = '';
    
    modal.classList.add('active');
    mpinInput.focus();

    let timeLeft = 60;
    timerEl.textContent = `${timeLeft}s`;
    const timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = `${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            modal.classList.remove('active');
            alert(`Payment request timed out. Please retry placing your order.`);
        }
    }, 1000);

    const cleanup = () => {
        clearInterval(timerInterval);
        modal.classList.remove('active');
    };

    cancelBtn.onclick = () => {
        cleanup();
    };

    confirmBtn.onclick = async () => {
        const mpin = mpinInput.value.trim();
        if (mpin.length < 4) {
            alert(`Please enter your 4-digit ${providerName} MPIN.`);
            mpinInput.focus();
            return;
        }

        cleanup();
        renderLoader(appContainer);

        try {
            // Call Server Gateway API
            const gatewayRes = await fetch('/api/payment/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gateway, phone, amount })
            }).then(r => r.json()).catch(() => ({
                success: true,
                txn_id: `${gateway === 'jazzcash' ? 'JC' : 'EP'}-${Math.floor(10000000 + Math.random() * 90000000)}`
            }));

            const txnId = gatewayRes.txn_id || `${gateway === 'jazzcash' ? 'JC' : 'EP'}-${Math.floor(10000000 + Math.random() * 90000000)}`;
            orderData.paymentStatus = `Paid via ${providerName} (Txn #${txnId})`;
            orderData.paymentTxnId = txnId;

            processFinalOrderSubmission(orderData);
        } catch (e) {
            alert('Gateway error: ' + e.message);
            renderCheckoutPage();
        }
    };
}

async function processFinalOrderSubmission(orderData) {
    renderLoader(appContainer);
    try {
        const response = await placeOrder(orderData);
        if (response.success) {
            const waUrl = response.whatsappUrl || getWhatsAppOrderUrl(response.orderRecord || response);

            localStorage.setItem('hk_last_order', JSON.stringify({
                id: response.orderId,
                trackingCode: response.trackingCode,
                details: orderData,
                whatsappUrl: waUrl
            }));
            
            clearCart();
            window.open(waUrl, '_blank');
            renderOrderConfirmationPage();
        } else {
            alert('Checkout failed: ' + response.message);
            renderCheckoutPage();
        }
    } catch(err) {
        console.error(err);
        alert('Order placement error: ' + err.message);
        renderCheckoutPage();
    }
}

function renderOrderConfirmationPage() {
    const lastOrder = JSON.parse(localStorage.getItem('hk_last_order'));
    if (!lastOrder) {
        window.location.hash = '#/';
        return;
    }

    const waUrl = lastOrder.whatsappUrl || getWhatsAppOrderUrl(lastOrder);

    appContainer.innerHTML = `
        <div class="container" style="padding: 80px 0; text-align: center; max-width: 600px;">
            <i class="fa-solid fa-circle-check" style="font-size: 4rem; color: var(--color-success); margin-bottom: 24px;"></i>
            <h1 style="font-size: 2.2rem; margin-bottom: 16px;">Thank You for Your Order!</h1>
            <p style="font-size: 1.1rem; color: var(--color-text-dark); margin-bottom: 20px;">
                Your order has been placed successfully. An automated WhatsApp order alert has been sent to our store manager.
            </p>
            
            <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 14px; border-radius: 8px; margin-bottom: 24px; color: #166534; font-size: 0.9rem; text-align: center;">
                <i class="fa-brands fa-whatsapp" style="font-size: 1.2rem; margin-right: 6px; color: #22C55E;"></i>
                <strong>WhatsApp Order Alert Sent!</strong> If WhatsApp didn't open automatically, click the button below to send your order invoice directly.
            </div>

            <div style="background-color: var(--color-bg-offset); padding: 24px; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border); text-align: left; margin-bottom: 36px;">
                <h4 style="margin-bottom: 14px; font-size: 1.05rem;">Order Invoice:</h4>
                <p><strong>Order ID:</strong> #${lastOrder.id}</p>
                <p><strong>Tracking Reference:</strong> ${lastOrder.trackingCode}</p>
                <p><strong>Deliver To:</strong> ${escapeHtml(lastOrder.details.firstName)} ${escapeHtml(lastOrder.details.lastName)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(lastOrder.details.phone)}</p>
                <p><strong>Shipping Address:</strong> ${escapeHtml(lastOrder.details.address)}, ${escapeHtml(lastOrder.details.city)}</p>
                <p><strong>Payment Method:</strong> ${lastOrder.details.paymentMethod.toUpperCase()}</p>
                <p><strong>Total Bill:</strong> PKR ${lastOrder.details.total.toLocaleString()}</p>
            </div>
            
            <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
                <a href="${waUrl}" target="_blank" class="btn btn-whatsapp" style="background-color: #25D366; color: white;">
                    <i class="fa-brands fa-whatsapp"></i> Send Order Alert via WhatsApp
                </a>
                <a href="#/tracking" class="btn btn-primary">Track Shipment</a>
            </div>
            <a href="#/" class="btn btn-outline-dark" style="margin-top: 20px; display: inline-flex;">Back to Home</a>
        </div>
    `;
}

// --- 7. ORDER TRACKING VIEW ---
function renderOrderTrackingPage() {
    let html = `
        <div class="container" style="padding: 48px 0;">
            <div class="tracking-card">
                <div class="section-title-wrapper" style="margin-bottom: 30px;">
                    <h2 class="section-title" style="font-size: 1.8rem; padding-bottom: 8px;">Track Shipment</h2>
                    <p class="section-subtitle" style="font-size: 0.9rem;">Check delivery status using your Order ID or tracking code.</p>
                </div>
                
                <form id="tracking-form" class="tracking-form">
                    <div class="form-group-custom">
                        <label for="track-id">Order Reference ID / Tracking Code</label>
                        <input type="text" id="track-id" placeholder="e.g. HK-123456-ABCD" required>
                    </div>
                    <button type="submit" class="btn btn-gold btn-full">Check Delivery Status</button>
                </form>

                <div id="tracking-results"></div>
            </div>
        </div>
    `;

    appContainer.innerHTML = html;

    const trackForm = document.getElementById('tracking-form');
    if (trackForm) {
        trackForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const code = document.getElementById('track-id').value.trim();
            showTrackingResults(code);
        });
    }
}

function showTrackingResults(code) {
    const resultsContainer = document.getElementById('tracking-results');
    if (!resultsContainer) return;

    // Simulate timeline status lookup
    resultsContainer.innerHTML = `
        <div class="tracking-result-box">
            <h4 style="margin-bottom: 14px;">Shipment Status: <span style="color: var(--color-primary); font-weight: 700;">In Transit</span></h4>
            <p><strong>Tracking Reference:</strong> ${escapeHtml(code)}</p>
            <p><strong>Estimated Delivery:</strong> 3-5 Working Days (via Leopard/Trax Courier)</p>
            
            <div class="tracking-timeline">
                <div class="timeline-step active">
                    <h4>Order Placed & Confirmed</h4>
                    <span>Parcel received at dispatch warehouse - Lahore</span>
                </div>
                <div class="timeline-step active">
                    <h4>Dispatched / Handed over to Courier</h4>
                    <span>Shipment in transit to transit hub</span>
                </div>
                <div class="timeline-step">
                    <h4>Out for Delivery</h4>
                    <span>Courier rider dispatched to shipping address</span>
                </div>
                <div class="timeline-step">
                    <h4>Delivered (Cash Collected)</h4>
                    <span>Transaction completed at doorstep</span>
                </div>
            </div>
        </div>
    `;
}

// --- 8. ABOUT US VIEW ---
function renderAboutPage(section = null) {
    let html = `
        <div class="container text-page-container">
            <h1 style="font-size: 2.2rem; text-align: center; color: var(--color-primary-dark); font-family: var(--font-heading); margin-bottom: 24px;">About HK Accessories</h1>
            <p><strong>HK Accessories</strong> is a leading Pakistan-based e-commerce store offering premium-accessible fashion jewelry alongside dedicated departments for diecast model collectibles, children's toys, and casual clothing.</p>
            <p>We pride ourselves on bridging the gap between high-end luxurious aesthetics and attainable pricing. Our jewelry collection features carefully handpicked designs that look elegant, refined, and gift-worthy—without the premium tag of gold or certified gemstones.</p>
            
            <h2 id="shipping">Pakistan-Wide Shipping & Delivery</h2>
            <p>We deliver parcels across all major cities and rural sectors of Pakistan. Orders are shipped within 24 hours of placement and take approximately <strong>3 to 5 working days</strong> to arrive.</p>
            <ul>
                <li><strong>Cash on Delivery (COD):</strong> Pay in cash at your door. No prepayment required!</li>
                <li><strong>Free Delivery:</strong> All orders over PKR 2,000 qualify for free standard shipping. Orders below PKR 2,000 carry a standard delivery fee of PKR 250.</li>
            </ul>

            <h2 id="returns">Exchanges, Returns & Cancellations</h2>
            <p>Customer satisfaction is our ultimate priority. We offer a transparent return and exchange policy:</p>
            <ul>
                <li><strong>7-Day Exchange Policy:</strong> If a jewelry item doesn't fit or you receive a damaged collectible, contact us within 7 days on WhatsApp for a quick exchange.</li>
                <li><strong>Order Cancellation:</strong> You can cancel your order anytime before dispatch by messaging our support line with your Order ID. Once shipped, orders cannot be cancelled.</li>
                <li><strong>Damaged Items:</strong> Please record a brief video while opening your parcel. In the rare case of damage during transit, we will replace the item free of cost.</li>
            </ul>

            <h2 id="care">Jewelry Care Guide</h2>
            <p>To preserve the plating, luster, and sparkle of your fashion jewelry, please follow these guidelines:</p>
            <ul>
                <li>Avoid direct contact with perfumes, hand sanitizers, cosmetics, and water.</li>
                <li>Remove rings, necklaces, and bangles before swimming, bathing, or doing household chores.</li>
                <li>Gently wipe with a soft, clean flannel cloth after each use.</li>
                <li>Store separate from other metal items in an airtight jewelry box or velvet pouches provided.</li>
            </ul>
        </div>
    `;

    appContainer.innerHTML = html;

    // Scroll to specific section if parameter is passed
    if (section) {
        const el = document.getElementById(section);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- 9. CONTACT SUPPORT VIEW ---
function renderContactPage() {
    let html = `
        <div class="container text-page-container">
            <h1 style="font-size: 2.2rem; text-align: center; color: var(--color-primary-dark); font-family: var(--font-heading); margin-bottom: 24px;">Contact Support</h1>
            <p>Need help with your order? Our team is available 24/7 on WhatsApp and email to resolve order tracking, returns, and sizing inquiries.</p>
            
            <div class="contact-layout">
                <!-- Info Col -->
                <div class="contact-info-col">
                    <div class="contact-info-item">
                        <i class="fa-solid fa-location-dot"></i>
                        <div>
                            <h4>Our Address</h4>
                            <p>HK Accessories Warehouse Hub,<br>Gulberg III, Lahore, Pakistan.</p>
                        </div>
                    </div>
                    <div class="contact-info-item">
                        <i class="fa-solid fa-phone"></i>
                        <div>
                            <h4>Phone / Call Center</h4>
                            <p>+92 42 111-HK-ACCS (111-452-227)</p>
                        </div>
                    </div>
                    <div class="contact-info-item">
                        <i class="fa-brands fa-whatsapp"></i>
                        <div>
                            <h4>WhatsApp Chat</h4>
                            <p><a href="https://wa.me/923001234567" target="_blank" style="color: var(--color-success); font-weight: 600;">+92 300 1234567</a></p>
                        </div>
                    </div>
                    <div class="contact-info-item">
                        <i class="fa-solid fa-envelope"></i>
                        <div>
                            <h4>Email Support</h4>
                            <p>support@hk-accessories.com</p>
                        </div>
                    </div>
                </div>

                <!-- Form Col -->
                <div>
                    <form id="contact-form" class="tracking-form">
                        <div class="form-group-custom">
                            <label for="cnt-name">Your Full Name *</label>
                            <input type="text" id="cnt-name" required>
                        </div>
                        <div class="form-group-custom">
                            <label for="cnt-email">Email Address *</label>
                            <input type="email" id="cnt-email" required>
                        </div>
                        <div class="form-group-custom">
                            <label for="cnt-msg">Message details *</label>
                            <textarea id="cnt-msg" rows="4" placeholder="Enter your inquiry details..." required></textarea>
                        </div>
                        <button type="submit" class="btn btn-gold btn-full">Send Message</button>
                    </form>
                </div>
            </div>
        </div>
    `;

    appContainer.innerHTML = html;

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Thank you for contacting HK Accessories! Our representative will respond to your email/phone number shortly.');
            contactForm.reset();
        });
    }
}

// --- 404 NOT FOUND ---
function render404Page() {
    appContainer.innerHTML = `
        <div class="container" style="padding: 100px 0; text-align: center;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 4rem; color: var(--color-accent); margin-bottom: 24px;"></i>
            <h1 style="font-size: 2.2rem; margin-bottom: 16px;">404 Page Not Found</h1>
            <p style="color: var(--color-text-muted); margin-bottom: 30px;">The link you followed may be broken or the page has been moved.</p>
            <a href="#/" class="btn btn-gold">Return to Homepage</a>
        </div>
    `;
}

// --- CART DRAWER RENDERING ---
function renderCartDrawer() {
    const items = getCart();
    const subtotal = getCartTotal();
    const count = getCartCount();
    
    // Update count labels
    document.getElementById('drawer-cart-total-count').textContent = count;
    document.getElementById('cart-drawer-subtotal').textContent = `PKR ${subtotal.toLocaleString()}`;

    const itemsContainer = document.getElementById('cart-drawer-items');
    if (!itemsContainer) return;

    if (items.length === 0) {
        itemsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 10px; color: var(--color-text-muted);">
                <i class="fa-solid fa-bag-shopping" style="font-size: 2.5rem; color: var(--color-border); margin-bottom: 16px;"></i>
                <p>Your shopping bag is empty.</p>
                <a href="#/jewelry" class="btn btn-sm btn-gold" style="margin-top: 14px;">Browse Jewelry</a>
            </div>
        `;
        return;
    }

    itemsContainer.innerHTML = items.map(item => `
        <div class="drawer-item" data-id="${item.id}">
            ${getOptimizedImgTag({ src: item.image, alt: item.title, className: "drawer-item-img", width: 80, height: 80, aspectRatio: "1/1" })}
            <div class="drawer-item-info">
                <a href="#/product/${item.id}" class="drawer-item-title">${escapeHtml(item.title)}</a>
                ${Object.keys(item.selectedAttributes).length > 0 ? `
                    <div class="drawer-item-meta">${Object.entries(item.selectedAttributes).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="drawer-item-price">PKR ${item.price.toLocaleString()}</span>
                    <span style="font-size: 0.8rem; font-weight: 500; color: var(--color-text-muted)">Qty: ${item.quantity}</span>
                </div>
            </div>
            <button class="drawer-item-remove btn-drawer-remove" data-id="${item.id}" data-variation-id="${item.variationId ?? ''}" data-attrs='${JSON.stringify(item.selectedAttributes)}' title="Remove">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');

    // Bind drawer remove buttons
    const removeBtns = itemsContainer.querySelectorAll('.btn-drawer-remove');
    removeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const variationId = btn.dataset.variationId ? parseInt(btn.dataset.variationId, 10) : null;
            const attrs = JSON.parse(btn.dataset.attrs);
            removeFromCart(id, attrs, variationId);
        });
    });

    // Bind drawer action links (Proceed to Checkout, View Bag, product links) to close drawer on click
    const drawerActionLinks = cartDrawer?.querySelectorAll('a');
    drawerActionLinks?.forEach(link => {
        link.removeEventListener('click', closeCartDrawer);
        link.addEventListener('click', closeCartDrawer);
    });
}

// --- NEWSLETTER SUBMISSION MOCK ---
function handleNewsletterSubmit(e) {
    e.preventDefault();
    alert('Thank you for subscribing! Check your inbox for your 10% coupon code: WELCOME10.');
    e.target.reset();
}

// --- UTILITIES ---
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}

// --- EXIT-INTENT CART SAVER MODAL HANDLER ---
function initExitIntentModal() {
    const exitModal = document.getElementById('exit-modal');
    const closeBtn = document.getElementById('btn-close-exit-modal');
    const exitForm = document.getElementById('exit-modal-form');
    const itemCountEl = document.getElementById('exit-modal-item-count');
    const cartTotalEl = document.getElementById('exit-modal-cart-total');
    const successMsg = document.getElementById('exit-modal-success-msg');

    if (!exitModal) return;

    function openExitModal() {
        const cartCount = getCartCount();
        if (cartCount === 0) return;
        // Don't show again if customer already dismissed or submitted in this session
        if (sessionStorage.getItem('hk_exit_dismissed') === 'true') return;
        if (window.location.hash.includes('/checkout')) return;
        if (exitModal.classList.contains('active')) return;

        if (itemCountEl) itemCountEl.textContent = cartCount;
        if (cartTotalEl) cartTotalEl.textContent = `PKR ${getCartTotal().toLocaleString()}`;

        exitModal.classList.add('active');
        sessionStorage.setItem('hk_exit_dismissed', 'true');
    }

    // Only trigger on desktop when cursor leaves top edge of browser window (e.relatedTarget === null)
    document.addEventListener('mouseleave', (e) => {
        if (e.clientY <= 5 && e.relatedTarget === null) {
            openExitModal();
        }
    });

    closeBtn?.addEventListener('click', () => {
        exitModal.classList.remove('active');
        sessionStorage.setItem('hk_exit_dismissed', 'true');
    });

    exitModal.addEventListener('click', (e) => {
        if (e.target === exitModal) {
            exitModal.classList.remove('active');
            sessionStorage.setItem('hk_exit_dismissed', 'true');
        }
    });

    exitForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('exit-customer-name')?.value.trim();
        const phone = document.getElementById('exit-customer-phone')?.value.trim();

        if (!name || !phone) return;

        const cartItems = getCart().map(i => ({
            id: i.id,
            title: i.title,
            price: i.price,
            quantity: i.quantity
        }));

        const payload = {
            id: `ac-${Date.now().toString(36)}`,
            customerName: name,
            phone: phone,
            items: cartItems,
            total: getCartTotal(),
            updated_at: new Date().toISOString(),
            status: 'Abandoned'
        };

        // Save to localStorage immediately
        const localCarts = JSON.parse(localStorage.getItem('hk_abandoned_carts') || '[]');
        const existingIdx = localCarts.findIndex(c => c.phone === phone);
        if (existingIdx >= 0) localCarts[existingIdx] = payload;
        else localCarts.unshift(payload);
        localStorage.setItem('hk_abandoned_carts', JSON.stringify(localCarts));

        try {
            await fetch('/api/abandoned_carts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error('Error saving draft cart:', err);
        }

        sessionStorage.setItem('hk_exit_dismissed', 'true');
        if (successMsg) successMsg.style.display = 'block';
        setTimeout(() => {
            exitModal.classList.remove('active');
            if (successMsg) successMsg.style.display = 'none';
        }, 1500);
    });
}

// Global Checkout Lead Capture Helper with Session Deduplication & Console Logging
let leadCaptureDebounceTimer = null;

function checkAndSaveCheckoutLeadBeforeRoute(source = 'unknown') {
    console.log(`[LeadCapture] Triggered from source: "${source}"`);
    const phoneInput = document.getElementById('c-phone') || document.getElementById('checkout-phone');
    const fnameInput = document.getElementById('c-first-name') || document.getElementById('c-fname') || document.getElementById('checkout-first-name');
    const lnameInput = document.getElementById('c-last-name') || document.getElementById('c-lname') || document.getElementById('checkout-last-name');
    const emailInput = document.getElementById('c-email') || document.getElementById('checkout-email');
    if (!phoneInput) {
        console.log('[LeadCapture] Skipped: phone input element is not in DOM.');
        return;
    }

    const phone = phoneInput.value.trim();
    if (!phone || phone.length < 5) {
        console.log(`[LeadCapture] Skipped: phone input "${phone}" is empty or < 5 characters.`);
        return;
    }

    const fname = fnameInput?.value.trim() || 'Visitor';
    const lname = lnameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || 'N/A';

    const cartItems = getCart().map(i => ({
        id: i.id,
        title: i.title,
        price: i.price,
        quantity: i.quantity
    }));

    if (cartItems.length === 0) {
        console.log('[LeadCapture] Skipped: Cart has no items.');
        return;
    }

    let sessionId = sessionStorage.getItem('hk_cart_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        sessionStorage.setItem('hk_cart_session_id', sessionId);
    }

    const payload = {
        id: `ac-${phone.replace(/\D/g, '') || sessionId}`,
        session_id: sessionId,
        customerName: `${fname} ${lname}`.trim(),
        phone: phone,
        email: email,
        items: cartItems,
        total: getCartTotal(),
        updated_at: new Date().toISOString(),
        status: 'Abandoned'
    };

    console.log('[LeadCapture] Formatted Payload to Save:', payload);

    // Save to localStorage immediately
    const localCarts = JSON.parse(localStorage.getItem('hk_abandoned_carts') || '[]');
    const idx = localCarts.findIndex(c => (c.session_id && c.session_id === sessionId) || c.phone === phone);
    if (idx >= 0) localCarts[idx] = payload;
    else localCarts.unshift(payload);
    localStorage.setItem('hk_abandoned_carts', JSON.stringify(localCarts));

    // Send to server keepalive
    try {
        fetch('/api/abandoned_carts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(payload)
        }).then(res => console.log('[LeadCapture] Server response HTTP status:', res.status))
          .catch(err => console.warn('[LeadCapture] Server fetch error:', err));
    } catch (e) {
        console.warn('[LeadCapture] Fetch exception:', e);
    }
}

window.addEventListener('beforeunload', () => checkAndSaveCheckoutLeadBeforeRoute('beforeunload'));
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') checkAndSaveCheckoutLeadBeforeRoute('visibilitychange_hidden');
});

// Initialize Application on load
init();
initExitIntentModal();
