import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import datetime
import gzip
import csv
import io
from googleads import ad_manager

# ---------- Config লোড করা ----------
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# ---------- GAM কানেকশন ----------
client = ad_manager.AdManagerClient.LoadFromStorage('googleads.yaml')
report_downloader = client.GetDataDownloader(version='v202605')

today = datetime.date.today()
week_ago = today - datetime.timedelta(days=7)

# ---------- একবারেই সব ad unit এর ডেটা টানা (efficient) ----------
report_job = {
    'reportQuery': {
        'dimensions': ['DATE', 'AD_UNIT_NAME', 'AD_UNIT_ID'],
        'columns': ['AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CTR', 'AD_SERVER_CPM_AND_CPC_REVENUE'],
        'dateRangeType': 'CUSTOM_DATE',
        'startDate': {'year': week_ago.year, 'month': week_ago.month, 'day': week_ago.day},
        'endDate': {'year': today.year, 'month': today.month, 'day': today.day}
    }
}

print("Fetching report from GAM...")
report_job_id = report_downloader.WaitForReport(report_job)

report_file = io.BytesIO()
report_downloader.DownloadReportToFile(report_job_id, 'CSV_DUMP', report_file)
report_file.seek(0)
decompressed = gzip.decompress(report_file.read()).decode('utf-8')

reader = csv.DictReader(io.StringIO(decompressed))
raw_rows = list(reader)
print(f"Fetched {len(raw_rows)} rows from GAM.")

# ---------- Ad unit ID অনুযায়ী রেভিনিউ/ইমপ্রেশন যোগ করা ----------
totals_by_adunit = {}

for row in raw_rows:
    adunit_id = row.get('Dimension.AD_UNIT_ID', '')
    impressions = int(row.get('Column.AD_SERVER_IMPRESSIONS', 0) or 0)
    clicks = int(row.get('Column.AD_SERVER_CLICKS', 0) or 0)
    revenue_micros = int(row.get('Column.AD_SERVER_CPM_AND_CPC_REVENUE', 0) or 0)
    revenue = revenue_micros / 1_000_000  # GAM revenue micros এ আসে, তাই ভাগ করতে হয়

    if adunit_id not in totals_by_adunit:
        totals_by_adunit[adunit_id] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}

    totals_by_adunit[adunit_id]['impressions'] += impressions
    totals_by_adunit[adunit_id]['clicks'] += clicks
    totals_by_adunit[adunit_id]['revenue'] += revenue

# ---------- Config অনুযায়ী প্রতিটা সাইটের জন্য margin apply করে ফাইনাল ডেটা বানানো ----------
output = {'generated_at': datetime.datetime.now().isoformat(), 'sites': []}

for site in config['sites']:
    adunit_id = site['ad_unit_id']
    margin = site['margin_share']

    raw = totals_by_adunit.get(adunit_id, {'impressions': 0, 'clicks': 0, 'revenue': 0.0})

    final_revenue = round(raw['revenue'] * margin, 2)
    ctr = round((raw['clicks'] / raw['impressions'] * 100), 2) if raw['impressions'] > 0 else 0
    ecpm = round((final_revenue / raw['impressions'] * 1000), 2) if raw['impressions'] > 0 else 0

    output['sites'].append({
        'publisher_name': site['publisher_name'],
        'site_name': site['site_name'],
        'impressions': raw['impressions'],
        'clicks': raw['clicks'],
        'revenue': final_revenue,
        'ctr': ctr,
        'ecpm': ecpm
    })

# ---------- JSON ফাইলে সেভ ----------
with open('dashboard_data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("Done! Data saved to dashboard_data.json")