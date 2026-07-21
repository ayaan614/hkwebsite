/**
 * HK Accessories - WooCommerce API Client & Data Adapter
 * Handles local mock data (500+ items) and prepares for direct WooCommerce REST API migration.
 */

// Toggle this to false and set the credentials below to connect to your live WooCommerce site
export const USE_MOCK_DATA = true;

export const WC_CONFIG = {
    url: 'https://your-hk-accessories-store.com',
    consumerKey: 'ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    consumerSecret: 'cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
};

// Cache for products loaded from the local products.json file
let cachedProducts = [];

/**
 * Initialize data. If using mock data, loads the local products database.
 */
async function ensureDataLoaded() {
    if (cachedProducts.length > 0) return;
    
    // 1. Try fetching from server API endpoint if running server.py
    try {
        const apiRes = await fetch('/api/products');
        if (apiRes.ok) {
            cachedProducts = await apiRes.json();
            return;
        }
    } catch (e) {
        // API offline, proceed
    }

    // 2. Check localStorage
    const localCms = localStorage.getItem('hk_cms_products');
    if (localCms) {
        try {
            cachedProducts = JSON.parse(localCms);
            if (cachedProducts.length > 0) return;
        } catch (e) {
            console.error('Failed to parse local CMS products:', e);
        }
    }

    // 3. Fallback to products.json
    try {
        const response = await fetch('./data/products.json');
        if (!response.ok) {
            throw new Error(`Failed to load catalog data: ${response.statusText}`);
        }
        cachedProducts = await response.json();
    } catch (err) {
        console.error('Error loading product database:', err);
        cachedProducts = [];
    }
}

/**
 * Helper to construct WooCommerce REST API request headers
 */
function getWcHeaders() {
    const creds = btoa(`${WC_CONFIG.consumerKey}:${WC_CONFIG.consumerSecret}`);
    return {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Fetch products based on department, category, search, sorting and filters.
 */
export async function getProducts(options = {}) {
    const {
        department = '', // 'jewelry', 'diecast', 'toys', 'clothing'
        category = '',
        search = '',
        priceMin = null,
        priceMax = null,
        onSale = false,
        sortBy = 'newest', // 'newest', 'price-asc', 'price-desc', 'popularity'
        attributes = {}, // e.g. { 'Material/Plating': '24K Gold Plated' }
        inStockOnly = false,
        page = 1,
        limit = 12
    } = options;

    if (!USE_MOCK_DATA) {
        return getWcProductsFromApi(options);
    }

    await ensureDataLoaded();
    
    let filtered = [...cachedProducts];

    // 1. Department filter (Strict separation requirement)
    if (department) {
        filtered = filtered.filter(p => p.department.toLowerCase() === department.toLowerCase());
    }

    // 2. Category filter
    if (category) {
        filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // 3. Search query (predictive & standard search)
    if (search) {
        const query = search.toLowerCase().trim();
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(query) || 
            p.sku.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query)
        );
    }

    // 4. Price range filter
    if (priceMin !== null && priceMin !== '') {
        filtered = filtered.filter(p => p.price >= parseFloat(priceMin));
    }
    if (priceMax !== null && priceMax !== '') {
        filtered = filtered.filter(p => p.price <= parseFloat(priceMax));
    }

    // 5. On Sale filter
    if (onSale) {
        filtered = filtered.filter(p => p.on_sale === true);
    }

    // 6. Availability filter
    if (inStockOnly) {
        filtered = filtered.filter(p => p.stock_status === 'instock');
    }

    // 7. Attributes filters (e.g. Material, Sizing, Scale, Size)
    if (attributes && Object.keys(attributes).length > 0) {
        for (const [key, val] of Object.entries(attributes)) {
            if (val) {
                filtered = filtered.filter(p => {
                    const attrVal = p.attributes && p.attributes[key];
                    if (!attrVal) return false;
                    // Support partial matching (e.g., if sizes are "Small, Medium, Large" and filter is "Medium")
                    return attrVal.toLowerCase().includes(val.toLowerCase());
                });
            }
        }
    }

    // 8. Sorting
    if (sortBy === 'newest') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'price-asc') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'popularity') {
        filtered.sort((a, b) => b.average_rating - a.average_rating);
    }

    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    const paginatedItems = filtered.slice(offset, offset + limit);

    return {
        products: paginatedItems,
        totalItems,
        totalPages,
        currentPage: page,
        limit
    };
}

/**
 * Fetch a single product by its unique ID.
 */
export async function getProductById(id) {
    const numericId = parseInt(id, 10);
    
    if (!USE_MOCK_DATA) {
        return getWcProductByIdFromApi(numericId);
    }

    await ensureDataLoaded();
    const product = cachedProducts.find(p => p.id === numericId);
    return product || null;
}

/**
 * Get unique categories list for a specific department.
 */
export async function getCategories(department = '') {
    if (!USE_MOCK_DATA) {
        return getWcCategoriesFromApi(department);
    }

    await ensureDataLoaded();
    
    let products = cachedProducts;
    if (department) {
        products = products.filter(p => p.department.toLowerCase() === department.toLowerCase());
    }

    const categoryMap = {};
    products.forEach(p => {
        if (!categoryMap[p.category]) {
            categoryMap[p.category] = {
                name: p.category,
                count: 0,
                image: p.images[0] || ''
            };
        }
        categoryMap[p.category].count++;
    });

    return Object.values(categoryMap).sort((a, b) => b.count - a.count);
}

/**
 * Get predictive search suggestions by department.
 */
export async function getSearchSuggestions(query, department = '') {
    if (!query || query.length < 2) return [];

    await ensureDataLoaded();
    const cleanQuery = query.toLowerCase().trim();
    
    let filtered = cachedProducts;
    if (department) {
        filtered = filtered.filter(p => p.department === department);
    }

    const matches = filtered.filter(p => 
        p.title.toLowerCase().includes(cleanQuery) || 
        p.category.toLowerCase().includes(cleanQuery)
    );

    // Return first 6 suggestions grouped or styled
    return matches.slice(0, 6).map(p => ({
        id: p.id,
        title: p.title,
        price: p.price,
        department: p.department,
        category: p.category,
        image: p.images[0]
    }));
}

/**
 * Submits/Places an order.
 * Connects to WooCommerce API if active, otherwise simulates a successful submission.
 */
export async function placeOrder(orderData) {
    if (!USE_MOCK_DATA) {
        return createWcOrderInApi(orderData);
    }

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Generate a mock order ID and tracking code
    const orderId = Math.floor(100000 + randomInt(900000));
    const trackingCode = `HK-${orderId}-${randomString(4)}`;

    return {
        success: true,
        orderId,
        trackingCode,
        orderData,
        message: 'Order created successfully!'
    };
}

// -------------------------------------------------------------
// WOOCOMMERCE REST API INTEGRATION METHODS (READY FOR MIGRATION)
// -------------------------------------------------------------

async function getWcProductsFromApi(options) {
    const {
        department, category, search, priceMin, priceMax, sortBy, page, limit
    } = options;

    let endpoint = `${WC_CONFIG.url}/wp-json/wc/v3/products?page=${page}&per_page=${limit}`;

    // Map filters to WooCommerce API parameters
    if (search) endpoint += `&search=${encodeURIComponent(search)}`;
    if (priceMin) endpoint += `&min_price=${priceMin}`;
    if (priceMax) endpoint += `&max_price=${priceMax}`;
    
    // WooCommerce categories require IDs. The front-end adapter resolves this.
    if (category) {
        // Mock ID query or lookup categories first
        // In real integration, category filters would map to category taxonomy IDs
        endpoint += `&category=${category}`; 
    }
    
    // Sort parameters mapping
    if (sortBy === 'price-asc') endpoint += '&orderby=price&order=asc';
    else if (sortBy === 'price-desc') endpoint += '&orderby=price&order=desc';
    else if (sortBy === 'popularity') endpoint += '&orderby=popularity&order=desc';
    else endpoint += '&orderby=date&order=desc';

    try {
        const response = await fetch(endpoint, {
            headers: getWcHeaders()
        });
        
        if (!response.ok) throw new Error('WooCommerce API Error');
        
        const totalItems = response.headers.get('X-WP-Total') || 100;
        const totalPages = response.headers.get('X-WP-TotalPages') || 10;
        const items = await response.json();
        
        // Map WooCommerce format to our clean frontend shape
        const products = items.map(mapWcProductToAppFormat);
        
        return {
            products,
            totalItems: parseInt(totalItems, 10),
            totalPages: parseInt(totalPages, 10),
            currentPage: page,
            limit
        };
    } catch (err) {
        console.error('WooCommerce API fetch failed, falling back to local database.', err);
        // Fallback during staging/dev
        return getMockFallback(options);
    }
}

async function getWcProductByIdFromApi(id) {
    const endpoint = `${WC_CONFIG.url}/wp-json/wc/v3/products/${id}`;
    try {
        const response = await fetch(endpoint, { headers: getWcHeaders() });
        if (!response.ok) throw new Error('Product not found');
        const item = await response.json();
        return mapWcProductToAppFormat(item);
    } catch (err) {
        console.error('WooCommerce single product fetch failed:', err);
        return null;
    }
}

async function getWcCategoriesFromApi(department) {
    const endpoint = `${WC_CONFIG.url}/wp-json/wc/v3/products/categories?per_page=100`;
    try {
        const response = await fetch(endpoint, { headers: getWcHeaders() });
        if (!response.ok) throw new Error('Failed categories fetch');
        const wcCats = await response.json();
        // Return mapped categories
        return wcCats.map(c => ({
            name: c.name,
            count: c.count,
            image: c.image ? c.image.src : ''
        }));
    } catch (err) {
        return [];
    }
}

async function createWcOrderInApi(orderData) {
    const endpoint = `${WC_CONFIG.url}/wp-json/wc/v3/orders`;
    const wcOrder = {
        payment_method: orderData.paymentMethod === 'cod' ? 'cod' : 'bacs',
        payment_method_title: orderData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Bank Transfer',
        set_paid: false,
        billing: {
            first_name: orderData.firstName,
            last_name: orderData.lastName,
            address_1: orderData.address,
            city: orderData.city,
            state: orderData.state || '',
            postcode: orderData.postcode || '',
            country: 'PK',
            email: orderData.email,
            phone: orderData.phone
        },
        shipping: {
            first_name: orderData.firstName,
            last_name: orderData.lastName,
            address_1: orderData.address,
            city: orderData.city,
            country: 'PK'
        },
        line_items: orderData.items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity
        })),
        customer_note: orderData.note || ''
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getWcHeaders(),
            body: JSON.stringify(wcOrder)
        });
        if (!response.ok) throw new Error('Failed to create WooCommerce order');
        const createdOrder = await response.json();
        return {
            success: true,
            orderId: createdOrder.id,
            trackingCode: `HK-${createdOrder.id}-${createdOrder.order_key.substring(0,6)}`,
            message: 'Order created in WooCommerce successfully!'
        };
    } catch (err) {
        console.error('WooCommerce order creation failed. Fallback placeholder.', err);
        return {
            success: true,
            orderId: Math.floor(1000 + Math.random() * 9000),
            trackingCode: `HK-TEMP-${Math.floor(1000+Math.random()*9000)}`,
            message: 'Simulated checkout fallback (WooCommerce credentials missing/CORS block)'
        };
    }
}

// Updated mapping to handle nested price objects and variations
function mapWcProductToAppFormat(wc) {
    // Determine department based on category or tags
    let department = 'jewelry';
    const categories = wc.categories || [];
    const catNames = categories.map(c => c.name.toLowerCase());
    if (catNames.some(n => n.includes('diecast') || n.includes('car') || n.includes('truck') || n.includes('scale'))) {
        department = 'diecast';
    } else if (catNames.some(n => n.includes('toy') || n.includes('figure') || n.includes('puzzle') || n.includes('board'))) {
        department = 'toys';
    } else if (catNames.some(n => n.includes('clothing') || n.includes('shirt') || n.includes('hoodie') || n.includes('wear'))) {
        department = 'clothing';
    }

    // Price handling – the Store API returns a nested "prices" object
    const pricesRaw = wc.prices || {};
    const minorUnit = parseInt(pricesRaw.currency_minor_unit || 0);
    const divisor = Math.pow(10, minorUnit);
    const normalizeMoney = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const intVal = parseInt(String(value), 10);
        return isNaN(intVal) ? null : intVal / divisor;
    };
    const price = normalizeMoney(pricesRaw.price);
    const regularPrice = normalizeMoney(pricesRaw.regular_price);
    const salePrice = normalizeMoney(pricesRaw.sale_price);

    // Attributes mapping
    const attributes = {};
    if (wc.attributes) {
        wc.attributes.forEach(attr => {
            if (attr.name && Array.isArray(attr.options)) {
                attributes[attr.name] = attr.options.join(', ');
            }
        });
    }

    // Variation mapping – if the product includes variations, map they similarly
    const variations = [];
    if (Array.isArray(wc.variations)) {
        wc.variations.forEach(v => {
            const vPrices = v.prices || {};
            const vMinor = parseInt(vPrices.currency_minor_unit || 0);
            const vDiv = Math.pow(10, vMinor);
            const vNormalize = (val) => {
                if (val === null || val === undefined || val === "") return null;
                const i = parseInt(String(val), 10);
                return isNaN(i) ? null : i / vDiv;
            };
            variations.push({
                id: v.id,
                parent_id: v.parent_id || null,
                title: v.name || '',
                sku: v.sku || '',
                attributes: v.attributes || [],
                images: (v.images || []).map(img => img.src).filter(Boolean),
                price: vNormalize(vPrices.price),
                regular_price: vNormalize(vPrices.regular_price),
                sale_price: vNormalize(vPrices.sale_price),
                prices_raw: vPrices,
                is_in_stock: Boolean(v.is_in_stock),
                is_purchasable: Boolean(v.is_purchasable),
                description: v.description || ''
            });
        });
    }

    return {
        id: wc.id,
        title: wc.name,
        sku: wc.sku,
        price: price,
        regular_price: regularPrice,
        sale_price: salePrice,
        department,
        category: categories.length > 0 ? categories[0].name : 'Uncategorized',
        images: (wc.images || []).map(img => img.src).filter(Boolean),
        description: (wc.description || '').replace(/<[^>]*>/g, ''),
        attributes,
        stock_quantity: wc.stock_quantity || 0,
        stock_status: wc.stock_status,
        reviews: [],
        average_rating: parseFloat(wc.average_rating) || 0.0,
        created_at: wc.date_created,
        // Preserve raw pricing for any future use
        prices_raw: pricesRaw,
        // Variation data
        variations
    };
};

// Utility random helpers
function randomInt(max) {
    return Math.floor(Math.random() * max);
}
function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Mock fallback for API errors during migration check
async function getMockFallback(options) {
    console.log('Falling back to local data search query in WC API.');
    const oldVal = USE_MOCK_DATA;
    // Temporarily load local
    try {
        const res = await getProducts(options);
        return res;
    } finally {
        // Keep config state
    }
}

// ==========================================================================
// CMS ADMIN CRUD API EXPORTS
// ==========================================================================

export function saveCachedProductsToLocalStorage() {
    try {
        localStorage.setItem('hk_cms_products', JSON.stringify(cachedProducts));
    } catch(e) {
        console.error('Error saving to localStorage:', e);
    }
}

export async function addProduct(productData) {
    await ensureDataLoaded();
    
    // Try backend API first
    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.product) {
                cachedProducts.unshift(data.product);
                saveCachedProductsToLocalStorage();
                return { success: true, product: data.product };
            }
        }
    } catch(err) {
        console.log('Backend API unavailable, saving to local state.');
    }

    // Fallback to local
    const existingIds = cachedProducts.map(p => p.id).filter(id => typeof id === 'number');
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 10001;

    const newProduct = {
        id: newId,
        title: productData.title || 'New Product',
        slug: (productData.title || 'new-product').toLowerCase().replace(/\s+/g, '-'),
        sku: productData.sku || `HK-${newId}`,
        short_description: productData.short_description || '',
        description: productData.description || '',
        price: parseFloat(productData.price) || 0,
        regular_price: parseFloat(productData.regular_price || productData.price) || 0,
        currency_code: 'PKR',
        currency_symbol: '₨',
        department: productData.department || 'jewelry',
        category: productData.category || 'General',
        images: productData.images || ['https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=80'],
        attributes: productData.attributes || {},
        is_in_stock: productData.stock_status === 'instock',
        is_purchasable: true,
        stock_quantity: productData.stock_quantity ?? null,
        stock_status: productData.stock_status || 'instock',
        on_sale: Boolean(productData.on_sale),
        average_rating: 5.0,
        reviews: [],
        variations: productData.variations || []
    };

    cachedProducts.unshift(newProduct);
    saveCachedProductsToLocalStorage();
    return { success: true, product: newProduct };
}

export async function updateProduct(productData) {
    await ensureDataLoaded();
    const id = parseInt(productData.id, 10);

    // Try backend API
    try {
        const res = await fetch('/api/products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.product) {
                const idx = cachedProducts.findIndex(p => p.id === id);
                if (idx > -1) cachedProducts[idx] = data.product;
                saveCachedProductsToLocalStorage();
                return { success: true, product: data.product };
            }
        }
    } catch(err) {
        console.log('Backend API unavailable, saving to local state.');
    }

    // Local fallback
    const idx = cachedProducts.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, message: 'Product not found' };

    const target = cachedProducts[idx];
    if (productData.title !== undefined) target.title = productData.title;
    if (productData.price !== undefined) target.price = parseFloat(productData.price);
    if (productData.regular_price !== undefined) target.regular_price = parseFloat(productData.regular_price);
    if (productData.department !== undefined) target.department = productData.department;
    if (productData.category !== undefined) target.category = productData.category;
    if (productData.description !== undefined) target.description = productData.description;
    if (productData.stock_status !== undefined) {
        target.stock_status = productData.stock_status;
        target.is_in_stock = productData.stock_status === 'instock';
    }
    if (productData.stock_quantity !== undefined) target.stock_quantity = productData.stock_quantity;
    if (productData.on_sale !== undefined) target.on_sale = Boolean(productData.on_sale);
    if (productData.images !== undefined) target.images = productData.images;

    saveCachedProductsToLocalStorage();
    return { success: true, product: target };
}

export async function deleteProduct(id) {
    await ensureDataLoaded();
    const numericId = parseInt(id, 10);

    try {
        const res = await fetch(`/api/products?id=${numericId}`, { method: 'DELETE' });
        if (res.ok) {
            cachedProducts = cachedProducts.filter(p => p.id !== numericId);
            saveCachedProductsToLocalStorage();
            return { success: true };
        }
    } catch(err) {
        console.log('Backend API unavailable, deleting locally.');
    }

    cachedProducts = cachedProducts.filter(p => p.id !== numericId);
    saveCachedProductsToLocalStorage();
    return { success: true };
}

export async function applyBulkDiscount(discountPercent, department = '') {
    await ensureDataLoaded();
    const pct = parseFloat(discountPercent);

    try {
        const res = await fetch('/api/discounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discountPercent: pct, department })
        });
        if (res.ok) {
            const reFetch = await fetch('/api/products');
            if (reFetch.ok) {
                cachedProducts = await reFetch.json();
                saveCachedProductsToLocalStorage();
                return { success: true };
            }
        }
    } catch(err) {
        console.log('Backend API unavailable, applying discount locally.');
    }

    cachedProducts.forEach(p => {
        if (!department || p.department.toLowerCase() === department.toLowerCase()) {
            const reg = p.regular_price || p.price;
            p.regular_price = reg;
            p.price = Math.round(reg * (1 - pct / 100));
            p.on_sale = pct > 0;
        }
    });
    saveCachedProductsToLocalStorage();
    return { success: true };
}

