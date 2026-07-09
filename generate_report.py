import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import datetime
import gzip
import csv
import io
from googleads import ad_manager

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

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

client = ad_manager.AdManagerClient.LoadFromStorage('googleads.yaml')
report_downloader = client.GetDataDownloader(version='v202605')

today = datetime.date.today()
ninety_days_ago = today - datetime.timedelta(days=90)

report_job = {
    'reportQuery': {
        'dimensions': ['DATE', 'AD_UNIT_NAME', 'AD_UNIT_ID'],
        'columns': ['AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CTR', 'AD_SERVER_CPM_AND_CPC_REVENUE'],
        'dateRangeType': 'CUSTOM_DATE',
        'startDate': {'year': ninety_days_ago.year, 'month': ninety_days_ago.month, 'day': ninety_days_ago.day},
        'endDate': {'year': today.year, 'month': today.month, 'day': today.day}
    }
}

print("Fetching 90 days report from GAM...")
report_job_id = report_downloader.WaitForReport(report_job)

report_file = io.BytesIO()
report_downloader.DownloadReportToFile(report_job_id, 'CSV_DUMP', report_file)
report_file.seek(0)
decompressed = gzip.decompress(report_file.read()).decode('utf-8')

reader = csv.DictReader(io.StringIO(decompressed))
raw_rows = list(reader)
print(f"Fetched {len(raw_rows)} rows from GAM.")

# বিভিন্ন টাইমরেঞ্জের ডেট ক্যালকুলেশন
three_days_ago = today - datetime.timedelta(days=2)
seven_days_ago = today - datetime.timedelta(days=6)
thirty_days_ago = today - datetime.timedelta(days=29)

totals_by_adunit = {}

for row in raw_rows:
    adunit_id = row.get('Dimension.AD_UNIT_ID', '')
    if not adunit_id: continue
    
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
            '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
        }

    # টাইম রেঞ্জ অনুযায়ী ডেটা পুশ করা
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

os.makedirs('data', exist_ok=True)
generated_time = datetime.datetime.now().isoformat()

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

        raw_data = totals_by_adunit.get(adunit_id, {
            '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
        })

        site_periods = {}
        for period in ['3days', 'weekly', 'monthly', '3months']:
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

        pub_output['sites'].append({
            'site_name': site['site_name'],
            'periods': site_periods
        })
        
    file_path = f'data/{unique_code}.json'
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(pub_output, f, indent=2, ensure_ascii=False)

print("All advanced reports generated successfully!")
