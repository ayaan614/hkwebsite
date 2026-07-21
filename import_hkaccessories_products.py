import os, json, requests, re, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / 'data'
PRODUCTS_FILE = DATA_DIR / 'products.json'
BACKUP_FILE = DATA_DIR / 'products-mock-backup.json'

API_URL = 'https://hkaccessories.com.pk/wp-json/wc/store/v1/products'
PER_PAGE = 100

def backup():
    """Create a binary backup of the existing products.json, handling any encoding issues gracefully."""
    if PRODUCTS_FILE.exists():
        # Copy file contents as binary to avoid Unicode decode errors
        BACKUP_FILE.write_bytes(PRODUCTS_FILE.read_bytes())
        print(f'Backup created: {BACKUP_FILE}')
    else:
        print('No existing products.json to backup')

def fetch_all_products():
    """Fetch all simple and variable products (type != variation) using pagination."""
    products = []
    page = 1
    while True:
        params = {'page': page, 'per_page': PER_PAGE}
        resp = requests.get(API_URL, params=params)
        if resp.status_code != 200:
            print(f'Error fetching products page {page}: {resp.status_code}', file=sys.stderr)
            break
        page_items = resp.json()
        if not page_items:
            break
        products.extend(page_items)
        print(f'Fetched {len(page_items)} products from page {page}')
        page += 1
    return products

def fetch_all_variations():
    """Fetch all variations using the Store API endpoint."""
    variations = []
    page = 1
    while True:
        params = {'type': 'variation', 'per_page': PER_PAGE, 'page': page}
        resp = requests.get(API_URL, params=params)
        if resp.status_code != 200:
            print(f'Error fetching variations page {page}: {resp.status_code}', file=sys.stderr)
            break
        page_items = resp.json()
        if not page_items:
            break
        variations.extend(page_items)
        print(f'Fetched {len(page_items)} variations from page {page}')
        page += 1
    return variations

def get_parent_id(variation):
    links = variation.get('_links') or {}
    up_links = links.get('up') or []
    if not up_links:
        return None
    href = up_links[0].get('href', '')
    match = re.search(r'/products/(\d+)', href)
    return int(match.group(1)) if match else None

def normalize_money(value, divisor):
    if value in (None, ""):
        return None
    try:
        return int(str(value)) / divisor
    except (ValueError, TypeError):
        return None

def determine_department(categories):
    cats = [c.get('name','').lower() for c in categories]
    if any('diecast' in c or 'car' in c or 'truck' in c or 'scale' in c for c in cats):
        return 'diecast'
    if any('toy' in c or 'figure' in c or 'puzzle' in c or 'board' in c for c in cats):
        return 'toys'
    if any('clothing' in c or 'shirt' in c or 'hoodie' in c or 'wear' in c for c in cats):
        return 'clothing'
    return 'jewelry'

def map_product(wc):
    prices_raw = wc.get('prices') or {}
    minor = int(prices_raw.get('currency_minor_unit') or 0)
    divisor = 10 ** minor
    price = normalize_money(prices_raw.get('price'), divisor)
    regular_price = normalize_money(prices_raw.get('regular_price'), divisor)
    sale_price = normalize_money(prices_raw.get('sale_price'), divisor)

    categories = wc.get('categories') or []
    department = determine_department(categories)
    cat_name = categories[0].get('name') if categories else 'Uncategorized'
    images = [img.get('src') for img in wc.get('images', []) if img.get('src')]
    attributes = {}
    attr_terms_lookup = {}
    for attr in wc.get('attributes') or []:
        name = attr.get('name')
        options = attr.get('options')
        terms = attr.get('terms') or []
        if name:
            if options:
                attributes[name] = ', '.join(options)
            elif terms:
                attributes[name] = ', '.join([t.get('name', '') for t in terms])
            for t in terms:
                attr_terms_lookup[(name.lower(), str(t.get('slug', '')).lower())] = t.get('name')
                attr_terms_lookup[(name.lower(), str(t.get('name', '')).lower())] = t.get('name')

    raw_vars = wc.get('variations') or []
    variations = []
    for v in raw_vars:
        v_prices = v.get('prices') or prices_raw
        v_price = normalize_money(v_prices.get('price'), divisor) if v_prices else price
        v_reg_price = normalize_money(v_prices.get('regular_price'), divisor) if v_prices else regular_price
        
        v_attrs = []
        for a in v.get('attributes') or []:
            aname = a.get('name', '')
            aval = a.get('value', '')
            term_display = attr_terms_lookup.get((aname.lower(), aval.lower()), aval)
            v_attrs.append({'name': aname, 'option': term_display, 'value': aval})
            
        variations.append({
            'id': v.get('id'),
            'attributes': v_attrs,
            'price': v_price if v_price is not None else price,
            'regular_price': v_reg_price if v_reg_price is not None else regular_price,
            'stock_status': 'instock' if v.get('is_in_stock', True) else 'outofstock'
        })

    product = {
        'id': wc.get('id'),
        'title': wc.get('name', ''),
        'slug': wc.get('slug', ''),
        'permalink': wc.get('permalink', ''),
        'sku': wc.get('sku', ''),
        'summary': wc.get('summary', ''),
        'short_description': wc.get('short_description', ''),
        'description': wc.get('description', ''),
        'price': price,
        'regular_price': regular_price,
        'sale_price': sale_price,
        'currency_code': prices_raw.get('currency_code', 'PKR'),
        'currency_symbol': prices_raw.get('currency_symbol', 'Rs.'),
        'currency_minor_unit': minor,
        'price_range': prices_raw.get('price_range'),
        'prices_raw': prices_raw,
        'department': department,
        'category': cat_name,
        'images': images,
        'attributes': attributes,
        'is_in_stock': bool(wc.get('is_in_stock', True)),
        'is_purchasable': bool(wc.get('is_purchasable', True)),
        'low_stock_remaining': wc.get('low_stock_remaining'),
        'stock_quantity': wc.get('stock_quantity') if wc.get('stock_quantity') is not None else None,
        'stock_status': wc.get('stock_status', 'instock'),
        'on_sale': bool(wc.get('on_sale')),
        'has_options': bool(wc.get('has_options')),
        'average_rating': float(wc.get('average_rating') or 0),
        'review_count': int(wc.get('review_count') or 0),
        'add_to_cart': wc.get('add_to_cart') or {},
        'variations': variations
    }
    return product

def main():
    backup()
    raw_products = fetch_all_products()
    products = [map_product(p) for p in raw_products]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    print(f'Saved {len(products)} products (with variations) to {PRODUCTS_FILE}')

if __name__ == '__main__':
    main()
