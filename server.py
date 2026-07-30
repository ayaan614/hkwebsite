import http.server
import socketserver
import json
import os
import sys
import urllib.parse
import uuid
import re
import html
import shutil
import datetime

PORT = 8080
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
PRODUCTS_FILE = os.path.join(PROJECT_DIR, 'data', 'products.json')
ORDERS_FILE = os.path.join(PROJECT_DIR, 'data', 'orders.json')
UPLOADS_DIR = os.path.join(PROJECT_DIR, 'uploads')

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
FORBIDDEN_INNER_EXTENSIONS = {'.php', '.html', '.htm', '.js', '.exe', '.bat', '.sh', '.py', '.pl', '.cgi', '.asp', '.aspx', '.cmd', '.vbs', '.phtml', '.php3', '.php4', '.php5', '.phps', '.svg'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

os.makedirs(UPLOADS_DIR, exist_ok=True)

def has_forbidden_inner_extension(filename):
    clean_fn = os.path.basename(filename)
    parts = clean_fn.split('.')
    if len(parts) > 2:
        for part in parts[1:-1]:
            if f".{part.lower()}" in FORBIDDEN_INNER_EXTENSIONS:
                return True, f".{part.lower()}"
    return False, ""

def validate_image_magic_bytes(file_data):
    if not file_data or len(file_data) < 8:
        return False, "File data too small"
    
    # JPEG magic bytes: FF D8 FF
    if file_data.startswith(b'\xff\xd8\xff'):
        return True, '.jpg'
    
    # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if file_data.startswith(b'\x89PNG\r\n\x1a\n'):
        return True, '.png'
    
    # GIF magic bytes: GIF87a or GIF89a
    if file_data.startswith(b'GIF87a') or file_data.startswith(b'GIF89a'):
        return True, '.gif'
    
    # WEBP magic bytes: RIFF .... WEBP
    if file_data.startswith(b'RIFF') and file_data[8:12] == b'WEBP':
        return True, '.webp'
    
    return False, "Invalid image magic header. Only genuine JPG, PNG, GIF, and WEBP image binary structures are allowed."

def sanitize_text(text):
    if not isinstance(text, str):
        return text
    # Lossless HTML entity escaping: converts <, >, &, ", ' into &lt;, &gt;, &amp;, &quot;, &#x27;
    return html.escape(text.strip(), quote=True)

def sanitize_object(obj):
    if isinstance(obj, str):
        return sanitize_text(obj)
    elif isinstance(obj, dict):
        return {sanitize_text(k): sanitize_object(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_object(item) for item in obj]
    return obj

def load_products():
    if not os.path.exists(PRODUCTS_FILE):
        return []
    try:
        with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {PRODUCTS_FILE}: {e}")
        return []

def recalculate_order_totals(order_payload, require_catalog_match=True):
    if not isinstance(order_payload, dict):
        return False, "Invalid order payload format", order_payload

    products = load_products()
    catalog_id_map = {}
    catalog_title_map = {}
    for p in products:
        p_id = p.get('id')
        p_title = (p.get('title') or '').strip().lower()
        if p_id is not None:
            catalog_id_map[str(p_id)] = p
        if p_title:
            catalog_title_map[p_title] = p

    details = order_payload.get('details')
    if not isinstance(details, dict):
        details = order_payload

    items = details.get('items', [])
    if not isinstance(items, list):
        items = []

    if require_catalog_match and len(items) == 0:
        return False, "Order must contain at least one valid item", order_payload

    calculated_order_total = 0

    for item in items:
        if not isinstance(item, dict):
            continue

        p_id = item.get('productId') or item.get('id')
        p_title = (item.get('title') or '').strip().lower()
        
        matched_catalog_item = catalog_id_map.get(str(p_id))
        if not matched_catalog_item and p_title:
            matched_catalog_item = catalog_title_map.get(p_title)

        if not matched_catalog_item:
            if require_catalog_match:
                return False, f"Order rejected: Product ID '{p_id}' ({item.get('title', 'Unknown')}) does not exist in store catalog", order_payload
            else:
                real_price = max(0.0, float(item.get('price', 0)))
        else:
            real_price = float(matched_catalog_item.get('price', 0))
            item['title'] = matched_catalog_item.get('title', item.get('title', 'Product'))

        try:
            qty = int(item.get('quantity', 1))
        except (ValueError, TypeError):
            qty = 1

        if qty <= 0:
            qty = 1
        elif qty > 100:
            qty = 100

        item['quantity'] = qty
        item['price'] = real_price
        item_total = real_price * qty
        calculated_order_total += item_total

    details['total'] = calculated_order_total
    if 'total' in order_payload and isinstance(order_payload['total'], (int, float)):
        order_payload['total'] = calculated_order_total

    return True, None, order_payload

BACKUPS_DIR = os.path.join(PROJECT_DIR, 'data', 'backups')
MAX_BACKUPS_PER_FILE = 50

def create_file_backup(file_path):
    if not os.path.exists(file_path):
        return
    try:
        os.makedirs(BACKUPS_DIR, exist_ok=True)
        filename = os.path.basename(file_path)
        name_part, ext = os.path.splitext(filename)
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S_%f")[:23]
        backup_filename = f"{name_part}_{timestamp}{ext}"
        backup_path = os.path.join(BACKUPS_DIR, backup_filename)

        shutil.copy2(file_path, backup_path)
        print(f"[BACKUP CREATED] {filename} -> backups/{backup_filename}")

        # Retention policy: Keep the last 50 backups per file type
        prefix = f"{name_part}_"
        existing_backups = sorted([
            f for f in os.listdir(BACKUPS_DIR)
            if f.startswith(prefix) and f.endswith(ext)
        ])
        if len(existing_backups) > MAX_BACKUPS_PER_FILE:
            to_delete = existing_backups[:-MAX_BACKUPS_PER_FILE]
            for old_b in to_delete:
                old_p = os.path.join(BACKUPS_DIR, old_b)
                try:
                    os.remove(old_p)
                    print(f"[BACKUP ROTATED] Deleted old backup {old_b}")
                except Exception:
                    pass
    except Exception as e:
        print(f"[BACKUP ERROR] Failed to backup {file_path}: {e}")

def save_products(products):
    os.makedirs(os.path.dirname(PRODUCTS_FILE), exist_ok=True)
    try:
        with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(products, f, indent=2, ensure_ascii=False)
        create_file_backup(PRODUCTS_FILE)
        return True
    except Exception as e:
        print(f"Error saving {PRODUCTS_FILE}: {e}")
        return False

def load_orders():
    if not os.path.exists(ORDERS_FILE):
        return []
    try:
        with open(ORDERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {ORDERS_FILE}: {e}")
        return []

def save_orders(orders):
    os.makedirs(os.path.dirname(ORDERS_FILE), exist_ok=True)
    try:
        with open(ORDERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(orders, f, indent=2, ensure_ascii=False)
        create_file_backup(ORDERS_FILE)
        return True
    except Exception as e:
        print(f"Error saving {ORDERS_FILE}: {e}")
        return False

ABANDONED_CARTS_FILE = os.path.join(PROJECT_DIR, 'data', 'abandoned_carts.json')

def save_abandoned_carts(carts):
    os.makedirs(os.path.dirname(ABANDONED_CARTS_FILE), exist_ok=True)
    try:
        with open(ABANDONED_CARTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(carts, f, indent=2, ensure_ascii=False)
        create_file_backup(ABANDONED_CARTS_FILE)
        return True
    except Exception as e:
        print(f"Error saving {ABANDONED_CARTS_FILE}: {e}")
        return False

import time

# Server-Side Admin Authentication Configuration
ADMIN_SECRET_KEY = os.environ.get('ADMIN_PASSCODE', 'admin123')
TOKEN_TTL_SECONDS = int(os.environ.get('TOKEN_TTL', 7200))  # Default: 2 hours

# Active Tokens Map: { token_string: expiry_timestamp }
ACTIVE_ADMIN_TOKENS = {}

# Rate Limiting Tracker: { client_ip: [timestamp1, timestamp2, ...] }
FAILED_LOGIN_ATTEMPTS = {}
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 600  # 10 minutes

# Public Storefront API Rate Limiting (Independent Endpoint Buckets)
CARTS_API_REQUESTS = {}
MAX_CARTS_REQUESTS_PER_MIN = 30  # Higher limit for frequent lead-capture blur/unload events

ORDERS_API_REQUESTS = {}
MAX_ORDERS_REQUESTS_PER_MIN = 10  # Strict limit for actual order placement

PUBLIC_WINDOW_SECONDS = 60  # 1 minute

def check_endpoint_rate_limit(tracker_dict, client_ip, max_limit, window_seconds=60):
    now = time.time()
    attempts = tracker_dict.get(client_ip, [])
    attempts = [t for t in attempts if now - t < window_seconds]
    tracker_dict[client_ip] = attempts

    if len(attempts) >= max_limit:
        remaining = int(window_seconds - (now - attempts[0]))
        return False, remaining

    attempts.append(now)
    return True, 0

def load_abandoned_carts():
    if not os.path.exists(ABANDONED_CARTS_FILE):
        return []
    try:
        with open(ABANDONED_CARTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {ABANDONED_CARTS_FILE}: {e}")
        return []

def save_abandoned_carts(carts):
    os.makedirs(os.path.dirname(ABANDONED_CARTS_FILE), exist_ok=True)
    try:
        with open(ABANDONED_CARTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(carts, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving {ABANDONED_CARTS_FILE}: {e}")
        return False

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 1. Essential Security Headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

        # 2. Content Security Policy (Scoped for Storefront & Admin functionality)
        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
            "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://ka-f.fontawesome.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        self.send_header('Content-Security-Policy', csp_policy)

        # 3. Restricted CORS Policy (NO wildcard '*' on admin or API routes)
        origin = self.headers.get('Origin')
        if origin and (origin.startswith('http://localhost') or origin.startswith('http://127.0.0.1')):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization, X-Admin-Token')
        super().end_headers()

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_admin_authenticated(self):
        token = None
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
        if not token:
            token = self.headers.get('X-Admin-Token', '').strip()

        if not token:
            return False

        now = time.time()
        expiry = ACTIVE_ADMIN_TOKENS.get(token)
        if expiry and now < expiry:
            return True
        elif expiry:
            del ACTIVE_ADMIN_TOKENS[token]
            print(f"[AUTH EXPIRED] Admin token {token[:12]}... has expired.")

        return False

    def _send_unauthorized(self):
        self._send_json({
            'success': False,
            'error': '401 Unauthorized. Valid admin authentication token required.'
        }, status=401)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/products':
            products = load_products()
            data = json.dumps(products, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == '/api/orders':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            orders = load_orders()
            data = json.dumps(orders, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == '/api/abandoned_carts':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            carts = load_abandoned_carts()
            data = json.dumps(carts, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == '/api/admin/backups':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            if not os.path.exists(BACKUPS_DIR):
                self._send_json({'success': True, 'count': 0, 'backups': []})
                return

            files = []
            for fn in sorted(os.listdir(BACKUPS_DIR), reverse=True):
                fp = os.path.join(BACKUPS_DIR, fn)
                if os.path.isfile(fp):
                    stat = os.stat(fp)
                    files.append({
                        'filename': fn,
                        'size_bytes': stat.st_size,
                        'created_at': datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
            self._send_json({'success': True, 'count': len(files), 'backups': files})
            return

        super().do_GET()

    def end_headers(self):
        if self.path.endswith('.js') or self.path.endswith('.css') or '?v=' in self.path:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_type = self.headers.get('Content-Type', '')

        # ── Image Upload (Admin Only) ────────────────────────────────────────
        if path == '/api/upload':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            if 'multipart/form-data' not in content_type:
                self._send_json({'success': False, 'error': 'Expected multipart/form-data'}, 400)
                return

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > MAX_FILE_SIZE:
                    try:
                        self.rfile.read(min(content_length, 1024 * 1024))
                    except Exception:
                        pass
                    self._send_json({'success': False, 'error': 'File payload exceeds maximum 10 MB limit'}, 413)
                    return

                raw = self.rfile.read(content_length)

                # Extract boundary from Content-Type header
                boundary_match = re.search(r'boundary=([^;\s]+)', content_type)
                if not boundary_match:
                    self._send_json({'success': False, 'error': 'Missing multipart boundary'}, 400)
                    return
                boundary = boundary_match.group(1).encode()

                # Split into parts
                parts = raw.split(b'--' + boundary)
                file_data = None
                filename = None

                for part in parts:
                    if b'Content-Disposition' not in part:
                        continue
                    # Separate headers from body
                    if b'\r\n\r\n' in part:
                        header_section, body = part.split(b'\r\n\r\n', 1)
                    elif b'\n\n' in part:
                        header_section, body = part.split(b'\n\n', 1)
                    else:
                        continue

                    headers_text = header_section.decode('utf-8', errors='replace')
                    if 'filename=' not in headers_text:
                        continue  # skip non-file fields

                    fn_match = re.search(r'filename="([^"]+)"', headers_text)
                    if not fn_match:
                        continue
                    filename = os.path.basename(fn_match.group(1))
                    # Strip trailing boundary delimiter from body
                    body = body.rstrip(b'\r\n')
                    if body.endswith(b'--'):
                        body = body[:-2].rstrip(b'\r\n')
                    file_data = body
                    break

                if not file_data or not filename:
                    self._send_json({'success': False, 'error': 'No image file provided'}, 400)
                    return

                if len(file_data) > MAX_FILE_SIZE:
                    self._send_json({'success': False, 'error': 'File payload exceeds maximum 10 MB limit'}, 413)
                    return

                clean_filename = os.path.basename(filename)
                ext = os.path.splitext(clean_filename)[1].lower()
                if ext not in ALLOWED_EXTENSIONS:
                    self._send_json({'success': False, 'error': f'File extension {ext} not permitted. Only genuine JPG, PNG, GIF, or WEBP allowed.'}, 400)
                    return

                has_forbidden, forbidden_ext = has_forbidden_inner_extension(clean_filename)
                if has_forbidden:
                    self._send_json({'success': False, 'error': f'Disguised file containing forbidden inner extension {forbidden_ext} rejected.'}, 400)
                    return

                # Validate Real Magic Bytes Content
                is_valid, detected_ext = validate_image_magic_bytes(file_data)
                if not is_valid:
                    self._send_json({'success': False, 'error': f'File content validation failed: {detected_ext}'}, 400)
                    return

                # Restrict Upload Directory & Randomize Filename
                safe_name = f"{uuid.uuid4().hex}{ext}"
                target_dir = os.path.abspath(UPLOADS_DIR)
                save_path = os.path.abspath(os.path.join(target_dir, safe_name))

                if not save_path.startswith(target_dir):
                    self._send_json({'success': False, 'error': 'Invalid destination path'}, 400)
                    return

                with open(save_path, 'wb') as fh:
                    fh.write(file_data)

                file_url = f'/uploads/{safe_name}'
                print(f'[UPLOAD] Saved: {save_path} -> {file_url}')
                self._send_json({'success': True, 'url': file_url, 'filename': safe_name})

            except Exception as e:
                import traceback; traceback.print_exc()
                self._send_json({'success': False, 'error': str(e)}, 500)
            return

        # ── JSON endpoints below ─────────────────────────────────────────────
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'

        try:
            payload = json.loads(body.decode('utf-8'))
            payload = sanitize_object(payload)
        except Exception:
            payload = {}

        if path == '/api/admin/login':
            client_ip = self.client_address[0]
            now = time.time()

            # Clean up old failed login attempts past lockout window
            attempts = FAILED_LOGIN_ATTEMPTS.get(client_ip, [])
            attempts = [t for t in attempts if now - t < LOCKOUT_WINDOW_SECONDS]
            FAILED_LOGIN_ATTEMPTS[client_ip] = attempts

            if len(attempts) >= MAX_FAILED_LOGIN_ATTEMPTS:
                remaining_lockout = int(LOCKOUT_WINDOW_SECONDS - (now - attempts[0]))
                print(f"[AUTH RATE LIMIT] IP {client_ip} locked out. {len(attempts)} failed attempts.")
                self._send_json({
                    'success': False,
                    'error': f'Too many failed login attempts. IP locked out for {remaining_lockout} seconds.'
                }, status=429)
                return

            passcode = str(payload.get('passcode', '')).strip()

            # Strict comparison with ADMIN_SECRET_KEY
            if passcode and passcode == ADMIN_SECRET_KEY:
                token = f"adm_token_{uuid.uuid4().hex}"
                expiry_time = now + TOKEN_TTL_SECONDS
                ACTIVE_ADMIN_TOKENS[token] = expiry_time
                FAILED_LOGIN_ATTEMPTS.pop(client_ip, None)
                print(f"[AUTH SUCCESS] Admin session token issued for IP {client_ip}. Valid for {TOKEN_TTL_SECONDS}s.")
                self._send_json({'success': True, 'token': token, 'expires_in': TOKEN_TTL_SECONDS})
            else:
                FAILED_LOGIN_ATTEMPTS.setdefault(client_ip, []).append(now)
                attempts_count = len(FAILED_LOGIN_ATTEMPTS[client_ip])
                print(f"[AUTH FAIL] Invalid login attempt #{attempts_count} from IP {client_ip}.")
                self._send_json({
                    'success': False,
                    'error': f'Invalid admin passcode. ({MAX_FAILED_LOGIN_ATTEMPTS - attempts_count} attempts remaining before lockout)'
                }, status=401)
            return

        if path == '/api/admin/backups/restore':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            backup_filename = os.path.basename(payload.get('backup_filename', ''))
            if not backup_filename:
                self._send_json({'success': False, 'error': 'Missing backup_filename'}, 400)
                return

            backup_path = os.path.abspath(os.path.join(BACKUPS_DIR, backup_filename))
            if not backup_path.startswith(os.path.abspath(BACKUPS_DIR)) or not os.path.exists(backup_path):
                self._send_json({'success': False, 'error': f'Backup file {backup_filename} not found'}, 404)
                return

            if backup_filename.startswith('orders_'):
                target_path = ORDERS_FILE
            elif backup_filename.startswith('abandoned_carts_'):
                target_path = ABANDONED_CARTS_FILE
            elif backup_filename.startswith('products_'):
                target_path = PRODUCTS_FILE
            else:
                self._send_json({'success': False, 'error': 'Unknown backup file type'}, 400)
                return

            # Take a safety snapshot of live target before restoring
            create_file_backup(target_path)
            shutil.copy2(backup_path, target_path)
            print(f"[BACKUP RESTORED] Restored {backup_filename} -> {target_path}")
            self._send_json({
                'success': True,
                'message': f'Successfully restored {os.path.basename(target_path)} from {backup_filename}'
            })
            return

        if path == '/api/products':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            products = load_products()
            
            # Generate ID
            existing_ids = [p.get('id', 0) for p in products if isinstance(p.get('id'), int)]
            new_id = (max(existing_ids) + 1) if existing_ids else 10001
            
            new_product = {
                "id": new_id,
                "title": payload.get('title', 'New Product'),
                "slug": payload.get('slug', payload.get('title', 'new-product').lower().replace(' ', '-')),
                "sku": payload.get('sku', f"HK-{new_id}"),
                "short_description": payload.get('short_description', ''),
                "description": payload.get('description', ''),
                "price": float(payload.get('price', 0)),
                "regular_price": float(payload.get('regular_price', payload.get('price', 0))),
                "currency_code": "PKR",
                "currency_symbol": "₨",
                "department": payload.get('department', 'jewelry'),
                "category": payload.get('category', 'General'),
                "images": payload.get('images', ["https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=80"]),
                "attributes": payload.get('attributes', {}),
                "is_in_stock": payload.get('stock_status', 'instock') == 'instock',
                "is_purchasable": True,
                "stock_quantity": payload.get('stock_quantity', None),
                "stock_status": payload.get('stock_status', 'instock'),
                "on_sale": payload.get('on_sale', False),
                "average_rating": payload.get('average_rating', 5.0),
                "review_count": payload.get('review_count', 1),
                "variations": payload.get('variations', [])
            }
            
            products.insert(0, new_product)
            success = save_products(products)
            
            res = json.dumps({"success": success, "product": new_product}).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        elif path == '/api/discounts':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            products = load_products()
            pct = float(payload.get('discountPercent', 10))
            dept = payload.get('department', '')

            for p in products:
                if not dept or p.get('department', '').lower() == dept.lower():
                    reg = p.get('regular_price') or p.get('price', 0)
                    if reg:
                        p['regular_price'] = reg
                        p['price'] = round(reg * (1 - pct / 100))
                        p['on_sale'] = True if pct > 0 else False

            success = save_products(products)
            res = json.dumps({"success": success, "message": f"Applied {pct}% discount"}).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        elif path == '/api/categories/delete':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            products = load_products()
            dept = payload.get('department', '').lower()
            cat_name = payload.get('category', '')
            target_cat = payload.get('targetCategory', 'Uncategorized')

            updated_count = 0
            if cat_name:
                for p in products:
                    p_dept = (p.get('department') or '').lower()
                    p_cat = p.get('category', '')
                    if p_dept == dept and p_cat.lower() == cat_name.lower():
                        p['category'] = target_cat
                        updated_count += 1

            success = save_products(products)
            res = json.dumps({
                "success": success,
                "message": f"Deleted category '{cat_name}'. {updated_count} products reassigned to '{target_cat}'.",
                "reassignedCount": updated_count
            }).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return
        elif path == '/api/abandoned_carts':
            # Public storefront lead capture rate limiting (Independent bucket: Max 30 req/min)
            client_ip = self.client_address[0]
            allowed, remaining_sec = check_endpoint_rate_limit(CARTS_API_REQUESTS, client_ip, MAX_CARTS_REQUESTS_PER_MIN)
            if not allowed:
                self._send_json({'success': False, 'error': f'Cart tracking rate limit exceeded. Please wait {remaining_sec} seconds.'}, 429)
                return

            carts = load_abandoned_carts()
            cart_item = payload if isinstance(payload, dict) else {}
            _, _, cart_item = recalculate_order_totals(cart_item, require_catalog_match=False)
            phone = cart_item.get('phone', '').strip()
            session_id = cart_item.get('session_id', '').strip()

            # Upsert cart item by phone or session_id
            existing_index = -1
            for idx, c in enumerate(carts):
                if (phone and c.get('phone') == phone) or (session_id and c.get('session_id') == session_id):
                    existing_index = idx
                    break

            if existing_index >= 0:
                carts[existing_index].update(cart_item)
                carts[existing_index]['updated_at'] = cart_item.get('updated_at')
            else:
                if not cart_item.get('id'):
                    cart_item['id'] = uuid.uuid4().hex[:8]
                carts.insert(0, cart_item)

            success = save_abandoned_carts(carts)
            res = json.dumps({"success": success, "cart": cart_item}).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        elif path == '/api/abandoned_carts/status':
            if not self._is_admin_authenticated():
                self._send_unauthorized()
                return
            carts = load_abandoned_carts()
            cart_id = payload.get('id')
            new_status = payload.get('status', 'Recovered')
            
            for c in carts:
                if c.get('id') == cart_id or c.get('phone') == payload.get('phone'):
                    c['status'] = new_status

            success = save_abandoned_carts(carts)
            res = json.dumps({"success": success}).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return
        elif path == '/api/orders':
            # Public customer order placement rate limiting (Independent bucket: Max 10 req/min)
            client_ip = self.client_address[0]
            allowed, remaining_sec = check_endpoint_rate_limit(ORDERS_API_REQUESTS, client_ip, MAX_ORDERS_REQUESTS_PER_MIN)
            if not allowed:
                self._send_json({'success': False, 'error': f'Order placement rate limit exceeded. Please wait {remaining_sec} seconds.'}, 429)
                return

            orders = load_orders()
            order_item = payload if isinstance(payload, dict) else {}
            is_valid, err_msg, order_item = recalculate_order_totals(order_item)
            if not is_valid:
                self._send_json({'success': False, 'error': err_msg}, 400)
                return

            orders.insert(0, order_item)
            success = save_orders(orders)
            res = json.dumps({"success": success, "order": order_item}).encode('utf-8')
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        if not self._is_admin_authenticated():
            self._send_unauthorized()
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'

        try:
            payload = json.loads(body.decode('utf-8'))
        except Exception:
            payload = {}

        if path == '/api/products' or path.startswith('/api/products/'):
            products = load_products()
            product_id = payload.get('id')
            if not product_id and path.startswith('/api/products/'):
                try:
                    product_id = int(path.split('/')[-1])
                except ValueError:
                    pass

            idx = -1
            for i, p in enumerate(products):
                if p.get('id') == product_id:
                    idx = i
                    break

            if idx > -1:
                # Update fields
                target = products[idx]
                for key in ['title', 'sku', 'short_description', 'description', 'department', 'category', 'images', 'attributes', 'variations']:
                    if key in payload:
                        target[key] = payload[key]
                if 'price' in payload:
                    target['price'] = float(payload['price'])
                if 'regular_price' in payload:
                    target['regular_price'] = float(payload['regular_price'])
                if 'stock_status' in payload:
                    target['stock_status'] = payload['stock_status']
                    target['is_in_stock'] = payload['stock_status'] == 'instock'
                if 'stock_quantity' in payload:
                    target['stock_quantity'] = payload['stock_quantity']
                if 'on_sale' in payload:
                    target['on_sale'] = bool(payload['on_sale'])

                success = save_products(products)
                res = json.dumps({"success": success, "product": target}).encode('utf-8')
                self.send_response(200 if success else 500)
            else:
                res = json.dumps({"success": False, "message": "Product not found"}).encode('utf-8')
                self.send_response(404)

            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        if not self._is_admin_authenticated():
            self._send_unauthorized()
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        product_id = None
        if 'id' in query:
            try:
                product_id = int(query['id'][0])
            except ValueError:
                pass
        elif path.startswith('/api/products/'):
            try:
                product_id = int(path.split('/')[-1])
            except ValueError:
                pass

        if product_id is not None:
            products = load_products()
            new_products = [p for p in products if p.get('id') != product_id]
            if len(new_products) < len(products):
                success = save_products(new_products)
                res = json.dumps({"success": success, "message": "Product deleted"}).encode('utf-8')
                self.send_response(200 if success else 500)
            else:
                res = json.dumps({"success": False, "message": "Product ID not found"}).encode('utf-8')
                self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(res)
            return

        self.send_response(400)
        self.end_headers()

if __name__ == '__main__':
    os.chdir(PROJECT_DIR)
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"HK Accessories Server running at http://localhost:{PORT}")
        httpd.serve_forever()
