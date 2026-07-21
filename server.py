import http.server
import socketserver
import json
import os
import sys
import urllib.parse

PORT = 8080
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_FILE = os.path.join(PROJECT_DIR, 'data', 'products.json')

def load_products():
    if not os.path.exists(PRODUCTS_FILE):
        return []
    try:
        with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {PRODUCTS_FILE}: {e}")
        return []

def save_products(products):
    os.makedirs(os.path.dirname(PRODUCTS_FILE), exist_ok=True)
    try:
        with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(products, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving {PRODUCTS_FILE}: {e}")
        return False

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for local dev
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

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

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'

        try:
            payload = json.loads(body.decode('utf-8'))
        except Exception:
            payload = {}

        if path == '/api/products':
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

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
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
