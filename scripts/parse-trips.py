import csv
import json
import re
import os

# Find the CSV file
csv_path = None
for p in [
    os.path.join(os.getcwd(), 'scripts', 'trips.csv'),
    '/vercel/share/v0-project/scripts/trips.csv',
]:
    if os.path.exists(p):
        csv_path = p
        break

if not csv_path:
    # Try to find it anywhere
    for root, dirs, files in os.walk('/'):
        for f in files:
            if f == 'trips.csv':
                csv_path = os.path.join(root, f)
                break
        if csv_path:
            break

print(f"CWD: {os.getcwd()}")
print(f"CSV path: {csv_path}")

if not csv_path:
    print("ERROR: Could not find trips.csv")
    exit(1)

def strip_html(html):
    if not html:
        return ''
    text = re.sub(r'<[^>]+>', '', html)
    text = text.replace('&amp;', '&').replace('&nbsp;', ' ').replace('&quot;', '"')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_highlights(raw):
    if not raw:
        return []
    try:
        arr = json.loads(raw)
        return [h.get('highlight-item', '') for h in arr if h.get('highlight-item')]
    except:
        return []

with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    
    trips = []
    for row in reader:
        trip_id = row.get('ID', '').strip()
        title = row.get('Title', '').strip()
        if not trip_id or not title:
            continue
        
        price = 0
        try:
            price = float(row.get('trip-price', '0') or '0')
        except:
            pass
        
        original_price = 0
        try:
            original_price = float(row.get('trip-original-price', '0') or '0')
        except:
            pass
        
        rating = 0
        try:
            rating = float(row.get('trip-review-score', '0') or '0')
        except:
            pass
        # Normalize: if > 5, assume it's on 0-100 scale
        rating_normalized = round(rating / 20, 1) if rating > 5 else round(rating, 1)
        
        categories = [c.strip() for c in (row.get('Categories', '') or '').split('|') if c.strip()]
        city = row.get('location-geo-city', '') or ''
        duration = row.get('trip-duration', '') or ''
        image = row.get('Image URL', '') or row.get('cover', '') or ''
        permalink = row.get('Permalink', '') or ''
        short_desc = strip_html(row.get('short-description', '') or '')
        description = strip_html(row.get('Content', '') or row.get('description', '') or '')
        highlights = parse_highlights(row.get('trip-highlights', ''))
        included = strip_html(row.get('included-in-the-offer', '') or '')
        not_included = strip_html(row.get('not-included-in-the-offer', '') or '')
        max_group = row.get('number-of-participants-per-group', '') or ''
        languages = [l.strip() for l in (row.get('Language', '') or '').split('|') if l.strip()]
        provider = row.get('provider', '') or ''
        suitable_for = [s.strip() for s in (row.get('Suitable For', '') or '').split('|') if s.strip()]
        region = row.get('Trip Region / Country', '') or ''
        customer_bring = strip_html(row.get('customer-should-bring', '') or '')
        important_info = strip_html(row.get('important-information-for-customers', '') or '')
        gallery_raw = row.get('gallery', '') or ''
        
        # Parse gallery images
        gallery = []
        if gallery_raw:
            # gallery might be pipe-separated URLs or JSON
            if gallery_raw.startswith('['):
                try:
                    gallery = json.loads(gallery_raw)
                except:
                    pass
            else:
                gallery = [g.strip() for g in gallery_raw.split('|') if g.strip() and g.strip().startswith('http')]
        
        # Parse location
        lat = None
        lng = None
        loc_raw = row.get('location', '') or ''
        if loc_raw:
            try:
                loc = json.loads(loc_raw)
                lat = loc.get('latitude')
                lng = loc.get('longitude')
            except:
                pass
        
        trips.append({
            'id': trip_id,
            'title': title,
            'price': price,
            'originalPrice': original_price if original_price > price else None,
            'rating': rating_normalized,
            'reviewCount': int(rating) if rating > 5 else 0,
            'duration': duration,
            'categories': categories,
            'city': city,
            'region': region,
            'image': image,
            'permalink': permalink,
            'shortDescription': short_desc if short_desc else description[:200],
            'description': description,
            'highlights': highlights,
            'included': included,
            'notIncluded': not_included,
            'maxGroup': max_group,
            'languages': languages,
            'provider': provider,
            'suitableFor': suitable_for,
            'customerBring': customer_bring,
            'importantInfo': important_info,
            'gallery': gallery[:6],
            'lat': lat,
            'lng': lng,
        })

print(f"\nParsed {len(trips)} trips")
print("\nAll trips:")
for t in trips:
    print(f"  [{t['id']}] {t['title']} | {t['price']}EUR | {t['rating']} | {t['duration']} | {t['city']} | {','.join(t['categories'])}")

# Write output
out_path = os.path.join(os.getcwd(), 'lib', 'trips-data.json')
# Also try the project path
for op in [out_path, '/vercel/share/v0-project/lib/trips-data.json']:
    try:
        os.makedirs(os.path.dirname(op), exist_ok=True)
        with open(op, 'w', encoding='utf-8') as f:
            json.dump(trips, f, indent=2, ensure_ascii=False)
        print(f"\nWritten to {op}")
    except Exception as e:
        print(f"Failed to write to {op}: {e}")
