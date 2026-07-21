import json
import random
import os

# Unsplash image ID pools for high-quality visuals
JEWELRY_IMAGES = [
    "photo-1605100804763-247f67b3557e", # Ring
    "photo-1535632066927-ab7c9ab60908", # Ring
    "photo-1599643478518-a784e5dc4c8f", # Necklace
    "photo-1603561591411-07134e71a2a9", # Earrings
    "photo-1515562141207-7a88fb7ce338", # Jewels
    "photo-1617038260897-41a1f14a8ca0", # Bracelet
    "photo-1602751584552-8ba73aad10e1", # Gold bracelet
    "photo-1611085583191-a3b1a30a5a4a", # Rings
    "photo-1598560917505-59a3ad559071", # Earring
    "photo-1506630448388-4e683c67ddb0", # Bracelet
    "photo-1629224316810-9d8805b95e76", # Jewelry box
    "photo-1573408301185-9146fe634ad0"  # Jewelry set
]

DIECAST_IMAGES = [
    "photo-1581235720704-06d3acfcb36f", # Toy car
    "photo-1594787318286-3d835c1d207f", # Model car
    "photo-1568605117036-5fe5e7bab0b7", # Sports car model
    "photo-1605559424843-9e4c228bf1c2", # Classic car model
    "photo-1558981806-ec527fa84c39", # Motorcycle model
    "photo-1532581291347-9c39cf10a73c", # Plane model
    "photo-1616422285623-13ff0162193c", # SUV model
    "photo-1609521263047-f8f205293f24"  # Diecast engine/parts
]

TOYS_IMAGES = [
    "photo-1559251606-c623743a6d76", # Colorful toys
    "photo-1566576912321-d58edd7a26a4", # Toy blocks
    "photo-1587654780291-39c9404d746b", # Puzzle
    "photo-1596461404969-9ae70f2830c1", # Action figure
    "photo-1545558014-8692077e9b5c", # Board game
    "photo-1599643477877-530eb83abc8e", # Rubik's cube
    "photo-1608889175123-8ec330b86f84", # Funko Pop / Figure
    "photo-1534447677768-be436bb09401"  # Teddy bear
]

CLOTHING_IMAGES = [
    "photo-1521572267360-ee0c2909d518", # T-shirt
    "photo-1556905055-8f358a7a47b2", # Clothing pile/colors
    "photo-1562157873-818bc0726f68", # Folded shirts
    "photo-1578587018452-892bacefd3f2", # Hoodie
    "photo-1578587018452-892bacefd3f2", # Fashion rack
    "photo-1620799140408-edc6dcb6d633", # Premium sweater
    "photo-1602810318383-e386cc2a3ccf", # Plaid shirt
    "photo-1618354691373-d851c5c3a990"  # Black tee
]

def make_unsplash_url(photo_id):
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w=600&q=80"

# Sample text pools for descriptions
STYLING_SUGGESTIONS = [
    "Perfect for stacking or wearing solo as a statement piece.",
    "Pair with a matching pendant for a complete formal look.",
    "Adds an elegant touch to both casual daytime outfits and formal evening wear.",
    "Wear it as a daily signature piece or save it for special celebrations.",
    "Complements neutral-toned outfits, allowing the gold plating to stand out beautifully."
]

CARE_INSTRUCTIONS = [
    "Avoid contact with water, perfumes, body lotions, and harsh chemicals. Store in a dry, airtight jewelry box when not in use.",
    "Clean gently with a soft microfiber cloth after each wear. Remove before bathing, swimming, or sleeping.",
    "Keep away from humidity and direct sunlight. To maintain luster, wipe down with a dry flannel cloth.",
    "Handle with care. Store separately from other jewelry to prevent scratches."
]

DELIVERY_INFO = "Pakistan-wide shipping within 3-5 working days. Cash on Delivery (COD) available. Free shipping on orders over PKR 2,000."
PACKAGING = "Comes in a premium HK Accessories presentation drawer-box, complete with a soft velvet pouch and care instruction card—ideal for gifting."

def generate_catalog():
    products = []
    
    # ------------------ 1. JEWELRY (280 Products) ------------------
    jewelry_cats = [
        "Rings", "Earrings", "Bracelets", "Bangles", "Pendants and Chains",
        "Jewelry Sets", "Xuping Jewelry", "Adjustable Rings", "Couple Rings", "Jewelry Boxes"
    ]
    
    jewelry_materials = ["24K Gold Plated", "18K Rose Gold Plated", "Rhodium Silver Plated", "Premium Sterling Silver Style", "Xuping Alloy Base"]
    jewelry_stones = ["AAA+ Cubic Zirconia", "Simulated Solitaire Crystal", "Cultured Shell Pearls", "Faceted Swarovski Style Crystals", "No Stones (High-Polish Finish)"]
    
    j_id = 1000
    for cat in jewelry_cats:
        num_items = 30 if cat != "Couple Rings" and cat != "Jewelry Boxes" else 20
        for i in range(num_items):
            j_id += 1
            material = random.choice(jewelry_materials)
            stone = random.choice(jewelry_stones)
            
            # Formulate Title
            adjective = random.choice(["Elegant", "Classic", "Luxury", "Minimalist", "Vibrant", "Timeless", "Charming", "Delicate", "Modern"])
            design = random.choice(["Marquise Cut", "Infinity Loop", "Solitaire Hook", "Floral Filigree", "Geometric Hexagon", "Heart-to-Heart", "Double Band", "Open Cuff"])
            
            # Singular/plural based on category
            item_name = cat.rstrip('s')
            if cat == "Jewelry Sets":
                item_name = "Necklace & Earring Set"
            elif cat == "Jewelry Boxes":
                item_name = "Velvet Storage Box"
                material = "Premium Velvet Exterior"
                stone = "Satin Linings"
            elif cat == "Xuping Jewelry":
                item_name = random.choice(["Luxury Bangles", "Classic Pendant", "Statement Earrings"])
            
            title = f"{adjective} {design} {material} {item_name}"
            
            # Pricing
            is_sale = random.random() < 0.25
            if cat == "Jewelry Boxes":
                reg_price = random.choice([950, 1200, 1500, 1800, 2200])
            elif cat == "Jewelry Sets":
                reg_price = random.choice([2500, 2900, 3500, 3800, 4500])
            elif "Gifts Under" in cat:
                reg_price = random.randint(500, 999)
            else:
                reg_price = random.choice([1200, 1450, 1600, 1850, 1999, 2400])
                
            price = reg_price
            if is_sale:
                price = int(reg_price * random.choice([0.75, 0.8, 0.85]))
                # Round to nearest 50
                price = (price // 50) * 50
            
            # Stock
            stock_qty = random.randint(0, 40)
            stock_status = "instock" if stock_qty > 0 else "outofstock"
            
            # Attributes
            attrs = {
                "Material/Plating": material,
                "Decorative Details": stone,
                "Sizing": "Adjustable (Fits all sizes)" if "Adjustable" in cat or "Rings" in cat and random.random() > 0.3 else "Standard Size",
                "Color Options": random.choice(["Champagne Gold", "Platinum Silver", "Rose Gold"]),
                "Packaging": "HK Signature Velvet Box"
            }
            
            # Description composition
            desc = (
                f"Elevate your daily fashion with this {title.lower()}. Crafted with a base alloy and finished with a thick layer of {material}, "
                f"this piece features a dazzling {stone.lower()} that captures light beautifully. Perfect for {random.choice(['anniversaries', 'daily wear', 'wedding guests', 'evening parties', 'gifts'])}. "
                f"\n\nStyling Suggestion: {random.choice(STYLING_SUGGESTIONS)} "
                f"\nCare Instructions: {random.choice(CARE_INSTRUCTIONS)} "
                f"\nPackaging: {PACKAGING}"
            )
            
            # Reviews
            num_revs = random.randint(1, 6)
            reviews = []
            total_rating = 0
            for r in range(num_revs):
                rating = random.choice([4, 5, 5, 5])
                total_rating += rating
                reviews.append({
                    "author": random.choice(["Ayesha K.", "Sana M.", "Fatima Z.", "Hina A.", "Zainab R.", "Mariam B."]),
                    "rating": rating,
                    "content": random.choice([
                        "Absolutely gorgeous! The plating shines so well and it looks very expensive.",
                        "Amazing value for money. Looks identical to gold jewelry.",
                        "Very beautiful design. Gifted it to my sister and she loved it.",
                        "Stunning piece. Packaging was also very premium. Highly recommend HK Accessories!",
                        "Nice plating and very comfortable to wear. Delivered in just 2 days to Lahore."
                    ]),
                    "date": f"2026-06-{random.randint(10,28):02d}"
                })
            
            products.append({
                "id": j_id,
                "title": title,
                "sku": f"HK-JW-{j_id}",
                "price": price,
                "regular_price": reg_price,
                "on_sale": is_sale,
                "department": "jewelry",
                "category": cat,
                "images": [make_unsplash_url(random.choice(JEWELRY_IMAGES)) for _ in range(2)],
                "description": desc,
                "attributes": attrs,
                "stock_quantity": stock_qty,
                "stock_status": stock_status,
                "reviews": reviews,
                "average_rating": round(total_rating / num_revs, 1),
                "created_at": f"2026-05-{random.randint(10,28):02d}"
            })

    # ------------------ 2. DIECAST (90 Products) ------------------
    diecast_cats = ["Diecast Cars", "Diecast Motorcycles", "Collector Trucks", "Planes & Aircraft"]
    diecast_scales = ["1:24 Scale", "1:18 Scale", "1:32 Scale", "1:43 Scale", "1:64 Scale"]
    diecast_makes = ["Classic Sports Car", "Vintage Muscle Car", "Modern Hypercar", "Retro Cruiser", "Heavy Duty Transport", "Military Fighter Jet"]
    
    d_id = 2000
    for cat in diecast_cats:
        num_items = 25 if cat == "Diecast Cars" else 20
        for i in range(num_items):
            d_id += 1
            scale = random.choice(diecast_scales)
            make = random.choice(diecast_makes)
            color = random.choice(["Glossy Red", "Matte Black", "Metallic Blue", "British Racing Green", "Sunburst Yellow"])
            
            title = f"{scale} Detailed Metal {make} ({color})"
            
            is_sale = random.random() < 0.20
            reg_price = random.choice([2500, 3200, 3950, 4800, 5500, 7500])
            price = reg_price
            if is_sale:
                price = int(reg_price * 0.85)
                price = (price // 50) * 50
                
            stock_qty = random.randint(1, 15)
            stock_status = "instock" if stock_qty > 0 else "outofstock"
            
            attrs = {
                "Scale Size": scale,
                "Material": "Heavy Diecast Metal and Premium ABS Plastics",
                "Color": color,
                "Functionality": "Opening doors, hood, steering wheels, and functional suspension",
                "Display stand": "Includes detachable display base plate"
            }
            
            desc = (
                f"A premium {scale} diecast model replica of a {make.lower()}. Constructed from high-density heavy alloy metal "
                f"with rich electroplated gloss finish. Features intricate interior detailing, functional doors, detailed rubber tires, "
                f"and active steering. Perfect for hobbyists, collectors, and executive desk displays.\n\n"
                f"Occasion: Ideal birthday or corporate gift for automobile enthusiasts.\n"
                f"Stock Details: Limited collection item. Comes securely packed in a windowed display carton."
            )
            
            products.append({
                "id": d_id,
                "title": title,
                "sku": f"HK-DC-{d_id}",
                "price": price,
                "regular_price": reg_price,
                "on_sale": is_sale,
                "department": "diecast",
                "category": cat,
                "images": [make_unsplash_url(random.choice(DIECAST_IMAGES)) for _ in range(2)],
                "description": desc,
                "attributes": attrs,
                "stock_quantity": stock_qty,
                "stock_status": stock_status,
                "reviews": [{"author": "Ali R.", "rating": 5, "content": "Remarkable details. Heavy weight, feels very high-quality.", "date": "2026-07-02"}],
                "average_rating": 5.0,
                "created_at": f"2026-06-{random.randint(1,15):02d}"
            })

    # ------------------ 3. TOYS (80 Products) ------------------
    toy_cats = ["Action Figures", "Puzzles & Brain Teasers", "Educational Blocks", "Remote Control Toys", "Plush Toys"]
    toy_themes = ["Superheroes Series", "3D Architecture Puzzle", "STEM Robot Kits", "High Speed RC Monster Truck", "Premium Soft Bunny"]
    
    t_id = 3000
    for cat in toy_cats:
        num_items = 16
        for i in range(num_items):
            t_id += 1
            theme = random.choice(toy_themes)
            age = random.choice(["Ages 3+", "Ages 6+", "Ages 8+", "Ages 12+"])
            
            title = f"Premium {theme} ({cat})"
            
            is_sale = random.random() < 0.15
            reg_price = random.choice([1500, 1850, 2400, 2900, 3999, 4500])
            price = reg_price
            if is_sale:
                price = int(reg_price * 0.9)
                price = (price // 50) * 50
                
            stock_qty = random.randint(2, 30)
            stock_status = "instock" if stock_qty > 0 else "outofstock"
            
            attrs = {
                "Age Group": age,
                "Safety Standards": "Non-toxic EN71 Certified Child Safe Material",
                "Components Included": "Detailed instructions and display stand included",
                "Battery Requirements": "No batteries required" if "RC" not in theme else "Requires 4x AA Batteries (Not Included)"
            }
            
            desc = (
                f"Engage creative play and skill building with our {title.lower()}. Engineered with child safety as a priority, "
                f"made with non-toxic high-durability polymers. Highly detailed, robust construction, designed to withstand "
                f"hours of interactive play. Great for gifting on birthdays and holidays.\n\n"
                f"Packaging: Colored gift box packaging.\n"
                f"Delivery: Nationwide door-to-door delivery with COD."
            )
            
            products.append({
                "id": t_id,
                "title": title,
                "sku": f"HK-TY-{t_id}",
                "price": price,
                "regular_price": reg_price,
                "on_sale": is_sale,
                "department": "toys",
                "category": cat,
                "images": [make_unsplash_url(random.choice(TOYS_IMAGES)) for _ in range(2)],
                "description": desc,
                "attributes": attrs,
                "stock_quantity": stock_qty,
                "stock_status": stock_status,
                "reviews": [{"author": "Sara Y.", "rating": 4, "content": "Kids love it. Good quality plastics used.", "date": "2026-07-05"}],
                "average_rating": 4.0,
                "created_at": f"2026-06-{random.randint(1,15):02d}"
            })

    # ------------------ 4. CLOTHING (70 Products) ------------------
    clothing_cats = ["Casual T-Shirts", "Fleece Hoodies", "Sportswear Tees", "Embroidery Caps", "Denim Jackets"]
    clothing_fabrics = ["100% Premium Combed Cotton", "Heavyweight Fleece Cotton Blend", "Breathable Dry-Fit Polyester", "Vintage Washed Denim"]
    
    c_id = 4000
    for cat in clothing_cats:
        num_items = 14
        for i in range(num_items):
            c_id += 1
            fabric = random.choice(clothing_fabrics)
            color = random.choice(["Midnight Black", "Heather Grey", "Olive Green", "Crimson Red", "Navy Blue", "Soft Beige"])
            size_list = ["Small", "Medium", "Large", "XL"]
            
            title = f"{color} {cat} in {fabric.split(' ')[-2]}" # e.g. Midnight Black Casual T-Shirt in Cotton
            
            is_sale = random.random() < 0.30
            reg_price = random.choice([999, 1499, 1890, 2400, 3200, 3999])
            price = reg_price
            if is_sale:
                price = int(reg_price * 0.8)
                price = (price // 50) * 50
                
            stock_qty = random.randint(5, 50)
            stock_status = "instock" if stock_qty > 0 else "outofstock"
            
            attrs = {
                "Fabric Material": fabric,
                "Fit Type": "Modern Relaxed Fit / True to Size",
                "Available Sizes": ", ".join(size_list),
                "Washing Instructions": "Machine wash cold with like colors, tumble dry low, do not iron on print."
            }
            
            desc = (
                f"Stay comfortable and stylish with the HK {color} {cat.lower()}. Tailored from {fabric.lower()} "
                f"providing ultra-soft breathability and long-lasting shape retention. Double-needle stitching on seams "
                f"provides enhanced durability. Clean lines and modern design make it an essential casual wardrobe staple.\n\n"
                f"Styling Suggestion: Style with denim jeans and sneakers for an easy, trendy streetwear aesthetic.\n"
                f"Delivery: Dispatched in 24 hours. Delivery nationwide within 2-4 days."
            )
            
            products.append({
                "id": c_id,
                "title": title,
                "sku": f"HK-CL-{c_id}",
                "price": price,
                "regular_price": reg_price,
                "on_sale": is_sale,
                "department": "clothing",
                "category": cat,
                "images": [make_unsplash_url(random.choice(CLOTHING_IMAGES)) for _ in range(2)],
                "description": desc,
                "attributes": attrs,
                "stock_quantity": stock_qty,
                "stock_status": stock_status,
                "reviews": [{"author": "Usman N.", "rating": 5, "content": "Fabric is extremely soft. Fits perfectly. Satisfied with HK Clothing.", "date": "2026-07-06"}],
                "average_rating": 5.0,
                "created_at": f"2026-06-{random.randint(1,15):02d}"
            })

    # Save to file
    os.makedirs("data", exist_ok=True)
    with open("data/products.json", "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully generated {len(products)} products and saved to data/products.json")

if __name__ == "__main__":
    generate_catalog()
