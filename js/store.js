/**
 * HK Accessories - Global State Store
 * Manages shopping cart, wishlist, recently viewed products, and hash-based routing.
 * Automatically synchronizes with localStorage for persistent state.
 */

// --- Stock Status Utility ---
export function isProductInStock(p) {
    if (!p) return false;
    if (p.stock_status === 'outofstock' || p.is_in_stock === false) return false;
    if (p.stock_quantity !== null && p.stock_quantity !== undefined && p.stock_quantity <= 0) return false;
    return true;
}

// --- Routing State ---
export function getRouteInfo() {
    let hash = window.location.hash || '';
    let hashPath = hash;
    let queryString = '';

    if (hash.includes('?')) {
        const querySplit = hash.split('?');
        hashPath = querySplit[0];
        queryString = querySplit[1] || '';
    }
    
    // If hash is missing or standard root, check standalone HTML filename or URL query params
    if (!hashPath || hashPath === '#/' || hashPath === '#') {
        const pathName = window.location.pathname.split('/').pop().toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);

        if (pathName === 'contact.html') hashPath = '#/contact';
        else if (pathName === 'about.html') hashPath = '#/about';
        else if (pathName === 'cart.html') hashPath = '#/cart';
        else if (pathName === 'checkout.html') hashPath = '#/checkout';
        else if (pathName === 'tracking.html') hashPath = '#/tracking';
        else if (pathName === 'wishlist.html') hashPath = '#/wishlist';
        else if (pathName === 'shop.html') {
            const dept = urlParams.get('dept') || '';
            const cat = urlParams.get('cat') || '';
            if (dept && cat) hashPath = `#/${dept}/${cat}`;
            else if (dept) hashPath = `#/${dept}`;
            else hashPath = '#/jewelry';
        } else if (pathName === 'product.html') {
            const id = urlParams.get('id') || '';
            if (id) hashPath = `#/product/${id}`;
        } else {
            hashPath = '#/';
        }
    }

    const path = hashPath.slice(1); // Remove '#'
    const parts = path.split('/').filter(p => p !== '');
    
    const queryParams = {};
    if (queryString) {
        const searchParams = new URLSearchParams(queryString);
        for (const [k, v] of searchParams.entries()) {
            queryParams[k] = v;
        }
    }

    return {
        hash,
        path,
        page: parts[0] || 'home',
        param: parts[1] ? decodeURIComponent(parts[1]) : null,
        subParam: parts[2] ? decodeURIComponent(parts[2]) : null,
        queryParams
    };
}

// --- Listeners for State Updates ---
const listeners = [];

export function subscribe(listener) {
    listeners.push(listener);
    // Return unsubscribe function
    return () => {
        const idx = listeners.indexOf(listener);
        if (idx > -1) listeners.splice(idx, 1);
    };
}

function notifyUpdate(event, data) {
    listeners.forEach(l => l(event, data));
}

// --- Cart Management ---
let cart = JSON.parse(localStorage.getItem('hk_accessories_cart')) || [];

export function getCart() {
    return cart;
}

// Updated addToCart to differentiate by variationId
export function addToCart(product, quantity = 1, selectedAttributes = {}) {
    // Ensure variationId is part of selectedAttributes for uniqueness if not already present
    const variationId = product.variationId ?? null;
    const existingIndex = cart.findIndex(item =>
        item.id === product.id &&
        (item.variationId || null) === variationId &&
        JSON.stringify(item.selectedAttributes) === JSON.stringify(selectedAttributes)
    );

    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity;
    } else {
        cart.push({
            id: product.id,
            title: product.title,
            sku: product.sku,
            price: product.price,
            regular_price: product.regular_price,
            on_sale: product.on_sale,
            image: product.images[0] || '',
            department: product.department,
            category: product.category,
            selectedAttributes: { ...selectedAttributes },
            variationId: variationId,
            quantity
        });
    }

    saveCart();
    notifyUpdate('cart_changed', cart);
}

// Remove a specific product variation from cart
export function removeFromCart(productId, selectedAttributes = {}, variationId = null) {
    cart = cart.filter(item =>
        !(item.id === productId &&
          (item.variationId || null) === variationId &&
          JSON.stringify(item.selectedAttributes) === JSON.stringify(selectedAttributes))
    );
    saveCart();
    notifyUpdate('cart_changed', cart);
}

// Update quantity for a specific variation
export function updateQuantity(productId, selectedAttributes = {}, quantity, variationId = null) {
    const item = cart.find(item =>
        item.id === productId &&
        (item.variationId || null) === variationId &&
        JSON.stringify(item.selectedAttributes) === JSON.stringify(selectedAttributes)
    );
    if (item) {
        item.quantity = Math.max(1, parseInt(quantity, 10));
        saveCart();
        notifyUpdate('cart_changed', cart);
    }
}




export function clearCart() {
    cart = [];
    saveCart();
    notifyUpdate('cart_changed', cart);
}

export function getCartTotal() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

export function getCartCount() {
    return cart.reduce((count, item) => count + item.quantity, 0);
}

function saveCart() {
    localStorage.setItem('hk_accessories_cart', JSON.stringify(cart));
}

// --- Wishlist Management ---
let wishlist = JSON.parse(localStorage.getItem('hk_accessories_wishlist')) || [];

export function getWishlist() {
    return wishlist;
}

export function toggleWishlist(product) {
    const index = wishlist.findIndex(item => item.id === product.id);
    if (index > -1) {
        wishlist.splice(index, 1);
    } else {
        wishlist.push({
            id: product.id,
            title: product.title,
            price: product.price,
            image: product.images[0],
            department: product.department
        });
    }
    localStorage.setItem('hk_accessories_wishlist', JSON.stringify(wishlist));
    notifyUpdate('wishlist_changed', wishlist);
}

export function isInWishlist(productId) {
    return wishlist.some(item => item.id === productId);
}

// --- Recently Viewed Products ---
let recentlyViewed = JSON.parse(localStorage.getItem('hk_accessories_recently_viewed')) || [];

export function getRecentlyViewed() {
    return recentlyViewed;
}

export function addToRecentlyViewed(product) {
    // Remove if already exists to push it to the top
    recentlyViewed = recentlyViewed.filter(item => item.id !== product.id);
    
    // Add to beginning
    recentlyViewed.unshift({
        id: product.id,
        title: product.title,
        price: product.price,
        regular_price: product.regular_price,
        on_sale: product.on_sale,
        image: product.images[0] || '',
        department: product.department,
        category: product.category,
        average_rating: product.average_rating
    });
    
    // Keep max 10 items
    if (recentlyViewed.length > 10) {
        recentlyViewed.pop();
    }
    
    localStorage.setItem('hk_accessories_recently_viewed', JSON.stringify(recentlyViewed));
    notifyUpdate('recently_viewed_changed', recentlyViewed);
}
