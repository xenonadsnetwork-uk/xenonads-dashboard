import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import datetime
import gzip
import csv
import io
from googleads import ad_manager

# GitHub Secrets থেকে credentials সেটআপ করা
if os.environ.get('GAM_KEY_JSON'):
    with open('gam-key.json', 'w', encoding='utf-8') as f:
        f.write(os.environ['GAM_KEY_JSON'])

    yaml_content = f"""ad_manager:
  application_name: XenonAds Dashboard
  network_code: {os.environ['GAM_NETWORK_CODE']}
  path_to_private_key_file: gam-key.json
"""
    with open('googleads.yaml', 'w', encoding='utf-8') as f:
        f.write(yaml_content)

# নতুন স্ট্রাকচারের config.json লোড করা
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

client = ad_manager.AdManagerClient.LoadFromStorage('googleads.yaml')
report_downloader = client.GetDataDownloader(version='v202605')

today = datetime.date.today()
week_ago = today - datetime.timedelta(days=7)

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

totals_by_adunit = {}

# পুরো নেটওয়ার্কের রিপোর্ট একবারে প্রসেস করা (Highly Efficient)
for row in raw_rows:
    adunit_id = row.get('Dimension.AD_UNIT_ID', '')
    impressions = int(row.get('Column.AD_SERVER_IMPRESSIONS', 0) or 0)
    clicks = int(row.get('Column.AD_SERVER_CLICKS', 0) or 0)
    revenue_micros = int(row.get('Column.AD_SERVER_CPM_AND_CPC_REVENUE', 0) or 0)
    revenue = revenue_micros / 1_000_000

    if adunit_id not in totals_by_adunit:
        totals_by_adunit[adunit_id] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}

    totals_by_adunit[adunit_id]['impressions'] += impressions
    totals_by_adunit[adunit_id]['clicks'] += clicks
    totals_by_adunit[adunit_id]['revenue'] += revenue

# ডেটা রাখার জন্য 'data' ফোল্ডার তৈরি করা (যদি না থাকে)
os.makedirs('data', exist_ok=True)
generated_time = datetime.datetime.now().isoformat()

# প্রতিটা পাবলিশারের জন্য আলাদা ফাইল তৈরি (Data Isolation)
for publisher in config.get('publishers', []):
    unique_code = publisher['unique_code']
    pub_output = {
        'generated_at': generated_time,
        'publisher_name': publisher['publisher_name'],
        'sites': []
    }
    
    for site in publisher.get('sites', []):
        adunit_id = site['ad_unit_id']
        margin = site['margin_share']

        raw = totals_by_adunit.get(adunit_id, {'impressions': 0, 'clicks': 0, 'revenue': 0.0})

        final_revenue = round(raw['revenue'] * margin, 2)
        ctr = round((raw['clicks'] / raw['impressions'] * 100), 2) if raw['impressions'] > 0 else 0
        ecpm = round((final_revenue / raw['impressions'] * 1000), 2) if raw['impressions'] > 0 else 0

        pub_output['sites'].append({
            'site_name': site['site_name'],
            'impressions': raw['impressions'],
            'clicks': raw['clicks'],
            'revenue': final_revenue,
            'ctr': ctr,
            'ecpm': ecpm
        })
        
    # পাবলিশারের নিজস্ব সিক্রেট কোড দিয়ে ফাইল রাইট করা
    file_path = f'data/{unique_code}.json'
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(pub_output, f, indent=2, ensure_ascii=False)
    print(f"Saved isolated data for {publisher['publisher_name']} to {file_path}")

print("All reports generated successfully!")
