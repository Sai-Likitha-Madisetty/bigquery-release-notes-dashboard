import os
import time
import json
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "feed_cache.json"
CACHE_EXPIRY = 3600  # Cache for 1 hour (in seconds)

def clean_html_content(html_str):
    """
    Cleans HTML content by ensuring links open in a new tab.
    """
    if not html_str:
        return ""
    soup = BeautifulSoup(html_str, 'html.parser')
    for a in soup.find_all('a'):
        a['target'] = '_blank'
        a['rel'] = 'noopener noreferrer'
    return str(soup)

def parse_release_notes(xml_data):
    """
    Parses the Atom XML feed data and breaks it down into individual updates.
    """
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('.//atom:entry', ns)
    
    parsed_updates = []
    
    for entry in entries:
        date_str = entry.find('atom:title', ns).text
        updated_str = entry.find('atom:updated', ns).text
        id_str = entry.find('atom:id', ns).text
        
        link_el = entry.find('atom:link', ns)
        link_str = link_el.attrib.get('href') if link_el is not None else ""
        
        content_el = entry.find('atom:content', ns)
        content_html = content_el.text if content_el is not None else ""
        
        if not content_html.strip():
            continue
            
        soup = BeautifulSoup(content_html, 'html.parser')
        
        current_update = None
        
        for element in soup.contents:
            if element.name == 'h3':
                # Save previous update if it exists
                if current_update:
                    # Clean and close up the previous update
                    current_update['content_html'] = clean_html_content(current_update['content_html'])
                    current_update['content_text'] = current_update['content_text'].strip()
                    parsed_updates.append(current_update)
                
                category = element.get_text().strip()
                # Determine standard category mapping
                cat_lower = category.lower()
                if 'feature' in cat_lower:
                    cat_type = 'Feature'
                elif 'change' in cat_lower or 'deprecat' in cat_lower:
                    cat_type = 'Changed'
                elif 'issue' in cat_lower or 'bug' in cat_lower or 'fixed' in cat_lower:
                    cat_type = 'Issue'
                else:
                    cat_type = 'Announcement'
                    
                current_update = {
                    'id': f"{id_str}_{len(parsed_updates)}",
                    'date': date_str,
                    'raw_date': updated_str,
                    'category': category,
                    'category_type': cat_type,
                    'link': link_str,
                    'content_html': "",
                    'content_text': ""
                }
            elif element.name:
                # If there isn't an active update (e.g. text before first <h3>)
                if not current_update:
                    current_update = {
                        'id': f"{id_str}_init",
                        'date': date_str,
                        'raw_date': updated_str,
                        'category': 'Announcement',
                        'category_type': 'Announcement',
                        'link': link_str,
                        'content_html': "",
                        'content_text': ""
                    }
                
                # Append element HTML representation
                current_update['content_html'] += str(element)
                # Append raw text for search and tweet generation
                current_update['content_text'] += " " + element.get_text()
                
        # Append the last update
        if current_update:
            current_update['content_html'] = clean_html_content(current_update['content_html'])
            current_update['content_text'] = current_update['content_text'].strip()
            parsed_updates.append(current_update)
            
    return parsed_updates

def fetch_and_cache_feed(force_refresh=False):
    """
    Fetches the XML feed, parses it, and caches the result.
    """
    # Check if cache exists and is fresh
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            
            # Check age of cache
            if time.time() - cache_data.get('timestamp', 0) < CACHE_EXPIRY:
                print("Serving from cache.")
                return cache_data.get('updates', []), False
        except Exception as e:
            print(f"Error reading cache: {e}. Re-fetching...")

    print("Fetching live feed...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        updates = parse_release_notes(xml_data)
        
        # Save to cache
        cache_data = {
            'timestamp': time.time(),
            'updates': updates
        }
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
        return updates, True
    except Exception as e:
        # If fetch fails but cache exists, fallback to cache
        if os.path.exists(CACHE_FILE):
            print(f"Error fetching feed: {e}. Falling back to cache.")
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                return cache_data.get('updates', []), False
            except:
                pass
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force = request.args.get('force', 'false').lower() == 'true'
    try:
        updates, was_fetched = fetch_and_cache_feed(force_refresh=force)
        return jsonify({
            'success': True,
            'fetched_live': was_fetched,
            'count': len(updates),
            'updates': updates
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Create static directories if they don't exist
    os.makedirs(os.path.join('static', 'css'), exist_ok=True)
    os.makedirs(os.path.join('static', 'js'), exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    app.run(debug=True, port=5000)
