"""
Xenon Ads Dashboard — GAM Data Generator
Runs in GitHub Actions every hour.
Pulls data from GAM API and generates static JSON files for the dashboard.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import datetime
import gzip
import csv
import io
from pathlib import Path
from googleads import ad_manager

# ============================================================
# SETUP
# ============================================================
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

# Write gam-key.json from environment variable
key_json = os.environ.get('GAM_KEY_JSON', '')
if not key_json:
    print("ERROR: GAM_KEY_JSON environment variable not set!")
    sys.exit(1)

key_path = BASE_DIR / 'gam-key.json'
with open(key_path, 'w') as f:
    f.write(key_json)

# Write googleads.yaml
network_code = os.environ.get('GAM_NETWORK_CODE', '23357538919')
yaml_content = f"""ad_manager:
  application_name: XenonAds Dashboard
  network_code: {network_code}
  path_to_private_key_file: gam-key.json
"""
yaml_path = BASE_DIR / 'googleads.yaml'
with open(yaml_path, 'w') as f:
    f.write(yaml_content)

# Load config
config_path = BASE_DIR / 'config.json'
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

# ============================================================
# FETCH GAM DATA
# ============================================================
print("[GAM] Loading client...")
client = ad_manager.AdManagerClient.LoadFromStorage(str(yaml_path))
report_downloader = client.GetDataDownloader(version='v202605')

today = datetime.date.today()
ninety_days_ago = today - datetime.timedelta(days=90)

report_job = {
    'reportQuery': {
        'dimensions': ['DATE', 'AD_UNIT_NAME', 'AD_UNIT_ID'],
        'columns': [
            'AD_SERVER_IMPRESSIONS',
            'AD_SERVER_CLICKS',
            'AD_SERVER_CTR',
            'AD_SERVER_CPM_AND_CPC_REVENUE'
        ],
        'dateRangeType': 'CUSTOM_DATE',
        'startDate': {
            'year': ninety_days_ago.year,
            'month': ninety_days_ago.month,
            'day': ninety_days_ago.day
        },
        'endDate': {
            'year': today.year,
            'month': today.month,
            'day': today.day
        }
    }
}

print(f"[GAM] Requesting report: {ninety_days_ago} to {today}...")
report_job_id = report_downloader.WaitForReport(report_job)
print(f"[GAM] Report ready. Job ID: {report_job_id}")

report_file = io.BytesIO()
report_downloader.DownloadReportToFile(report_job_id, 'CSV_DUMP', report_file)
report_file.seek(0)
decompressed = gzip.decompress(report_file.read()).decode('utf-8')
reader = csv.DictReader(io.StringIO(decompressed))
rows = list(reader)
print(f"[GAM] Fetched {len(rows)} rows.")

# ============================================================
# PROCESS DATA
# ============================================================
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

    # Daily chart
    if date_str not in totals_by_adunit[adunit_id]['daily_chart']:
        totals_by_adunit[adunit_id]['daily_chart'][date_str] = {
            'impressions': 0, 'clicks': 0, 'revenue': 0.0
        }
    totals_by_adunit[adunit_id]['daily_chart'][date_str]['impressions'] += impressions
    totals_by_adunit[adunit_id]['daily_chart'][date_str]['clicks'] += clicks
    totals_by_adunit[adunit_id]['daily_chart'][date_str]['revenue'] += revenue

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

# ============================================================
# GENERATE PUBLISHER JSON FILES
# ============================================================
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
                'impressions': p_imp, 'clicks': p_clk,
                'revenue': p_rev, 'ctr': p_ctr, 'ecpm': p_ecpm
            }
            pub_totals[period]['impressions'] += p_imp
            pub_totals[period]['clicks'] += p_clk
            pub_totals[period]['revenue'] += p_rev

        # Site chart
        site_chart = []
        for date_key in sorted(raw_data['daily_chart'].keys()):
            cd = raw_data['daily_chart'][date_key]
            site_chart.append({
                'date': date_key,
                'impressions': cd['impressions'],
                'clicks': cd['clicks'],
                'revenue': round(cd['revenue'] * margin, 2)
            })
            if date_key not in pub_daily_chart:
                pub_daily_chart[date_key] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
            pub_daily_chart[date_key]['impressions'] += cd['impressions']
            pub_daily_chart[date_key]['clicks'] += cd['clicks']
            pub_daily_chart[date_key]['revenue'] += round(cd['revenue'] * margin, 2)

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
            'impressions': p_imp, 'clicks': p_clk,
            'revenue': p_rev, 'ctr': p_ctr, 'ecpm': p_ecpm
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
    print(f"[DATA] Generated: {unique_code}.json ({publisher['publisher_name']})")

# ============================================================
# GENERATE ADMIN OVERVIEW
# ============================================================
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

    for cp in pub_data['daily_chart']:
        d = cp['date']
        if d not in network_chart_dict:
            network_chart_dict[d] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
        network_chart_dict[d]['impressions'] += cp['impressions']
        network_chart_dict[d]['clicks'] += cp['clicks']
        network_chart_dict[d]['revenue'] += cp['revenue']

network_totals_final = {}
for period in ['daily', '3days', 'weekly', 'monthly', '3months']:
    p_imp = network_totals[period]['impressions']
    p_clk = network_totals[period]['clicks']
    p_rev = round(network_totals[period]['revenue'], 2)
    p_ctr = round((p_clk / p_imp * 100), 2) if p_imp > 0 else 0
    p_ecpm = round((p_rev / p_imp * 1000), 2) if p_imp > 0 else 0
    network_totals_final[period] = {
        'impressions': p_imp, 'clicks': p_clk,
        'revenue': p_rev, 'ctr': p_ctr, 'ecpm': p_ecpm
    }

admin_overview['network_totals'] = network_totals_final

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

print(f"\n[DONE] Generated data for {len(all_publisher_data)} publishers.")
print(f"[DONE] Admin overview saved.")
