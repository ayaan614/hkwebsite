/**
 * HK Accessories - CMS Admin Panel Controller
 * Handles product creation, editing, deletion, stock toggling, bulk discounts,
 * 50-item pagination, category management, active sales tracking, and order diagnostics.
 */

import { 
    getProducts, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    applyBulkDiscount 
} from './wc-api.js';

import { isProductInStock } from './store.js';

// State
let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
let itemsPerPage = 50;
let currentEditId = null;

// DOM Elements - Navigation & Stats
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const statTotal = document.getElementById('stat-total');
const statInStock = document.getElementById('stat-instock');
const statOnSale = document.getElementById('stat-onsale');
const statOrdersCount = document.getElementById('stat-orders-count');
const noticeCount = document.getElementById('catalog-count-notice');

// Table & Pagination Elements
const tableBody = document.getElementById('admin-table-body');
const searchInput = document.getElementById('admin-search-input');
const deptFilter = document.getElementById('admin-dept-filter');
const stockFilter = document.getElementById('admin-stock-filter');
const perPageSelect = document.getElementById('admin-perpage-select');
const sortSelect = document.getElementById('admin-sort-select');
const paginationInfo = document.getElementById('pagination-info');
const paginationButtons = document.getElementById('pagination-buttons');

// Modals
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const modalFormTitle = document.getElementById('modal-form-title');

const categoryModal = document.getElementById('category-modal');
const categoryForm = document.getElementById('category-form');

const discountModal = document.getElementById('discount-modal');
const discountForm = document.getElementById('discount-form');

const orderModal = document.getElementById('order-detail-modal');

const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authKeyInput = document.getElementById('auth-key');
const authError = document.getElementById('auth-error');

// Initialize Admin Panel
document.addEventListener('DOMContentLoaded', initAdmin);

function checkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const keyParam = urlParams.get('key') || urlParams.get('secret');
    const validKeys = ['admin123', 'hkadmin', 'hk2026', 'admin'];

    if ((keyParam && validKeys.includes(keyParam.toLowerCase())) || sessionStorage.getItem('hk_admin_authenticated') === 'true') {
        sessionStorage.setItem('hk_admin_authenticated', 'true');
        if (authModal) authModal.classList.remove('active');
        return true;
    }

    if (authModal) authModal.classList.add('active');
    return false;
}

async function initAdmin() {
    bindEvents();
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = authKeyInput.value.trim().toLowerCase();
            const validKeys = ['admin123', 'hkadmin', 'hk2026', 'admin'];
            if (validKeys.includes(val)) {
                sessionStorage.setItem('hk_admin_authenticated', 'true');
                authModal.classList.remove('active');
                loadProducts();
            } else {
                authError.style.display = 'block';
            }
        });
    }

    if (checkAuth()) {
        await loadProducts();
    }
}

async function loadProducts() {
    noticeCount.textContent = 'Loading database...';
    try {
        const res = await getProducts({ limit: 2000 });
        allProducts = res.products || [];
        updateStats();
        applyFilters();
        renderSalesTab();
        renderCategoriesTab();
        renderOrdersTab();
    } catch (err) {
        console.error(err);
        noticeCount.textContent = 'Error loading catalog data.';
    }
}

function updateStats() {
    statTotal.textContent = allProducts.length;
    
    let inStockCount = 0;
    let onSaleCount = 0;
    
    allProducts.forEach(p => {
        if (isProductInStock(p)) inStockCount++;
        if (p.on_sale) onSaleCount++;
    });

    statInStock.textContent = inStockCount;
    statOnSale.textContent = onSaleCount;

    // Load orders count
    const orders = getSavedOrders();
    statOrdersCount.textContent = orders.length;
}

// ==========================================================================
// 1. INVENTORY TAB & PAGINATION (50 ITEMS PER PAGE)
// ==========================================================================

function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const dept = deptFilter.value;
    const stock = stockFilter.value;
    const sort = sortSelect.value;
    itemsPerPage = parseInt(perPageSelect.value, 10) || 50;

    filteredProducts = allProducts.filter(p => {
        if (q) {
            const titleMatch = (p.title || '').toLowerCase().includes(q);
            const skuMatch = (p.sku || '').toLowerCase().includes(q);
            const catMatch = (p.category || '').toLowerCase().includes(q);
            if (!titleMatch && !skuMatch && !catMatch) return false;
        }

        if (dept && (p.department || '').toLowerCase() !== dept.toLowerCase()) return false;
        if (stock === 'instock' && !isProductInStock(p)) return false;
        if (stock === 'outofstock' && isProductInStock(p)) return false;
        if (stock === 'onsale' && !p.on_sale) return false;

        return true;
    });

    if (sort === 'price-asc') {
        filteredProducts.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc') {
        filteredProducts.sort((a, b) => b.price - a.price);
    } else {
        filteredProducts.sort((a, b) => b.id - a.id);
    }

    currentPage = 1;
    renderInventoryPage();
}

function renderInventoryPage() {
    const totalItems = filteredProducts.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filteredProducts.slice(startIdx, endIdx);

    noticeCount.textContent = `Showing ${totalItems} products total`;
    paginationInfo.textContent = `Showing page ${currentPage} of ${totalPages} (${totalItems} items)`;

    // Render Table Rows
    if (pageItems.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px 10px; color: #64748B;">
                    <i class="fa-solid fa-box-open" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No products found matching filters.</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = pageItems.map(p => {
            const inStock = isProductInStock(p);
            const hasDiscount = p.on_sale && p.regular_price > p.price;
            const mainImage = (p.images && p.images.length > 0) ? p.images[0] : 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=100&q=80';

            return `
                <tr>
                    <td><img src="${mainImage}" alt="${escapeHtml(p.title)}" class="table-thumb"></td>
                    <td>
                        <div style="font-weight: 600;">#${p.id}</div>
                        <div style="font-size: 0.75rem; color: #64748B;">SKU: ${escapeHtml(p.sku || 'N/A')}</div>
                    </td>
                    <td>
                        <a href="product.html?id=${p.id}" target="_blank" style="color: #1A1A2E; text-decoration: none; font-weight: 600;">
                            ${escapeHtml(p.title)}
                        </a>
                    </td>
                    <td>
                        <span style="text-transform: capitalize; font-weight: 500;">${escapeHtml(p.department || '')}</span>
                        <div style="font-size: 0.75rem; color: #64748B;">${escapeHtml(p.category || '')}</div>
                    </td>
                    <td>
                        <div style="font-weight: 600;">PKR ${p.price?.toLocaleString()}</div>
                        ${hasDiscount ? `<div style="font-size: 0.75rem; text-decoration: line-through; color: #94A3B8;">PKR ${p.regular_price?.toLocaleString()}</div>` : ''}
                    </td>
                    <td>
                        <span class="${inStock ? 'badge-status-in' : 'badge-status-out'}">${inStock ? 'In Stock' : 'Sold Out'}</span>
                        ${p.on_sale ? `<span style="background: #FEF3C7; color: #D97706; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem; margin-left: 4px;">SALE</span>` : ''}
                    </td>
                    <td>
                        <div class="action-btns" style="justify-content: center;">
                            <button class="btn-icon-action btn-edit-item" data-id="${p.id}" title="Edit Product"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                            <button class="btn-icon-action btn-delete-item" data-id="${p.id}" title="Delete Product"><i class="fa-solid fa-trash-can"></i> Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderPaginationControls(totalPages);
    bindTableActionEvents();
}

function renderPaginationControls(totalPages) {
    if (totalPages <= 1) {
        paginationButtons.innerHTML = '';
        return;
    }

    let buttonsHtml = `<button class="page-num-btn" id="btn-page-prev" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Prev</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            buttonsHtml += `<button class="page-num-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            buttonsHtml += `<span style="padding: 4px 6px; color: #94A3B8;">...</span>`;
        }
    }

    buttonsHtml += `<button class="page-num-btn" id="btn-page-next" ${currentPage === totalPages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>`;
    paginationButtons.innerHTML = buttonsHtml;

    // Bind Pagination Clicks
    paginationButtons.querySelectorAll('.page-num-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page, 10);
            renderInventoryPage();
        });
    });

    const prevBtn = document.getElementById('btn-page-prev');
    if (prevBtn && currentPage > 1) {
        prevBtn.addEventListener('click', () => {
            currentPage--;
            renderInventoryPage();
        });
    }

    const nextBtn = document.getElementById('btn-page-next');
    if (nextBtn && currentPage < totalPages) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            renderInventoryPage();
        });
    }
}

// ==========================================================================
// 2. ACTIVE SALES & PROMOTIONS TAB
// ==========================================================================

function renderSalesTab() {
    const salesTableBody = document.getElementById('sales-table-body');
    if (!salesTableBody) return;

    const saleProducts = allProducts.filter(p => p.on_sale);

    if (saleProducts.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px 10px; color: #64748B;">
                    <i class="fa-solid fa-tags" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No active product sales running currently.</p>
                </td>
            </tr>
        `;
        return;
    }

    salesTableBody.innerHTML = saleProducts.map(p => {
        const reg = p.regular_price || p.price;
        const discountPct = reg > p.price ? Math.round(((reg - p.price) / reg) * 100) : 0;

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(p.title)}</div>
                    <div style="font-size: 0.75rem; color: #64748B;">#${p.id} | SKU: ${escapeHtml(p.sku || 'N/A')}</div>
                </td>
                <td style="text-transform: capitalize;">${escapeHtml(p.department)}</td>
                <td>PKR ${reg.toLocaleString()}</td>
                <td style="font-weight: 600; color: #C0392B;">PKR ${p.price.toLocaleString()}</td>
                <td><span style="background: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 12px; font-weight: 600; font-size: 0.8rem;">-${discountPct}% OFF</span></td>
                <td style="text-align: center;">
                    <div class="action-btns" style="justify-content: center;">
                        <button class="btn-icon-action btn-edit-item" data-id="${p.id}"><i class="fa-solid fa-pen"></i> Edit Sale</button>
                        <button class="btn-icon-action btn-end-sale" data-id="${p.id}" style="background:#EF4444; color:white;"><i class="fa-solid fa-xmark"></i> End Sale</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // End single sale event
    salesTableBody.querySelectorAll('.btn-end-sale').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id, 10);
            const p = allProducts.find(item => item.id === id);
            if (p) {
                p.price = p.regular_price || p.price;
                p.on_sale = false;
                await updateProduct(p);
                await loadProducts();
            }
        });
    });

    salesTableBody.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id, 10)));
    });
}

// End All Sales
document.getElementById('btn-end-all-sales')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to end all active product sales across the store?')) {
        for (let p of allProducts) {
            if (p.on_sale) {
                p.price = p.regular_price || p.price;
                p.on_sale = false;
                await updateProduct(p);
            }
        }
        await loadProducts();
        alert('All active sales ended successfully.');
    }
});

// ==========================================================================
// 3. CATEGORY MANAGER TAB
// ==========================================================================

function renderCategoriesTab() {
    const catTableBody = document.getElementById('categories-table-body');
    if (!catTableBody) return;

    // Group categories by department and count
    const catMap = {};
    allProducts.forEach(p => {
        const dept = (p.department || 'General').toLowerCase();
        const cat = p.category || 'General';
        const key = `${dept}___${cat}`;
        if (!catMap[key]) {
            catMap[key] = { dept, name: cat, count: 0 };
        }
        catMap[key].count++;
    });

    const categoriesList = Object.values(catMap);

    catTableBody.innerHTML = categoriesList.map(c => `
        <tr>
            <td style="text-transform: capitalize; font-weight: 600;">${escapeHtml(c.dept)}</td>
            <td style="font-weight: 500;">${escapeHtml(c.name)}</td>
            <td><span style="background: #E2E8F0; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 0.8rem;">${c.count} Items</span></td>
            <td style="text-align: center;">
                <div class="action-btns" style="justify-content: center;">
                    <button class="btn-icon-action btn-rename-cat" data-dept="${c.dept}" data-name="${escapeHtml(c.name)}" style="background:#3B82F6; color:white;"><i class="fa-solid fa-pen"></i> Rename</button>
                </div>
            </td>
        </tr>
    `).join('');

    catTableBody.querySelectorAll('.btn-rename-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            const dept = btn.dataset.dept;
            const oldName = btn.dataset.name;
            openCategoryModal(dept, oldName);
        });
    });
}

function openCategoryModal(dept = 'jewelry', oldName = '') {
    document.getElementById('cat-dept').value = dept;
    document.getElementById('cat-name').value = oldName;
    document.getElementById('cat-old-name').value = oldName;
    document.getElementById('cat-modal-title').textContent = oldName ? `Rename Category: ${oldName}` : 'Add New Category';
    categoryModal.classList.add('active');
}

function closeCategoryModal() {
    categoryModal.classList.remove('active');
}

document.getElementById('btn-open-add-cat-modal')?.addEventListener('click', () => openCategoryModal());
document.getElementById('btn-close-cat-modal')?.addEventListener('click', closeCategoryModal);
document.getElementById('btn-cancel-cat-modal')?.addEventListener('click', closeCategoryModal);

categoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dept = document.getElementById('cat-dept').value;
    const oldName = document.getElementById('cat-old-name').value.trim();
    const newName = document.getElementById('cat-name').value.trim();

    if (!newName) return;

    if (oldName && oldName !== newName) {
        // Update products with this category name
        allProducts.forEach(p => {
            if ((p.department || '').toLowerCase() === dept.toLowerCase() && p.category === oldName) {
                p.category = newName;
                updateProduct(p);
            }
        });
    }

    closeCategoryModal();
    await loadProducts();
    alert(`Category "${newName}" saved!`);
});

// ==========================================================================
// 4. CUSTOMER ORDERS & DIAGNOSTICS TAB
// ==========================================================================

function getSavedOrders() {
    let orders = [];
    const lastOrder = localStorage.getItem('hk_last_order');
    if (lastOrder) {
        try { orders.push(JSON.parse(lastOrder)); } catch(e){}
    }
    const allStored = localStorage.getItem('hk_all_orders');
    if (allStored) {
        try {
            const parsed = JSON.parse(allStored);
            if (Array.isArray(parsed)) orders = [...orders, ...parsed];
        } catch(e){}
    }
    // Filter duplicates by id
    const uniqueOrders = [];
    const seenIds = new Set();
    orders.forEach(o => {
        if (o && o.id && !seenIds.has(o.id)) {
            seenIds.add(o.id);
            uniqueOrders.push(o);
        }
    });

    // Provide mock order if empty for demo review
    if (uniqueOrders.length === 0) {
        uniqueOrders.push({
            id: 108492,
            trackingCode: 'HK-108492-PAK',
            details: {
                firstName: 'Zain',
                lastName: 'Ahmed',
                phone: '03001234567',
                email: 'zain.ahmed@example.com',
                address: 'House #42, Block C, Gulberg III',
                city: 'Lahore',
                state: 'Punjab',
                paymentMethod: 'cod',
                total: 7200,
                status: 'Confirmed'
            }
        });
    }

    return uniqueOrders;
}

function renderOrdersTab() {
    const ordersTableBody = document.getElementById('orders-table-body');
    if (!ordersTableBody) return;

    const orders = getSavedOrders();

    ordersTableBody.innerHTML = orders.map(o => {
        const d = o.details || {};
        const status = d.status || 'Confirmed';

        return `
            <tr>
                <td><strong style="color:#1A1A2E;">#${o.id}</strong><div style="font-size:0.75rem; color:#64748B;">${escapeHtml(o.trackingCode || '')}</div></td>
                <td>${escapeHtml(d.firstName || '')} ${escapeHtml(d.lastName || '')}</td>
                <td><a href="https://wa.me/92${(d.phone || '').replace(/^0/, '')}" target="_blank" style="color:#25D366; font-weight:600;"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(d.phone || '')}</a></td>
                <td>${escapeHtml(d.city || '')}</td>
                <td style="font-weight:600;">PKR ${(d.total || 0).toLocaleString()}</td>
                <td><span style="background:#E0E7FF; color:#3730A3; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600;">${(d.paymentMethod || 'COD').toUpperCase()}</span></td>
                <td><span class="badge-status-in">${status}</span></td>
                <td style="text-align:center;">
                    <button class="btn-icon-action btn-view-order" data-id="${o.id}" style="background:#1A1A2E; color:white;"><i class="fa-solid fa-eye"></i> Details</button>
                </td>
            </tr>
        `;
    }).join('');

    ordersTableBody.querySelectorAll('.btn-view-order').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const o = orders.find(item => item.id === id);
            if (o) openOrderModal(o);
        });
    });
}

function openOrderModal(order) {
    const d = order.details || {};
    const body = document.getElementById('order-modal-body');
    if (!body) return;

    body.innerHTML = `
        <div style="font-size: 0.9rem; line-height: 1.6;">
            <p><strong>Order ID:</strong> #${order.id}</p>
            <p><strong>Tracking Reference:</strong> ${order.trackingCode || 'N/A'}</p>
            <p><strong>Customer Name:</strong> ${escapeHtml(d.firstName)} ${escapeHtml(d.lastName)}</p>
            <p><strong>Phone / WhatsApp:</strong> ${escapeHtml(d.phone)}</p>
            <p><strong>Email:</strong> ${escapeHtml(d.email)}</p>
            <p><strong>Shipping Address:</strong> ${escapeHtml(d.address)}, ${escapeHtml(d.city)}, ${escapeHtml(d.state)}</p>
            <p><strong>Payment Method:</strong> ${(d.paymentMethod || 'COD').toUpperCase()}</p>
            <p><strong>Order Total:</strong> PKR ${(d.total || 0).toLocaleString()}</p>
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #E2E8F0;">
                <a href="https://wa.me/92${(d.phone || '').replace(/^0/, '')}?text=Hi%20${encodeURIComponent(d.firstName)},%20your%20HK%20Accessories%20order%20%23${order.id}%20has%20been%20confirmed!" target="_blank" class="btn btn-whatsapp btn-full">
                    <i class="fa-brands fa-whatsapp"></i> Contact Customer on WhatsApp
                </a>
            </div>
        </div>
    `;

    orderModal.classList.add('active');
}

document.getElementById('btn-close-order-modal')?.addEventListener('click', () => {
    orderModal.classList.remove('active');
});

// ==========================================================================
// GENERAL EVENT BINDINGS
// ==========================================================================

function bindEvents() {
    // Tabs Switcher
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // Filter controls
    searchInput.addEventListener('input', applyFilters);
    deptFilter.addEventListener('change', applyFilters);
    stockFilter.addEventListener('change', applyFilters);
    perPageSelect.addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    // Modal Toggles
    document.getElementById('btn-open-add-modal')?.addEventListener('click', openAddModal);
    document.getElementById('btn-close-product-modal')?.addEventListener('click', closeProductModal);
    document.getElementById('btn-cancel-product-modal')?.addEventListener('click', closeProductModal);

    document.getElementById('btn-open-discount-modal')?.addEventListener('click', openDiscountModal);
    document.getElementById('btn-close-discount-modal')?.addEventListener('click', closeDiscountModal);
    document.getElementById('btn-cancel-discount-modal')?.addEventListener('click', closeDiscountModal);

    // Product Form Submit
    productForm?.addEventListener('submit', handleProductFormSubmit);
    discountForm?.addEventListener('submit', handleDiscountFormSubmit);
}

function bindTableActionEvents() {
    const editBtns = tableBody.querySelectorAll('.btn-edit-item');
    editBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            openEditModal(id);
        });
    });

    const deleteBtns = tableBody.querySelectorAll('.btn-delete-item');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id, 10);
            const item = allProducts.find(p => p.id === id);
            if (item && confirm(`Are you sure you want to delete "${item.title}" (#${id})?`)) {
                const res = await deleteProduct(id);
                if (res.success) {
                    await loadProducts();
                } else {
                    alert('Failed to delete product.');
                }
            }
        });
    });
}

function openAddModal() {
    currentEditId = null;
    modalFormTitle.textContent = 'Add New Product';
    productForm.reset();
    document.getElementById('p-id').value = '';
    productModal.classList.add('active');
}

function openEditModal(id) {
    const item = allProducts.find(p => p.id === id);
    if (!item) return;

    currentEditId = id;
    modalFormTitle.textContent = `Edit Product #${id}`;
    
    document.getElementById('p-id').value = item.id;
    document.getElementById('p-title').value = item.title || '';
    document.getElementById('p-department').value = item.department || 'jewelry';
    document.getElementById('p-category').value = item.category || '';
    document.getElementById('p-price').value = item.price || 0;
    document.getElementById('p-regular-price').value = item.regular_price || item.price || 0;
    document.getElementById('p-stock-status').value = item.stock_status || 'instock';
    document.getElementById('p-sku').value = item.sku || '';
    document.getElementById('p-image').value = (item.images && item.images.length > 0) ? item.images[0] : '';
    document.getElementById('p-description').value = item.description || item.short_description || '';
    document.getElementById('p-onsale').checked = Boolean(item.on_sale);

    productModal.classList.add('active');
}

function closeProductModal() {
    productModal.classList.remove('active');
}

function openDiscountModal() {
    discountModal.classList.add('active');
}

function closeDiscountModal() {
    discountModal.classList.remove('active');
}

async function handleProductFormSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('p-title').value.trim();
    const department = document.getElementById('p-department').value;
    const category = document.getElementById('p-category').value.trim();
    const price = parseFloat(document.getElementById('p-price').value);
    const regularPrice = parseFloat(document.getElementById('p-regular-price').value || price);
    const stockStatus = document.getElementById('p-stock-status').value;
    const sku = document.getElementById('p-sku').value.trim();
    const imageUrl = document.getElementById('p-image').value.trim();
    const description = document.getElementById('p-description').value.trim();
    const onSale = document.getElementById('p-onsale').checked;

    const payload = {
        title,
        department,
        category,
        price,
        regular_price: regularPrice,
        stock_status: stockStatus,
        sku,
        images: [imageUrl],
        description,
        short_description: description,
        on_sale: onSale
    };

    const submitBtn = document.getElementById('btn-save-product');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        if (currentEditId) {
            payload.id = currentEditId;
            await updateProduct(payload);
        } else {
            await addProduct(payload);
        }
        closeProductModal();
        await loadProducts();
    } catch(err) {
        alert('Error saving product: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Product';
    }
}

async function handleDiscountFormSubmit(e) {
    e.preventDefault();

    const department = document.getElementById('d-department').value;
    const pct = parseFloat(document.getElementById('d-percent').value);

    if (isNaN(pct) || pct < 0 || pct > 90) {
        alert('Please enter a valid discount percentage (0 - 90%).');
        return;
    }

    try {
        await applyBulkDiscount(pct, department);
        closeDiscountModal();
        await loadProducts();
        alert(`Successfully applied ${pct}% discount!`);
    } catch(err) {
        alert('Error applying discount: ' + err.message);
    }
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
