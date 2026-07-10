"""
Xenon Ads Dashboard — Main API Server (Premium v2)
FastAPI backend with GAM integration, margin management, and full reporting.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import datetime
import hashlib
import secrets
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from gam_fetcher import GAMFetcher

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / 'config.json'
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

active_sessions = {}

# ============================================================
# HELPERS
# ============================================================
def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_config(config):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_token(publisher_id: str) -> str:
    token = secrets.token_urlsafe(32)
    active_sessions[token] = publisher_id
    return token

def get_publisher_from_token(request: Request) -> dict:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="No token provided")
    token = auth[7:]
    pub_id = active_sessions.get(token)
    if not pub_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    config = load_config()
    for pub in config['publishers']:
        if pub['publisher_id'] == pub_id:
            return pub
    raise HTTPException(status_code=401, detail="Publisher not found")

def get_admin_from_token(request: Request) -> bool:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="No token provided")
    token = auth[7:]
    pub_id = active_sessions.get(token)
    if pub_id != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return True

# ============================================================
# GAM DATA PROCESSING
# ============================================================
def process_gam_data(rows, config):
    today = datetime.date.today()
    three_days_ago = today - datetime.timedelta(days=2)
    seven_days_ago = today - datetime.timedelta(days=6)
    thirty_days_ago = today - datetime.timedelta(days=29)

    totals_by_adunit = {}

    for row in rows:
        adunit_id = row.get('Dimension.AD_UNIT_ID', '')
        if not adunit_id:
            continue

        date_str = row.get('Dimension.DATE', '')
        try:
            row_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            continue

        impressions = int(row.get('Column.AD_SERVER_IMPRESSIONS', 0) or 0)
        clicks = int(row.get('Column.AD_SERVER_CLICKS', 0) or 0)
        revenue_micros = int(row.get('Column.AD_SERVER_CPM_AND_CPC_REVENUE', 0) or 0)
        revenue = revenue_micros / 1_000_000

        if adunit_id not in totals_by_adunit:
            totals_by_adunit[adunit_id] = {
                'daily': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'daily_chart': {},
            }

        # Daily chart data (per date)
        date_key = date_str
        if date_key not in totals_by_adunit[adunit_id]['daily_chart']:
            totals_by_adunit[adunit_id]['daily_chart'][date_key] = {
                'impressions': 0, 'clicks': 0, 'revenue': 0.0
            }
        totals_by_adunit[adunit_id]['daily_chart'][date_key]['impressions'] += impressions
        totals_by_adunit[adunit_id]['daily_chart'][date_key]['clicks'] += clicks
        totals_by_adunit[adunit_id]['daily_chart'][date_key]['revenue'] += revenue

        if row_date == today:
            totals_by_adunit[adunit_id]['daily']['impressions'] += impressions
            totals_by_adunit[adunit_id]['daily']['clicks'] += clicks
            totals_by_adunit[adunit_id]['daily']['revenue'] += revenue

        if row_date >= three_days_ago:
            totals_by_adunit[adunit_id]['3days']['impressions'] += impressions
            totals_by_adunit[adunit_id]['3days']['clicks'] += clicks
            totals_by_adunit[adunit_id]['3days']['revenue'] += revenue

        if row_date >= seven_days_ago:
            totals_by_adunit[adunit_id]['weekly']['impressions'] += impressions
            totals_by_adunit[adunit_id]['weekly']['clicks'] += clicks
            totals_by_adunit[adunit_id]['weekly']['revenue'] += revenue

        if row_date >= thirty_days_ago:
            totals_by_adunit[adunit_id]['monthly']['impressions'] += impressions
            totals_by_adunit[adunit_id]['monthly']['clicks'] += clicks
            totals_by_adunit[adunit_id]['monthly']['revenue'] += revenue

        totals_by_adunit[adunit_id]['3months']['impressions'] += impressions
        totals_by_adunit[adunit_id]['3months']['clicks'] += clicks
        totals_by_adunit[adunit_id]['3months']['revenue'] += revenue

    generated_time = datetime.datetime.now().isoformat()
    all_publisher_data = []

    for publisher in config.get('publishers', []):
        unique_code = publisher['unique_code']
        pub_output = {
            'generated_at': generated_time,
            'publisher_id': publisher['publisher_id'],
            'publisher_name': publisher['publisher_name'],
            'sites': []
        }

        pub_totals = {
            'daily': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
        }

        # Combined daily chart for publisher
        pub_daily_chart = {}

        for site in publisher.get('sites', []):
            adunit_id = site['ad_unit_id']
            margin = site['margin_share']

            raw_data = totals_by_adunit.get(adunit_id, {
                'daily': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
                'daily_chart': {},
            })

            site_periods = {}
            for period in ['daily', '3days', 'weekly', 'monthly', '3months']:
                p_rev = round(raw_data[period]['revenue'] * margin, 2)
                p_imp = raw_data[period]['impressions']
                p_clk = raw_data[period]['clicks']
                p_ctr = round((p_clk / p_imp * 100), 2) if p_imp > 0 else 0
                p_ecpm = round((p_rev / p_imp * 1000), 2) if p_imp > 0 else 0

                site_periods[period] = {
                    'impressions': p_imp,
                    'clicks': p_clk,
                    'revenue': p_rev,
                    'ctr': p_ctr,
                    'ecpm': p_ecpm
                }

                pub_totals[period]['impressions'] += p_imp
                pub_totals[period]['clicks'] += p_clk
                pub_totals[period]['revenue'] += p_rev

            # Site daily chart
            site_chart = []
            for date_key in sorted(raw_data['daily_chart'].keys()):
                chart_data = raw_data['daily_chart'][date_key]
                site_chart.append({
                    'date': date_key,
                    'impressions': chart_data['impressions'],
                    'clicks': chart_data['clicks'],
                    'revenue': round(chart_data['revenue'] * margin, 2)
                })

                # Aggregate into publisher chart
                if date_key not in pub_daily_chart:
                    pub_daily_chart[date_key] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
                pub_daily_chart[date_key]['impressions'] += chart_data['impressions']
                pub_daily_chart[date_key]['clicks'] += chart_data['clicks']
                pub_daily_chart[date_key]['revenue'] += round(chart_data['revenue'] * margin, 2)

            pub_output['sites'].append({
                'site_name': site['site_name'],
                'ad_unit_id': adunit_id,
                'margin_share': margin,
                'periods': site_periods,
                'daily_chart': site_chart
            })

        # Publisher totals
        pub_totals_final = {}
        for period in ['daily', '3days', 'weekly', 'monthly', '3months']:
            p_imp = pub_totals[period]['impressions']
            p_clk = pub_totals[period]['clicks']
            p_rev = round(pub_totals[period]['revenue'], 2)
            p_ctr = round((p_clk / p_imp * 100), 2) if p_imp > 0 else 0
            p_ecpm = round((p_rev / p_imp * 1000), 2) if p_imp > 0 else 0
            pub_totals_final[period] = {
                'impressions': p_imp,
                'clicks': p_clk,
                'revenue': p_rev,
                'ctr': p_ctr,
                'ecpm': p_ecpm
            }

        # Publisher chart
        pub_chart = []
        for date_key in sorted(pub_daily_chart.keys()):
            pub_chart.append({
                'date': date_key,
                'impressions': pub_daily_chart[date_key]['impressions'],
                'clicks': pub_daily_chart[date_key]['clicks'],
                'revenue': pub_daily_chart[date_key]['revenue']
            })

        pub_output['totals'] = pub_totals_final
        pub_output['daily_chart'] = pub_chart

        file_path = DATA_DIR / f'{unique_code}.json'
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(pub_output, f, indent=2, ensure_ascii=False)

        all_publisher_data.append(pub_output)

    # Admin overview
    admin_overview = {
        'generated_at': generated_time,
        'publishers': [],
        'network_daily_chart': {}
    }

    network_totals = {
        'daily': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
        '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
        'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
        'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
        '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
    }

    network_chart_dict = {}

    for pub_data in all_publisher_data:
        pub_info = {
            'publisher_id': pub_data['publisher_id'],
            'publisher_name': pub_data['publisher_name'],
            'totals': pub_data['totals'],
            'site_count': len(pub_data['sites']),
            'sites': []
        }
        for s in pub_data['sites']:
            pub_info['sites'].append({
                'site_name': s['site_name'],
                'ad_unit_id': s['ad_unit_id'],
                'margin_share': s['margin_share'],
                'periods': s['periods']
            })
        admin_overview['publishers'].append(pub_info)

        for period in network_totals:
            network_totals[period]['impressions'] += pub_data['totals'][period]['impressions']
            network_totals[period]['clicks'] += pub_data['totals'][period]['clicks']
            network_totals[period]['revenue'] += pub_data['totals'][period]['revenue']

        # Aggregate network chart
        for chart_point in pub_data['daily_chart']:
            d = chart_point['date']
            if d not in network_chart_dict:
                network_chart_dict[d] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
            network_chart_dict[d]['impressions'] += chart_point['impressions']
            network_chart_dict[d]['clicks'] += chart_point['clicks']
            network_chart_dict[d]['revenue'] += chart_point['revenue']

    network_totals_final = {}
    for period in ['daily', '3days', 'weekly', 'monthly', '3months']:
        p_imp = network_totals[period]['impressions']
        p_clk = network_totals[period]['clicks']
        p_rev = round(network_totals[period]['revenue'], 2)
        p_ctr = round((p_clk / p_imp * 100), 2) if p_imp > 0 else 0
        p_ecpm = round((p_rev / p_imp * 1000), 2) if p_imp > 0 else 0
        network_totals_final[period] = {
            'impressions': p_imp,
            'clicks': p_clk,
            'revenue': p_rev,
            'ctr': p_ctr,
            'ecpm': p_ecpm
        }

    admin_overview['network_totals'] = network_totals_final

    # Network chart sorted
    network_chart = []
    for date_key in sorted(network_chart_dict.keys()):
        network_chart.append({
            'date': date_key,
            'impressions': network_chart_dict[date_key]['impressions'],
            'clicks': network_chart_dict[date_key]['clicks'],
            'revenue': round(network_chart_dict[date_key]['revenue'], 2)
        })
    admin_overview['network_daily_chart'] = network_chart

    with open(DATA_DIR / 'admin_overview.json', 'w', encoding='utf-8') as f:
        json.dump(admin_overview, f, indent=2, ensure_ascii=False)

    print(f"[DATA] Generated data for {len(all_publisher_data)} publishers.")
    return all_publisher_data


def refresh_data():
    fetcher = GAMFetcher()
    today = datetime.date.today()
    ninety_days_ago = today - datetime.timedelta(days=90)
    config = load_config()
    rows = fetcher.fetch_report(ninety_days_ago, today)
    process_gam_data(rows, config)
    return {"status": "success", "rows_fetched": len(rows)}


# ============================================================
# FASTAPI APP
# ============================================================
app = FastAPI(title="Xenon Ads Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / 'static')), name="static")
app.mount("/css", StaticFiles(directory=str(BASE_DIR / 'css')), name="css")
app.mount("/js", StaticFiles(directory=str(BASE_DIR / 'js')), name="js")

# ============================================================
# AUTH ENDPOINTS
# ============================================================
class LoginRequest(BaseModel):
    code: str
    password: str = ""

class AdminLoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
async def publisher_login(req: LoginRequest):
    config = load_config()
    for pub in config['publishers']:
        if pub['unique_code'] == req.code:
            token = create_token(pub['publisher_id'])
            return {
                "token": token,
                "publisher_name": pub['publisher_name'],
                "publisher_id": pub['publisher_id']
            }
    raise HTTPException(status_code=404, detail="Invalid publisher code")

@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    config = load_config()
    admin = config.get('admin', {})
    if admin.get('username') == req.username:
        if not admin.get('password_hash') or verify_password(req.password, admin['password_hash']):
            token = create_token('admin')
            return {"token": token, "role": "admin"}
    raise HTTPException(status_code=401, detail="Invalid admin credentials")

# ============================================================
# DATA ENDPOINTS
# ============================================================
@app.get("/api/data/{unique_code}")
async def get_publisher_data(unique_code: str):
    file_path = DATA_DIR / f'{unique_code}.json'
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="No data found for this publisher code")
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.get("/api/admin/overview")
async def get_admin_overview():
    file_path = DATA_DIR / 'admin_overview.json'
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="No data available. Run refresh first.")
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.get("/api/admin/publishers")
async def list_publishers():
    config = load_config()
    publishers = []
    for pub in config['publishers']:
        publishers.append({
            'publisher_id': pub['publisher_id'],
            'publisher_name': pub['publisher_name'],
            'publisher_email': pub['publisher_email'],
            'unique_code': pub['unique_code'],
            'site_count': len(pub.get('sites', [])),
            'sites': pub.get('sites', [])
        })
    return {"publishers": publishers}

# ============================================================
# MARGIN MANAGEMENT ENDPOINTS
# ============================================================
class MarginUpdateRequest(BaseModel):
    publisher_id: str
    site_index: int
    margin_share: float  # 0.0 to 1.0

@app.post("/api/admin/update-margin")
async def update_margin(req: MarginUpdateRequest):
    """Update margin for a specific site under a publisher."""
    if req.margin_share < 0 or req.margin_share > 1:
        raise HTTPException(status_code=400, detail="Margin must be between 0 and 1")

    config = load_config()
    for pub in config['publishers']:
        if pub['publisher_id'] == req.publisher_id:
            if req.site_index < 0 or req.site_index >= len(pub['sites']):
                raise HTTPException(status_code=400, detail="Invalid site index")
            pub['sites'][req.site_index]['margin_share'] = req.margin_share
            save_config(config)
            return {
                "status": "success",
                "publisher_id": req.publisher_id,
                "site_index": req.site_index,
                "new_margin": req.margin_share,
                "site_name": pub['sites'][req.site_index]['site_name']
            }
    raise HTTPException(status_code=404, detail="Publisher not found")

@app.post("/api/admin/refresh")
async def refresh_gam_data():
    try:
        result = refresh_data()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# PUBLISHER MANAGEMENT ENDPOINTS
# ============================================================
class AddPublisherRequest(BaseModel):
    publisher_name: str
    publisher_email: str
    site_name: str
    ad_unit_id: str
    margin_share: float = 0.90

@app.post("/api/admin/add-publisher")
async def add_publisher(req: AddPublisherRequest):
    """Add a new publisher with one initial site."""
    config = load_config()
    pub_id = f"pub_{len(config['publishers']) + 1:03d}"
    unique_code = secrets.token_urlsafe(8)

    new_pub = {
        "publisher_id": pub_id,
        "unique_code": unique_code,
        "publisher_name": req.publisher_name,
        "publisher_email": req.publisher_email,
        "sites": [
            {
                "site_name": req.site_name,
                "ad_unit_id": req.ad_unit_id,
                "margin_share": req.margin_share
            }
        ]
    }
    config['publishers'].append(new_pub)
    save_config(config)
    return {"status": "success", "publisher_id": pub_id, "unique_code": unique_code}

class AddSiteRequest(BaseModel):
    publisher_id: str
    site_name: str
    ad_unit_id: str
    margin_share: float = 0.90

@app.post("/api/admin/add-site")
async def add_site(req: AddSiteRequest):
    """Add a new site to an existing publisher."""
    config = load_config()
    for pub in config['publishers']:
        if pub['publisher_id'] == req.publisher_id:
            pub['sites'].append({
                "site_name": req.site_name,
                "ad_unit_id": req.ad_unit_id,
                "margin_share": req.margin_share
            })
            save_config(config)
            return {"status": "success", "publisher_id": req.publisher_id, "site_name": req.site_name}
    raise HTTPException(status_code=404, detail="Publisher not found")

# ============================================================
# PAGE ENDPOINTS
# ============================================================
@app.get("/", response_class=HTMLResponse)
async def login_page():
    with open(BASE_DIR / 'static' / 'login.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.get("/dashboard", response_class=HTMLResponse)
async def publisher_dashboard():
    with open(BASE_DIR / 'static' / 'dashboard.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard():
    with open(BASE_DIR / 'static' / 'admin.html', 'r', encoding='utf-8') as f:
        return f.read()

if __name__ == '__main__':
    import uvicorn
    print("\n" + "=" * 50)
    print("  Xenon Ads Dashboard Server v2")
    print("  Starting on http://localhost:8000")
    print("=" * 50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
