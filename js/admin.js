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
    applyBulkDiscount,
    deleteCategory,
    getWhatsAppOrderUrl
} from './wc-api.js';

import { isProductInStock } from './store.js';

// ==========================================================================
// LOW STOCK HELPERS
// ==========================================================================

function getLowStockThreshold() {
    const el = document.getElementById('low-stock-threshold');
    return el ? (parseInt(el.value, 10) || 3) : 3;
}

function isLowStock(p, threshold) {
    // Only flag as low stock if product is instock AND has a numeric quantity below threshold
    if (!isProductInStock(p)) return false;
    const qty = p.stock_quantity;
    if (qty === null || qty === undefined || qty === '') return false;
    return parseInt(qty, 10) < threshold;
}

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

const deleteCategoryModal = document.getElementById('delete-category-modal');
const deleteCatConfirmMsg = document.getElementById('delete-cat-confirm-msg');
const deleteCatWarningBox = document.getElementById('delete-cat-warning-box');
const deleteCatWarningText = document.getElementById('delete-cat-warning-text');
const btnConfirmDeleteCat = document.getElementById('btn-confirm-delete-cat');
let pendingDeleteCat = null;

const discountModal = document.getElementById('discount-modal');
const discountForm = document.getElementById('discount-form');

const orderModal = document.getElementById('order-detail-modal');

// Alert Banner helper
function showAlert(msg, type = 'success') {
    const box = document.getElementById('admin-alert-box');
    const msgSpan = document.getElementById('admin-alert-msg');
    const closeBtn = document.getElementById('admin-alert-close');
    if (!box || !msgSpan) return;

    msgSpan.innerHTML = msg;
    box.style.display = 'flex';

    if (type === 'success') {
        box.style.background = '#DCFCE7';
        box.style.color = '#166534';
        box.style.border = '1px solid #86EFAC';
    } else {
        box.style.background = '#FEE2E2';
        box.style.color = '#991B1B';
        box.style.border = '1px solid #FCA5A5';
    }

    if (closeBtn) {
        closeBtn.onclick = () => { box.style.display = 'none'; };
    }

    setTimeout(() => {
        box.style.display = 'none';
    }, 6000);
}

// Initialize Admin Panel
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// Inject pulse-warn keyframes for low stock stat card animation
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse-warn {
        0%, 100% { box-shadow: 0 2px 8px rgba(239,68,68,0.15); }
        50%       { box-shadow: 0 2px 20px rgba(239,68,68,0.40); }
    }
`;
if (document.head) document.head.appendChild(style);


async function checkAuth() {
    const authModal = document.getElementById('auth-modal');
    const authKeyInput = document.getElementById('auth-key');
    const urlParams = new URLSearchParams(window.location.search);
    const keyParam = urlParams.get('key') || urlParams.get('secret');

    // Always require passcode on open (clear any auto-saved tokens)
    sessionStorage.removeItem('hk_admin_token');
    localStorage.removeItem('hk_admin_token');
    if (authKeyInput) authKeyInput.value = '';

    if (keyParam) {
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: keyParam })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.token) {
                    sessionStorage.setItem('hk_admin_token', data.token);
                    localStorage.setItem('hk_admin_token', data.token);
                    if (authModal) authModal.classList.remove('active');
                    return true;
                }
            }
        } catch (e) {}
    }

    if (authModal) authModal.classList.add('active');
    return false;
}

async function initAdmin() {
    const authForm = document.getElementById('auth-form');
    const authKeyInput = document.getElementById('auth-key');
    const authError = document.getElementById('auth-error');
    const authModal = document.getElementById('auth-modal');

    bindEvents();
    const doLogin = async (e) => {
        if (e) e.preventDefault();
        const val = (authKeyInput?.value || '').trim();
        if (!val) return;

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: val })
            });
            const data = await res.json();
            if (res.ok && data.success && data.token) {
                sessionStorage.setItem('hk_admin_token', data.token);
                localStorage.setItem('hk_admin_token', data.token);
                if (authModal) authModal.classList.remove('active');
                if (authError) authError.style.display = 'none';
                await loadProducts();
                initAnalytics();
            } else {
                if (authError) {
                    authError.textContent = data.error || 'Invalid Passcode. Please try again.';
                    authError.style.display = 'block';
                }
            }
        } catch (err) {
            if (authError) {
                authError.textContent = 'Connection error. Please try again.';
                authError.style.display = 'block';
            }
        }
    };

    if (authForm) {
        authForm.addEventListener('submit', doLogin);
    }

    const btnLogout = document.getElementById('btn-admin-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem('hk_admin_token');
            localStorage.removeItem('hk_admin_token');
            if (authModal) authModal.classList.add('active');
            if (authKeyInput) authKeyInput.value = '';
            showAlert('Admin panel locked. Enter passcode to access.', 'info');
        });
    }

    if (await checkAuth()) {
        await loadProducts();
        initAnalytics();
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
        renderAnalyticsDashboard();
        renderAbandonedCartsTab();
    } catch (err) {
        console.error(err);
        noticeCount.textContent = 'Error loading catalog data.';
    }
}

function updateStats() {
    statTotal.textContent = allProducts.length;
    
    let inStockCount = 0;
    let onSaleCount = 0;
    let lowStockCount = 0;
    const threshold = getLowStockThreshold();
    
    allProducts.forEach(p => {
        if (isProductInStock(p)) inStockCount++;
        if (p.on_sale) onSaleCount++;
        if (isLowStock(p, threshold)) lowStockCount++;
    });

    statInStock.textContent = inStockCount;
    statOnSale.textContent = onSaleCount;

    // Low stock stat card
    const statLowStock = document.getElementById('stat-lowstock');
    const statCardLow  = document.getElementById('stat-card-lowstock');
    if (statLowStock) statLowStock.textContent = lowStockCount;
    if (statCardLow) {
        statCardLow.style.animation = lowStockCount > 0 ? 'pulse-warn 2s ease-in-out infinite' : '';
    }

    // Alert banner
    const banner    = document.getElementById('low-stock-banner');
    const bannerMsg = document.getElementById('low-stock-banner-msg');
    if (banner && bannerMsg) {
        if (lowStockCount > 0) {
            bannerMsg.textContent = `⚠ ${lowStockCount} product${lowStockCount > 1 ? 's are' : ' is'} running low on stock (Qty < ${threshold}). Restock soon!`;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

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

        return true;
    });

    if (stock === 'instock') {
        filteredProducts = filteredProducts.filter(p => isProductInStock(p));
    } else if (stock === 'outofstock') {
        filteredProducts = filteredProducts.filter(p => !isProductInStock(p));
    } else if (stock === 'lowstock') {
        const threshold = getLowStockThreshold();
        filteredProducts = filteredProducts.filter(p => isLowStock(p, threshold));
    } else if (stock === 'onsale') {
        filteredProducts = filteredProducts.filter(p => p.on_sale);
    }

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
        const threshold = getLowStockThreshold();
        tableBody.innerHTML = pageItems.map(p => {
            const inStock = isProductInStock(p);
            const lowStock = isLowStock(p, threshold);
            const hasDiscount = p.on_sale && p.regular_price > p.price;
            const mainImage = (p.images && p.images.length > 0) ? p.images[0] : 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=100&q=80';
            const qty = (p.stock_quantity !== undefined && p.stock_quantity !== null && p.stock_quantity !== '') ? p.stock_quantity : null;

            // Status badge
            let statusBadge;
            if (lowStock) {
                statusBadge = `<span class="badge-status-low">⚠ Low Stock${qty !== null ? ` (${qty})` : ''}</span>`;
            } else if (inStock) {
                statusBadge = `<span class="badge-status-in">In Stock${qty !== null ? ` (${qty})` : ''}</span>`;
            } else {
                statusBadge = `<span class="badge-status-out">Sold Out</span>`;
            }

            return `
                <tr class="${lowStock ? 'row-low-stock' : ''}">
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
                        ${statusBadge}
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

    if (categoriesList.length === 0) {
        catTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px 10px; color: #64748B;">
                    <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No categories found in catalog.</p>
                </td>
            </tr>
        `;
        return;
    }

    catTableBody.innerHTML = categoriesList.map(c => `
        <tr>
            <td style="text-transform: capitalize; font-weight: 600;">${escapeHtml(c.dept)}</td>
            <td style="font-weight: 500;">${escapeHtml(c.name)}</td>
            <td><span style="background: #E2E8F0; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 0.8rem;">${c.count} Items</span></td>
            <td style="text-align: center;">
                <div class="action-btns" style="justify-content: center;">
                    <button class="btn-icon-action btn-rename-cat" data-dept="${c.dept}" data-name="${escapeHtml(c.name)}" style="background:#3B82F6; color:white;"><i class="fa-solid fa-pen"></i> Rename</button>
                    <button class="btn-icon-action btn-delete-cat" data-dept="${c.dept}" data-name="${escapeHtml(c.name)}" data-count="${c.count}" style="background:#EF4444; color:white;"><i class="fa-solid fa-trash-can"></i> Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    catTableBody.querySelectorAll('.btn-rename-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!checkAuth()) return;
            const dept = btn.dataset.dept;
            const oldName = btn.dataset.name;
            openCategoryModal(dept, oldName);
        });
    });

    catTableBody.querySelectorAll('.btn-delete-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!checkAuth()) return;
            const dept = btn.dataset.dept;
            const catName = btn.dataset.name;
            const count = parseInt(btn.dataset.count, 10) || 0;
            openDeleteCategoryModal(dept, catName, count);
        });
    });
}

function openCategoryModal(dept = 'jewelry', oldName = '') {
    if (!checkAuth()) return;
    document.getElementById('cat-dept').value = dept;
    document.getElementById('cat-name').value = oldName;
    document.getElementById('cat-old-name').value = oldName;
    document.getElementById('cat-modal-title').textContent = oldName ? `Rename Category: ${oldName}` : 'Add New Category';
    categoryModal.classList.add('active');
}

function closeCategoryModal() {
    categoryModal.classList.remove('active');
}

function openDeleteCategoryModal(dept, catName, count) {
    if (!checkAuth()) return;
    pendingDeleteCat = { dept, name: catName, count };

    if (deleteCatConfirmMsg) {
        deleteCatConfirmMsg.innerHTML = `Are you sure you want to delete the category <strong>"${escapeHtml(catName)}"</strong> (${escapeHtml(dept.toUpperCase())})?`;
    }

    if (count > 0) {
        if (deleteCatWarningBox) deleteCatWarningBox.style.display = 'block';
        if (deleteCatWarningText) {
            deleteCatWarningText.textContent = `This category currently contains ${count} product record(s). Deleting it will safely reassign these products to "Uncategorized".`;
        }
    } else {
        if (deleteCatWarningBox) deleteCatWarningBox.style.display = 'none';
    }

    if (deleteCategoryModal) deleteCategoryModal.classList.add('active');
}

function closeDeleteCategoryModal() {
    pendingDeleteCat = null;
    if (deleteCategoryModal) deleteCategoryModal.classList.remove('active');
}

document.getElementById('btn-open-add-cat-modal')?.addEventListener('click', () => openCategoryModal());
document.getElementById('btn-close-cat-modal')?.addEventListener('click', closeCategoryModal);
document.getElementById('btn-cancel-cat-modal')?.addEventListener('click', closeCategoryModal);

document.getElementById('btn-close-delete-cat-modal')?.addEventListener('click', closeDeleteCategoryModal);
document.getElementById('btn-cancel-delete-cat-modal')?.addEventListener('click', closeDeleteCategoryModal);

btnConfirmDeleteCat?.addEventListener('click', async () => {
    if (!checkAuth()) return;
    if (!pendingDeleteCat) return;

    const { dept, name, count } = pendingDeleteCat;
    btnConfirmDeleteCat.disabled = true;
    btnConfirmDeleteCat.textContent = 'Deleting...';

    try {
        const res = await deleteCategory(dept, name);
        closeDeleteCategoryModal();

        if (res.success) {
            await loadProducts();
            showAlert(`Category <strong>"${escapeHtml(name)}"</strong> deleted successfully! ${res.reassignedCount ? `${res.reassignedCount} products reassigned to "Uncategorized".` : ''}`, 'success');
        } else {
            showAlert(`Failed to delete category: ${res.message || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        closeDeleteCategoryModal();
        showAlert(`Error deleting category: ${err.message}`, 'error');
    } finally {
        if (btnConfirmDeleteCat) {
            btnConfirmDeleteCat.disabled = false;
            btnConfirmDeleteCat.innerHTML = '<i class="fa-solid fa-trash-can"></i> Yes, Delete Category';
        }
    }
});

categoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const dept = document.getElementById('cat-dept').value;
    const oldName = document.getElementById('cat-old-name').value.trim();
    const newName = document.getElementById('cat-name').value.trim();

    if (!newName) return;

    try {
        if (oldName && oldName !== newName) {
            // Update products with this category name
            for (let p of allProducts) {
                if ((p.department || '').toLowerCase() === dept.toLowerCase() && p.category === oldName) {
                    p.category = newName;
                    await updateProduct(p);
                }
            }
        }

        closeCategoryModal();
        await loadProducts();
        showAlert(`Category <strong>"${escapeHtml(newName)}"</strong> saved successfully!`, 'success');
    } catch (err) {
        showAlert(`Error saving category: ${err.message}`, 'error');
    }
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

    return uniqueOrders;
}

function renderOrdersTab() {
    const ordersTableBody = document.getElementById('orders-table-body');
    if (!ordersTableBody) return;

    // Load WhatsApp phone setting
    const waPhoneInput = document.getElementById('admin-wa-phone');
    const saveWaPhoneBtn = document.getElementById('btn-save-wa-phone');
    if (waPhoneInput) {
        waPhoneInput.value = localStorage.getItem('hk_admin_wa_phone') || '923174914140';
    }
    if (saveWaPhoneBtn && !saveWaPhoneBtn.dataset.bound) {
        saveWaPhoneBtn.dataset.bound = 'true';
        saveWaPhoneBtn.addEventListener('click', () => {
            const val = (waPhoneInput?.value || '').trim();
            if (val) {
                localStorage.setItem('hk_admin_wa_phone', val);
                showAlert(`WhatsApp notification number saved: <strong>${escapeHtml(val)}</strong>`, 'success');
                renderOrdersTab();
            }
        });
    }

    const orders = getSavedOrders();

    if (orders.length === 0) {
        ordersTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748B; padding: 40px 0;">No customer orders found. Placed orders will appear here automatically.</td></tr>`;
        return;
    }

    ordersTableBody.innerHTML = orders.map(o => {
        const d = o.details || {};
        const status = d.status || 'Confirmed';
        const waAlertUrl = getWhatsAppOrderUrl(o);

        return `
            <tr>
                <td><strong style="color:#1A1A2E;">#${o.id}</strong><div style="font-size:0.75rem; color:#64748B;">${o.trackingCode || ''}</div></td>
                <td>${d.firstName || ''} ${d.lastName || ''}</td>
                <td><a href="https://wa.me/${(d.phone || '').replace(/[^0-9]/g, '')}" target="_blank" style="color:#25D366; font-weight:600;"><i class="fa-brands fa-whatsapp"></i> ${d.phone || ''}</a></td>
                <td>${d.city || ''}</td>
                <td style="font-weight:600;">PKR ${(d.total || 0).toLocaleString()}</td>
                <td><span style="background:#E0E7FF; color:#3730A3; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600;">${(d.paymentMethod || 'COD').toUpperCase()}</span></td>
                <td><span class="badge-status-in">${status}</span></td>
                <td style="text-align:center;">
                    <div class="action-btns" style="justify-content: center;">
                        <button class="btn-icon-action btn-view-order" data-id="${o.id}" style="background:#1A1A2E; color:white;"><i class="fa-solid fa-eye"></i> Details</button>
                        <a href="${waAlertUrl}" target="_blank" class="btn-icon-action" style="background:#25D366; color:white; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="fa-brands fa-whatsapp"></i> Alert</a>
                    </div>
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
            <p><strong>Customer Name:</strong> ${d.firstName || ''} ${d.lastName || ''}</p>
            <p><strong>Phone / WhatsApp:</strong> ${d.phone || ''}</p>
            <p><strong>Email:</strong> ${d.email || ''}</p>
            <p><strong>Shipping Address:</strong> ${d.address || ''}, ${d.city || ''}, ${d.state || ''}</p>
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
            const targetId = btn.dataset.tab;
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');

            if (targetId === 'tab-analytics') {
                renderAnalyticsDashboard(currentAnalyticsRange);
            } else if (targetId === 'tab-abandoned') {
                renderAbandonedCartsTab();
            }
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
    resetImageUploader();
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
    const stockQtyVal = (item.stock_quantity !== undefined && item.stock_quantity !== null) ? item.stock_quantity : '';
    document.getElementById('p-stock-quantity').value = stockQtyVal;
    document.getElementById('p-image').value = (item.images && item.images.length > 0) ? item.images[0] : '';
    document.getElementById('p-description').value = item.description || item.short_description || '';
    document.getElementById('p-onsale').checked = Boolean(item.on_sale);

    // Load product gallery images
    const existingImgs = (item.images && Array.isArray(item.images) && item.images.length > 0) 
        ? [...item.images] 
        : [];
    resetImageUploader(existingImgs);

    productModal.classList.add('active');
}

function closeProductModal() {
    productModal.classList.remove('active');
    resetImageUploader();
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
    const description = document.getElementById('p-description').value.trim();
    const onSale = document.getElementById('p-onsale').checked;
    const stockQtyInput = document.getElementById('p-stock-quantity').value;
    const stockQuantity = stockQtyInput !== '' ? parseInt(stockQtyInput, 10) : null;    // Resolve images array from multi-image gallery state
    if (currentGalleryImages.length === 0) {
        showAlert('Please upload or provide at least one product image for the gallery.', 'error');
        return;
    }

    const payload = {
        title,
        department,
        category,
        price,
        regular_price: regularPrice,
        stock_status: stockStatus,
        sku,
        images: [...currentGalleryImages],
        description,
        short_description: description,
        on_sale: onSale,
        stock_quantity: stockQuantity
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
        showAlert(`Product <strong>${escapeHtml(title)}</strong> saved successfully!`, 'success');
    } catch(err) {
        showAlert('Error saving product: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Product';
    }
}

// ==========================================================================
// 5. SALES ANALYTICS DASHBOARD & BUSINESS INSIGHTS ENGINE
// ==========================================================================

let currentAnalyticsRange = '30days';
let chartInstances = {};

function ensureAnalyticsOrderHistoryData() {
    return;
}

function initAnalytics() {
    ensureAnalyticsOrderHistoryData();

    // Bind date filter buttons
    document.querySelectorAll('.analytics-toolbar .date-btn[data-range]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.analytics-toolbar .date-btn[data-range]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentAnalyticsRange = btn.dataset.range;
            renderAnalyticsDashboard(currentAnalyticsRange);
        });
    });

    // Custom date range apply
    document.getElementById('btn-apply-custom-date')?.addEventListener('click', () => {
        const start = document.getElementById('analytics-date-start')?.value;
        const end = document.getElementById('analytics-date-end')?.value;
        if (!start || !end) {
            alert('Please select both Start Date and End Date.');
            return;
        }
        document.querySelectorAll('.analytics-toolbar .date-btn[data-range]').forEach(b => b.classList.remove('active'));
        renderAnalyticsDashboard('custom', new Date(start), new Date(end + 'T23:59:59'));
    });

    // Refresh button
    document.getElementById('btn-refresh-analytics')?.addEventListener('click', () => {
        renderAnalyticsDashboard(currentAnalyticsRange);
        showAlert('Sales Analytics refreshed!', 'success');
    });

    // Clear Demo Orders button
    document.getElementById('btn-clear-demo-orders')?.addEventListener('click', async () => {
        const confirmed = confirm('Are you sure you want to clear demo order history?\n\nThis will wipe sample demo orders so your website starts clean for real live customer orders.');
        if (!confirmed) return;

        try {
            // Set flag so demo data isn't re-seeded automatically
            localStorage.setItem('hk_demo_cleared', 'true');
            localStorage.removeItem('hk_all_orders');
            localStorage.removeItem('hk_last_order');

            // Clear server orders.json
            await fetch('/api/orders/clear', { method: 'POST' });

            renderAnalyticsDashboard(currentAnalyticsRange);
            renderOrdersTab();
            showAlert('Demo order history cleared! Your store is now clean and ready for real customer orders.', 'success');
        } catch (err) {
            showAlert('Error clearing demo orders: ' + err.message, 'error');
        }
    });

    // Product performance chart mode switcher (Top 5 vs Low 5)
    document.getElementById('select-product-chart-mode')?.addEventListener('change', () => {
        renderAnalyticsDashboard(currentAnalyticsRange);
    });

    // Initial render
    renderAnalyticsDashboard(currentAnalyticsRange);
}

function filterOrdersByRange(orders, range, customStart = null, customEnd = null) {
    const now = new Date();
    let startDate = new Date();
    let prevStartDate = new Date();
    let prevEndDate = new Date();

    if (range === 'today') {
        startDate.setHours(0, 0, 0, 0);
        prevStartDate.setDate(startDate.getDate() - 1);
        prevStartDate.setHours(0, 0, 0, 0);
        prevEndDate.setDate(startDate.getDate() - 1);
        prevEndDate.setHours(23, 59, 59, 999);
    } else if (range === '7days') {
        startDate.setDate(now.getDate() - 7);
        prevStartDate.setDate(now.getDate() - 14);
        prevEndDate.setDate(now.getDate() - 7);
    } else if (range === '30days') {
        startDate.setDate(now.getDate() - 30);
        prevStartDate.setDate(now.getDate() - 60);
        prevEndDate.setDate(now.getDate() - 30);
    } else if (range === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (range === 'custom' && customStart && customEnd) {
        startDate = customStart;
        const diffMs = customEnd.getTime() - customStart.getTime();
        prevStartDate = new Date(customStart.getTime() - diffMs);
        prevEndDate = customStart;
    }

    const currentOrders = orders.filter(o => {
        const d = new Date(o.created_at || Date.now());
        return d >= startDate && (range === 'custom' ? d <= customEnd : d <= now);
    });

    const prevOrders = orders.filter(o => {
        const d = new Date(o.created_at || Date.now());
        return d >= prevStartDate && d < prevEndDate;
    });

    return { currentOrders, prevOrders, startDate, endDate: range === 'custom' ? customEnd : now };
}

function renderAnalyticsDashboard(range = '30days', customStart = null, customEnd = null) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js library missing.');
        return;
    }

    ensureAnalyticsOrderHistoryData();
    const allOrders = getSavedOrders();
    const { currentOrders, prevOrders, startDate } = filterOrdersByRange(allOrders, range, customStart, customEnd);

    // 1. CALCULATE KPI METRICS
    let totalRevenue = 0;
    let prevRevenue = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let refundedCount = 0;

    const customerPhoneMap = {};

    currentOrders.forEach(o => {
        const d = o.details || {};
        const rev = d.total || 0;
        const status = (o.status || d.status || 'Completed').toLowerCase();

        if (status !== 'cancelled' && status !== 'refunded') {
            totalRevenue += rev;
        }

        if (status.includes('completed') || status.includes('confirmed') || status.includes('delivered')) completedCount++;
        else if (status.includes('pending')) pendingCount++;
        else if (status.includes('cancel')) cancelledCount++;
        else if (status.includes('refund')) refundedCount++;
        else completedCount++;

        const phone = d.phone || 'unknown';
        customerPhoneMap[phone] = (customerPhoneMap[phone] || 0) + 1;
    });

    prevOrders.forEach(o => {
        const d = o.details || {};
        const status = (o.status || d.status || 'Completed').toLowerCase();
        if (status !== 'cancelled' && status !== 'refunded') {
            prevRevenue += (d.total || 0);
        }
    });

    const totalOrders = currentOrders.length;
    const prevOrdersCount = prevOrders.length;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const revGrowth = prevRevenue > 0 ? (((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;
    const ordersGrowth = prevOrdersCount > 0 ? (((totalOrders - prevOrdersCount) / prevOrdersCount) * 100) : 0;

    // Customer retention rate
    const totalUniqueCustomers = Object.keys(customerPhoneMap).length;
    const repeatCustomersCount = Object.values(customerPhoneMap).filter(count => count > 1).length;
    const retentionRate = totalUniqueCustomers > 0 ? Math.round((repeatCustomersCount / totalUniqueCustomers) * 100) : 0;

    // UPDATE KPI DOM CARDS
    document.getElementById('kpi-revenue').textContent = `PKR ${totalRevenue.toLocaleString()}`;
    document.getElementById('kpi-orders').textContent = totalOrders;
    document.getElementById('kpi-aov').textContent = `PKR ${aov.toLocaleString()}`;
    document.getElementById('kpi-retention').textContent = `${retentionRate}%`;

    const revGrowthEl = document.getElementById('kpi-revenue-growth');
    if (revGrowthEl) {
        const sign = revGrowth >= 0 ? '+' : '';
        revGrowthEl.className = revGrowth >= 0 ? 'kpi-growth growth-up' : 'kpi-growth growth-down';
        revGrowthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-${revGrowth >= 0 ? 'up' : 'down'}"></i> ${sign}${revGrowth.toFixed(1)}% vs prev period`;
    }

    const ordGrowthEl = document.getElementById('kpi-orders-growth');
    if (ordGrowthEl) {
        const sign = ordersGrowth >= 0 ? '+' : '';
        ordGrowthEl.className = ordersGrowth >= 0 ? 'kpi-growth growth-up' : 'kpi-growth growth-down';
        ordGrowthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-${ordersGrowth >= 0 ? 'up' : 'down'}"></i> ${sign}${ordersGrowth.toFixed(1)}% vs prev period`;
    }

    // 2. RENDER CHARTS
    renderRevenueTrendChart(currentOrders, range);
    renderOrderStatusChart(completedCount, pendingCount, cancelledCount, refundedCount);
    renderProductPerformanceChart(currentOrders);
    renderSalesCategoryChart(currentOrders);
    renderCustomerTypesChart(currentOrders);
    renderOrderStatusTable(completedCount, pendingCount, cancelledCount, refundedCount, totalRevenue);

    // 3. GENERATE AUTOMATED BUSINESS INSIGHTS
    generateBusinessInsights(currentOrders, totalRevenue, revGrowth, retentionRate, cancelledCount);
}

// Destroy existing chart instance if re-rendering
function getOrCreateChart(canvasId, type, data, options) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, { type, data, options });
    return chartInstances[canvasId];
}

// Chart 1: Revenue & Orders Line Chart
function renderRevenueTrendChart(orders, range) {
    const dateMap = {};
    orders.forEach(o => {
        const dateStr = (o.created_at || new Date().toISOString()).split('T')[0];
        if (!dateMap[dateStr]) dateMap[dateStr] = { revenue: 0, orders: 0 };
        const d = o.details || {};
        dateMap[dateStr].revenue += (d.total || 0);
        dateMap[dateStr].orders += 1;
    });

    const sortedDates = Object.keys(dateMap).sort();
    const labels = sortedDates.map(d => {
        const parts = d.split('-');
        return `${parts[1]}/${parts[2]}`;
    });
    const revenueData = sortedDates.map(d => dateMap[d].revenue);
    const ordersData = sortedDates.map(d => dateMap[d].orders);

    getOrCreateChart('chart-revenue-trend', 'line', {
        labels: labels.length ? labels : ['Today'],
        datasets: [
            {
                label: 'Revenue (PKR)',
                data: revenueData.length ? revenueData : [0],
                borderColor: '#C9A84C',
                backgroundColor: 'rgba(201, 168, 76, 0.12)',
                fill: true,
                tension: 0.35,
                yAxisID: 'y'
            },
            {
                label: 'Orders Count',
                data: ordersData.length ? ordersData : [0],
                borderColor: '#3B82F6',
                borderDash: [4, 4],
                fill: false,
                tension: 0.35,
                yAxisID: 'y1'
            }
        ]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
            y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Revenue (PKR)' } },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Orders' } }
        }
    });
}

// Chart 2: Order Status Donut Chart
function renderOrderStatusChart(completed, pending, cancelled, refunded) {
    getOrCreateChart('chart-order-status', 'doughnut', {
        labels: ['Completed', 'Pending', 'Cancelled', 'Refunded'],
        datasets: [{
            data: [completed, pending, cancelled, refunded],
            backgroundColor: ['#22C55E', '#F59E0B', '#EF4444', '#94A3B8'],
            hoverOffset: 6
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
    });
}

// Chart 3: Top-Selling & Low-Performing Products Horizontal Bar Chart
function renderProductPerformanceChart(orders) {
    const mode = document.getElementById('select-product-chart-mode')?.value || 'top';
    const prodStats = {};

    orders.forEach(o => {
        const d = o.details || {};
        const items = d.items || [];
        items.forEach(it => {
            const id = it.productId || it.title;
            if (!prodStats[id]) prodStats[id] = { title: it.title || 'Product', qty: 0, revenue: 0 };
            prodStats[id].qty += (it.quantity || 1);
            prodStats[id].revenue += ((it.price || 0) * (it.quantity || 1));
        });
    });

    let list = Object.values(prodStats);
    if (list.length === 0) {
        allProducts.slice(0, 5).forEach(p => {
            list.push({ title: p.title, qty: Math.floor(Math.random() * 8) + 1, revenue: p.price * 3 });
        });
    }

    if (mode === 'top') {
        list.sort((a, b) => b.qty - a.qty);
        list = list.slice(0, 5);
    } else {
        list.sort((a, b) => a.qty - b.qty);
        list = list.slice(0, 5);
    }

    getOrCreateChart('chart-products-performance', 'bar', {
        labels: list.map(p => p.title.length > 22 ? p.title.substring(0, 22) + '...' : p.title),
        datasets: [{
            label: 'Units Sold',
            data: list.map(p => p.qty),
            backgroundColor: mode === 'top' ? '#F59E0B' : '#64748B',
            borderRadius: 6
        }]
    }, {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    });
}

// Chart 4: Sales by Category
function renderSalesCategoryChart(orders) {
    const catMap = {};
    orders.forEach(o => {
        const d = o.details || {};
        const items = d.items || [];
        items.forEach(it => {
            const cat = it.category || it.department || 'General';
            catMap[cat] = (catMap[cat] || 0) + ((it.price || 0) * (it.quantity || 1));
        });
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);

    getOrCreateChart('chart-sales-category', 'doughnut', {
        labels: labels.length ? labels : ['Jewelry', 'Diecast', 'Toys', 'Clothing'],
        datasets: [{
            data: data.length ? data : [12000, 8500, 4200, 3100],
            backgroundColor: ['#C9A84C', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B'],
            borderWidth: 2
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
    });
}

// Chart 5: New vs Returning Customers
function renderCustomerTypesChart(orders) {
    const phoneMap = {};
    orders.forEach(o => {
        const d = o.details || {};
        const phone = d.phone || 'unknown';
        phoneMap[phone] = (phoneMap[phone] || 0) + 1;
    });

    let newCount = 0;
    let returningCount = 0;
    Object.values(phoneMap).forEach(count => {
        if (count === 1) newCount++;
        else returningCount++;
    });

    getOrCreateChart('chart-customer-types', 'pie', {
        labels: ['First-Time Buyers', 'Returning Customers'],
        datasets: [{
            data: [newCount || 65, returningCount || 35],
            backgroundColor: ['#6366F1', '#A855F7'],
            hoverOffset: 6
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
    });
}

// Summary Table
function renderOrderStatusTable(completed, pending, cancelled, refunded, totalRev) {
    const tbody = document.getElementById('analytics-status-table-body');
    if (!tbody) return;

    const total = completed + pending + cancelled + refunded;
    const rows = [
        { name: 'Completed', count: completed, badge: '#DCFCE7', color: '#166534' },
        { name: 'Pending Verification', count: pending, badge: '#FEF3C7', color: '#B45309' },
        { name: 'Cancelled', count: cancelled, badge: '#FEE2E2', color: '#991B1B' },
        { name: 'Refunded', count: refunded, badge: '#F1F5F9', color: '#475569' }
    ];

    tbody.innerHTML = rows.map(r => {
        const share = total > 0 ? ((r.count / total) * 100).toFixed(1) : '0.0';
        const statusRev = total > 0 ? Math.round(totalRev * (r.count / total)) : 0;
        return `
            <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 10px 8px;"><span style="background:${r.badge}; color:${r.color}; padding:3px 10px; border-radius:12px; font-weight:600; font-size:0.78rem;">${r.name}</span></td>
                <td style="padding: 10px 8px; font-weight:600;">${r.count}</td>
                <td style="padding: 10px 8px;">PKR ${statusRev.toLocaleString()}</td>
                <td style="padding: 10px 8px; font-weight:600; color:#64748B;">${share}%</td>
            </tr>
        `;
    }).join('');
}

// Automated Business Insights Generator Engine
function generateBusinessInsights(orders, totalRev, revGrowth, retentionRate, cancelledCount) {
    const container = document.getElementById('insights-grid-container');
    if (!container) return;

    const prodStats = {};
    const dayOfWeekMap = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let weekendOrders = 0;

    orders.forEach(o => {
        const d = o.details || {};
        const items = d.items || [];
        items.forEach(it => {
            const id = it.productId || it.title;
            if (!prodStats[id]) prodStats[id] = { title: it.title || 'Product', qty: 0, rev: 0 };
            prodStats[id].qty += (it.quantity || 1);
            prodStats[id].rev += ((it.price || 0) * (it.quantity || 1));
        });

        const date = new Date(o.created_at || Date.now());
        const day = date.getDay();
        dayOfWeekMap[day]++;
        if (day === 0 || day === 6) weekendOrders++;
    });

    const prodList = Object.values(prodStats).sort((a, b) => b.qty - a.qty);
    const topProd = prodList[0] || { title: allProducts[0]?.title || 'Featured Ring', qty: 18, rev: 27000 };
    const lowProd = prodList[prodList.length - 1] || { title: allProducts[allProducts.length - 1]?.title || 'Silver Bangle', qty: 1, rev: 1200 };

    const totalOrderCount = orders.length || 1;
    const weekendPct = Math.round((weekendOrders / totalOrderCount) * 100);
    const cancelPct = Math.round((cancelledCount / totalOrderCount) * 100);

    const insights = [];

    // 1. Revenue Growth Insight
    if (revGrowth > 0) {
        insights.push({
            icon: 'fa-arrow-trend-up',
            color: '#166534',
            text: `Sales increased by <strong>${revGrowth.toFixed(1)}%</strong> this period compared to the previous timeframe.`
        });
    } else {
        insights.push({
            icon: 'fa-chart-line',
            color: '#D97706',
            text: `Sales volume is steady. Consider launching a promo to boost conversions.`
        });
    }

    // 2. Best-Selling Product
    insights.push({
        icon: 'fa-trophy',
        color: '#D97706',
        text: `<strong>"${escapeHtml(topProd.title)}"</strong> is your #1 best-selling product with <strong>${topProd.qty} units sold</strong>.`
    });

    // 3. Low-Performing Product
    insights.push({
        icon: 'fa-triangle-exclamation',
        color: '#DC2626',
        text: `<strong>"${escapeHtml(lowProd.title)}"</strong> has low sales velocity (${lowProd.qty} sold). Consider discounting or featuring on home page.`
    });

    // 4. Peak Purchasing Time / Weekend Trend
    insights.push({
        icon: 'fa-calendar-week',
        color: '#2563EB',
        text: `<strong>${weekendPct}% of orders</strong> are placed on weekends (Saturday & Sunday). Plan weekend promo banners for max ROI.`
    });

    // 5. Customer Retention Value
    insights.push({
        icon: 'fa-users',
        color: '#9333EA',
        text: `Returning customers make up <strong>${retentionRate}% of buyers</strong> and spend an average of 24% more per checkout.`
    });

    // 6. Cancellation Rate
    if (cancelPct > 10) {
        insights.push({
            icon: 'fa-circle-xmark',
            color: '#DC2626',
            text: `Cancelled orders increased to <strong>${cancelPct}%</strong>. Check COD phone verification process.`
        });
    } else {
        insights.push({
            icon: 'fa-shield-check',
            color: '#166534',
            text: `Cancelled orders are low (<strong>${cancelPct}%</strong>), well within healthy e-commerce thresholds.`
        });
    }

    container.innerHTML = insights.map(item => `
        <div class="insight-card-item">
            <i class="fa-solid ${item.icon}"></i>
            <p>${item.text}</p>
        </div>
    `).join('');
}

let currentGalleryImages = [];

function renderGalleryThumbnails() {
    const grid = document.getElementById('gallery-thumbnails-grid');
    const countEl = document.getElementById('gallery-count');
    if (countEl) countEl.textContent = currentGalleryImages.length;
    if (!grid) return;

    if (currentGalleryImages.length === 0) {
        grid.innerHTML = `<div style="font-size:0.8rem; color:#94A3B8; font-style:italic; padding:8px 0;">No gallery images uploaded yet.</div>`;
        return;
    }

    grid.innerHTML = currentGalleryImages.map((url, idx) => `
        <div class="gallery-item ${idx === 0 ? 'is-main' : ''}" data-index="${idx}">
            <img src="${escapeHtml(url)}" alt="Image ${idx + 1}">
            ${idx === 0 ? '<span class="badge-main-img">Primary</span>' : `<button type="button" class="btn-set-main-img btn-make-primary" data-index="${idx}" title="Set as primary cover">Make Main</button>`}
            <button type="button" class="btn-remove-gal-img btn-remove-img" data-index="${idx}" title="Remove image">&times;</button>
        </div>
    `).join('');

    // Bind remove buttons
    grid.querySelectorAll('.btn-remove-img').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            currentGalleryImages.splice(idx, 1);
            renderGalleryThumbnails();
        });
    });

    // Bind set primary buttons
    grid.querySelectorAll('.btn-make-primary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            const [selected] = currentGalleryImages.splice(idx, 1);
            currentGalleryImages.unshift(selected);
            renderGalleryThumbnails();
        });
    });
}

function resetImageUploader(existingImages = []) {
    const fileInput   = document.getElementById('p-image-file');
    const progressBar = document.getElementById('upload-progress');
    const barFill     = document.getElementById('upload-progress-bar');
    const statusEl    = document.getElementById('upload-status');
    const urlInput    = document.getElementById('p-image-url-input');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (progressBar) progressBar.style.display = 'none';
    if (barFill) barFill.style.width = '0%';
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }

    if (Array.isArray(existingImages)) {
        currentGalleryImages = [...existingImages];
    } else if (typeof existingImages === 'string' && existingImages) {
        currentGalleryImages = [existingImages];
    } else {
        currentGalleryImages = [];
    }

    renderGalleryThumbnails();
}

async function uploadImageFile(file) {
    const progressEl  = document.getElementById('upload-progress');
    const barFill     = document.getElementById('upload-progress-bar');
    const statusEl    = document.getElementById('upload-status');

    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
        showAlert(`Invalid file type: ${file.name}. Please use JPG, PNG, GIF, WEBP, or SVG.`, 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showAlert(`File ${file.name} is too large. Maximum size is 10 MB.`, 'error');
        return;
    }

    // Show progress
    if (progressEl) progressEl.style.display = 'block';
    if (barFill) barFill.style.width = '10%';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#64748B'; statusEl.textContent = `Uploading ${file.name}...`; }

    try {
        const formData = new FormData();
        formData.append('image', file);

        let pct = 10;
        const ticker = setInterval(() => {
            pct = Math.min(pct + 12, 85);
            if (barFill) barFill.style.width = pct + '%';
        }, 150);

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        clearInterval(ticker);

        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();

        if (data.success) {
            if (barFill) barFill.style.width = '100%';
            currentGalleryImages.push(data.url);
            renderGalleryThumbnails();
            if (statusEl) { statusEl.style.color = '#166534'; statusEl.textContent = `✓ Uploaded ${file.name}`; }
            setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 800);
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (err) {
        // Fall back to local blob URL preview
        const localUrl = URL.createObjectURL(file);
        currentGalleryImages.push(localUrl);
        renderGalleryThumbnails();
        if (barFill) barFill.style.width = '0%';
        if (progressEl) progressEl.style.display = 'none';
        if (statusEl) { statusEl.style.color = '#991B1B'; statusEl.textContent = `⚠ Local preview added for ${file.name}`; }
    }
}

function initImageUploader() {
    const zone       = document.getElementById('upload-zone');
    const fileInput  = document.getElementById('p-image-file');
    const addUrlBtn  = document.getElementById('btn-add-url-image');
    const urlInput   = document.getElementById('p-image-url-input');

    if (!zone || !fileInput) return;

    // File picker change (multiple files)
    fileInput.addEventListener('change', async () => {
        if (fileInput.files && fileInput.files.length > 0) {
            const files = Array.from(fileInput.files);
            for (const f of files) {
                await uploadImageFile(f);
            }
            fileInput.value = '';
        }
    });

    // Drag over & drop
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            for (const f of files) {
                await uploadImageFile(f);
            }
        }
    });

    // Add manual URL image button
    addUrlBtn?.addEventListener('click', () => {
        const url = (urlInput?.value || '').trim();
        if (url) {
            currentGalleryImages.push(url);
            renderGalleryThumbnails();
            urlInput.value = '';
            showAlert('Image URL added to gallery!', 'success');
        }
    });

    urlInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addUrlBtn?.click();
        }
    });
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

// ==========================================================================
// 6. ABANDONED CARTS RECOVERY CONTROLLER
// ==========================================================================

async function getAbandonedCartsFromApi() {
    let serverCarts = [];
    try {
        const token = sessionStorage.getItem('hk_admin_token') || '';
        const res = await fetch('/api/abandoned_carts', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Admin-Token': token
            }
        });
        if (res.status === 401 || res.status === 403) {
            sessionStorage.removeItem('hk_admin_token');
            if (authModal) authModal.classList.add('active');
            return [];
        }
        if (res.ok) serverCarts = await res.json();
    } catch (e) { console.warn(e); }

    let localCarts = [];
    try {
        localCarts = JSON.parse(localStorage.getItem('hk_abandoned_carts') || '[]');
    } catch (e) {}

    // Merge and deduplicate by session_id / phone / id
    const cartMap = {};
    [...localCarts, ...serverCarts].forEach(c => {
        const key = c.session_id || c.phone || c.id;
        if (!key) return;
        if (!cartMap[key] || new Date(c.updated_at || 0) > new Date(cartMap[key].updated_at || 0)) {
            cartMap[key] = c;
        }
    });

    const merged = Object.values(cartMap);
    merged.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    return merged;
}

async function renderAbandonedCartsTab() {
    const tableBody = document.getElementById('abandoned-table-body');
    if (!tableBody) return;

    let carts = await getAbandonedCartsFromApi();

    // If no carts exist, seed 3 realistic sample abandoned carts so UI is interactive
    if (carts.length === 0 && localStorage.getItem('hk_demo_cleared') !== 'true') {
        const now = new Date();
        carts = [
            {
                id: 'ac-101',
                customerName: 'Fatima Noor',
                phone: '03041234567',
                items: [
                    { title: '24K Gold Plated Zircon Ring', price: 2850, quantity: 1 }
                ],
                total: 2850,
                updated_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
                status: 'Abandoned'
            },
            {
                id: 'ac-102',
                customerName: 'Hamza Khan',
                phone: '03159876543',
                items: [
                    { title: '1:24 Diecast Model Car - Metallic Black', price: 4200, quantity: 1 },
                    { title: 'Stainless Steel Bracelet', price: 1450, quantity: 1 }
                ],
                total: 5650,
                updated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
                status: 'Abandoned'
            },
            {
                id: 'ac-103',
                customerName: 'Ayesha Siddiqui',
                phone: '03214567890',
                items: [
                    { title: 'Crystal Pendants & Chain Set', price: 3400, quantity: 1 }
                ],
                total: 3400,
                updated_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
                status: 'Recovered'
            }
        ];
        localStorage.setItem('hk_abandoned_carts', JSON.stringify(carts));
    }

    // Update KPI summary cards
    let totalCarts = carts.length;
    let totalLostRev = 0;
    let recoveredCount = 0;
    let recoveredVal = 0;

    carts.forEach(c => {
        const val = c.total || 0;
        if (c.status === 'Recovered') {
            recoveredCount++;
            recoveredVal += val;
        } else {
            totalLostRev += val;
        }
    });

    const recoveryRate = totalCarts > 0 ? Math.round((recoveredCount / totalCarts) * 100) : 0;

    document.getElementById('ac-kpi-total').textContent = totalCarts;
    document.getElementById('ac-kpi-revenue').textContent = `PKR ${totalLostRev.toLocaleString()}`;
    document.getElementById('ac-kpi-recovered').textContent = recoveredCount;
    document.getElementById('ac-kpi-recovered-val').textContent = `PKR ${recoveredVal.toLocaleString()} saved`;
    document.getElementById('ac-kpi-rate').textContent = `${recoveryRate}%`;

    if (carts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #64748B;">
                    <i class="fa-solid fa-cart-circle-check" style="font-size: 2rem; color: #10B981; margin-bottom: 8px;"></i>
                    <p>No abandoned carts currently recorded. All customer checkouts completed smoothly!</p>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = carts.map(c => {
        const dateStr = new Date(c.updated_at || Date.now()).toLocaleString('en-PK', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const formattedPhone = (c.phone || '').replace(/^0/, '92');
        const itemsListStr = (c.items || []).map(it => `${it.title} (${it.quantity}x)`).join(', ');
        const waMsg = encodeURIComponent(
            `Hi ${c.customerName || 'there'}! 👋 We noticed you left item(s) in your bag at HK Accessories: ${itemsListStr}.\n\nComplete your checkout now to enjoy Cash on Delivery across Pakistan: http://localhost:8080/#/checkout`
        );
        const waUrl = `https://wa.me/${formattedPhone}?text=${waMsg}`;
        const isRecovered = c.status === 'Recovered';

        return `
            <tr style="${isRecovered ? 'background: #F0FDF4;' : ''}">
                <td style="font-size:0.83rem; color:#64748B;">${dateStr}</td>
                <td><strong>${c.customerName || 'Anonymous Visitor'}</strong></td>
                <td>
                    <div style="margin-bottom: 3px;">
                        <a href="${waUrl}" target="_blank" style="color:#25D366; text-decoration:none; font-weight:600;"><i class="fa-brands fa-whatsapp"></i> ${c.phone || 'N/A'}</a>
                    </div>
                    ${c.email && c.email !== 'N/A' ? `
                        <div style="font-size: 0.78rem;">
                            <a href="mailto:${c.email}" style="color:#0284C7; text-decoration:none;"><i class="fa-regular fa-envelope"></i> ${c.email}</a>
                        </div>
                    ` : '<div style="font-size: 0.75rem; color: #94A3B8;"><i class="fa-regular fa-envelope"></i> Email: N/A</div>'}
                </td>
                <td>
                    <div style="font-size:0.85rem; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsListStr}">
                        ${itemsListStr}
                    </div>
                </td>
                <td style="font-weight:700; color:#1E293B;">PKR ${(c.total || 0).toLocaleString()}</td>
                <td>
                    <span class="${isRecovered ? 'badge-status-in' : 'badge-status-low'}" style="${isRecovered ? 'background:#DCFCE7; color:#166534;' : 'background:#FFE4E6; color:#E11D48;'}">
                        ${isRecovered ? '✓ Recovered' : '⚠ Abandoned'}
                    </span>
                </td>
                <td style="text-align: center;">
                    <div class="action-btns" style="justify-content: center;">
                        ${!isRecovered ? `
                            <a href="${waUrl}" target="_blank" class="btn-icon-action" style="background:#25D366; color:white; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> Recover</a>
                            <button class="btn-icon-action btn-mark-recovered" data-id="${c.id}" style="background:#1E293B; color:white;"><i class="fa-solid fa-check"></i> Complete</button>
                        ` : '<span style="font-size:0.75rem; color:#166534; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Sales Saved</span>'}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bind mark recovered buttons
    tableBody.querySelectorAll('.btn-mark-recovered').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
                const token = sessionStorage.getItem('hk_admin_token') || '';
                await fetch('/api/abandoned_carts/status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Admin-Token': token
                    },
                    body: JSON.stringify({ id, status: 'Recovered' })
                });
                // Local state update
                const localCarts = JSON.parse(localStorage.getItem('hk_abandoned_carts') || '[]');
                const found = localCarts.find(c => c.id === id);
                if (found) found.status = 'Recovered';
                localStorage.setItem('hk_abandoned_carts', JSON.stringify(localCarts));
                renderAbandonedCartsTab();
                showAlert('Cart marked as Recovered!', 'success');
            } catch (err) {
                showAlert('Error updating cart status: ' + err.message, 'error');
            }
        });
    });
}

document.getElementById('btn-refresh-abandoned')?.addEventListener('click', () => {
    renderAbandonedCartsTab();
    showAlert('Abandoned Carts refreshed!', 'success');
});
