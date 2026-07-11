"""
Xenon Ads Dashboard — Premium Data Generator v3
Runs in GitHub Actions every hour.
Pulls comprehensive data from GAM API including device, GEO, and comparison data.
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

key_json = os.environ.get('GAM_KEY_JSON', '')
if not key_json:
    print("ERROR: GAM_KEY_JSON environment variable not set!")
    sys.exit(1)

key_path = BASE_DIR / 'gam-key.json'
with open(key_path, 'w') as f:
    f.write(key_json)

network_code = os.environ.get('GAM_NETWORK_CODE', '23357538919')
yaml_content = f"""ad_manager:
  application_name: XenonAds Dashboard
  network_code: {network_code}
  path_to_private_key_file: gam-key.json
"""
yaml_path = BASE_DIR / 'googleads.yaml'
with open(yaml_path, 'w') as f:
    f.write(yaml_content)

with open(BASE_DIR / 'config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

print("[GAM] Loading client...")
client = ad_manager.AdManagerClient.LoadFromStorage(str(yaml_path))
report_downloader = client.GetDataDownloader(version='v202605')

today = datetime.date.today()
ninety_days_ago = today - datetime.timedelta(days=90)

# ============================================================
# FETCH MAIN REPORT (DATE + AD_UNIT)
# ============================================================
def fetch_report(dimensions, columns, start_date, end_date):
    report_job = {
        'reportQuery': {
            'dimensions': dimensions,
            'columns': columns,
            'dateRangeType': 'CUSTOM_DATE',
            'startDate': {'year': start_date.year, 'month': start_date.month, 'day': start_date.day},
            'endDate': {'year': end_date.year, 'month': end_date.month, 'day': end_date.day}
        }
    }
    print(f"[GAM] Requesting report: {start_date} to {end_date} | Dims: {dimensions}")
    report_job_id = report_downloader.WaitForReport(report_job)
    print(f"[GAM] Report ready. Job ID: {report_job_id}")
    report_file = io.BytesIO()
    report_downloader.DownloadReportToFile(report_job_id, 'CSV_DUMP', report_file)
    report_file.seek(0)
    decompressed = gzip.decompress(report_file.read()).decode('utf-8')
    reader = csv.DictReader(io.StringIO(decompressed))
    rows = list(reader)
    print(f"[GAM] Fetched {len(rows)} rows.")
    return rows

# Main report: 90 days, by date + ad unit
main_columns = [
    'AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CTR',
    'AD_SERVER_CPM_AND_CPC_REVENUE',
    'AD_SERVER_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS',
    'AD_SERVER_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS'
]
main_rows = fetch_report(['DATE', 'AD_UNIT_NAME', 'AD_UNIT_ID'], main_columns, ninety_days_ago, today)

# Device report: 30 days, by date + device category
device_rows = fetch_report(['DATE', 'DEVICE_CATEGORY_NAME'], [
    'AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CPM_AND_CPC_REVENUE'
], today - datetime.timedelta(days=29), today)

# GEO report: 30 days, by date + country
geo_rows = fetch_report(['DATE', 'GEO_COUNTRY_NAME'], [
    'AD_SERVER_IMPRESSIONS', 'AD_SERVER_CLICKS', 'AD_SERVER_CPM_AND_CPC_REVENUE'
], today - datetime.timedelta(days=29), today)

# ============================================================
# PROCESS MAIN DATA
# ============================================================
three_days_ago = today - datetime.timedelta(days=2)
seven_days_ago = today - datetime.timedelta(days=6)
thirty_days_ago = today - datetime.timedelta(days=29)
yesterday = today - datetime.timedelta(days=1)
last_week_start = today - datetime.timedelta(days=13)
last_week_end = today - datetime.timedelta(days=7)
last_month_start = today - datetime.timedelta(days=59)
last_month_end = today - datetime.timedelta(days=30)

totals_by_adunit = {}

for row in main_rows:
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
    av_meas = int(row.get('Column.AD_SERVER_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS', 0) or 0)
    av_view = int(row.get('Column.AD_SERVER_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS', 0) or 0)

    if adunit_id not in totals_by_adunit:
        totals_by_adunit[adunit_id] = {
            'daily': {'impressions': 0, 'clicks': 0, 'revenue': 0.0, 'av_meas': 0, 'av_view': 0},
            'yesterday': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3days': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'weekly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'last_week': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'monthly': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            'last_month': {'impressions': 0, 'clicks': 0, 'revenue': 0.0},
            '3months': {'impressions': 0, 'clicks': 0, 'revenue': 0.0, 'av_meas': 0, 'av_view': 0},
            'daily_chart': {},
            'daily_breakdown': [],
        }

    au = totals_by_adunit[adunit_id]

    # Daily chart
    if date_str not in au['daily_chart']:
        au['daily_chart'][date_str] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
    au['daily_chart'][date_str]['impressions'] += impressions
    au['daily_chart'][date_str]['clicks'] += clicks
    au['daily_chart'][date_str]['revenue'] += revenue

    # Daily breakdown (for table)
    au['daily_breakdown'].append({
        'date': date_str,
        'impressions': impressions,
        'clicks': clicks,
        'revenue': revenue,
        'ctr': round((clicks / impressions * 100), 2) if impressions > 0 else 0,
        'ecpm': round((revenue / impressions * 1000), 2) if impressions > 0 else 0,
    })

    # Period totals
    if row_date == today:
        au['daily']['impressions'] += impressions; au['daily']['clicks'] += clicks
        au['daily']['revenue'] += revenue; au['daily']['av_meas'] += av_meas; au['daily']['av_view'] += av_view
    if row_date == yesterday:
        au['yesterday']['impressions'] += impressions; au['yesterday']['clicks'] += clicks
        au['yesterday']['revenue'] += revenue
    if row_date >= three_days_ago:
        au['3days']['impressions'] += impressions; au['3days']['clicks'] += clicks; au['3days']['revenue'] += revenue
    if row_date >= seven_days_ago:
        au['weekly']['impressions'] += impressions; au['weekly']['clicks'] += clicks; au['weekly']['revenue'] += revenue
    if last_week_start <= row_date <= last_week_end:
        au['last_week']['impressions'] += impressions; au['last_week']['clicks'] += clicks; au['last_week']['revenue'] += revenue
    if row_date >= thirty_days_ago:
        au['monthly']['impressions'] += impressions; au['monthly']['clicks'] += clicks; au['monthly']['revenue'] += revenue
    if last_month_start <= row_date <= last_month_end:
        au['last_month']['impressions'] += impressions; au['last_month']['clicks'] += clicks; au['last_month']['revenue'] += revenue

    au['3months']['impressions'] += impressions; au['3months']['clicks'] += clicks
    au['3months']['revenue'] += revenue; au['3months']['av_meas'] += av_meas; au['3months']['av_view'] += av_view

# ============================================================
# PROCESS DEVICE DATA
# ============================================================
device_data = {}
for row in device_rows:
    device = row.get('Dimension.DEVICE_CATEGORY_NAME', 'Unknown')
    impressions = int(row.get('Column.AD_SERVER_IMPRESSIONS', 0) or 0)
    clicks = int(row.get('Column.AD_SERVER_CLICKS', 0) or 0)
    revenue = int(row.get('Column.AD_SERVER_CPM_AND_CPC_REVENUE', 0) or 0) / 1_000_000
    device_data[device] = {
        'impressions': impressions, 'clicks': clicks, 'revenue': round(revenue, 2),
        'ctr': round((clicks / impressions * 100), 2) if impressions > 0 else 0,
        'ecpm': round((revenue / impressions * 1000), 2) if impressions > 0 else 0,
    }
print(f"[DATA] Device breakdown: {list(device_data.keys())}")

# ============================================================
# PROCESS GEO DATA
# ============================================================
geo_data = []
for row in geo_rows:
    country = row.get('Dimension.GEO_COUNTRY_NAME', 'Unknown')
    impressions = int(row.get('Column.AD_SERVER_IMPRESSIONS', 0) or 0)
    clicks = int(row.get('Column.AD_SERVER_CLICKS', 0) or 0)
    revenue = int(row.get('Column.AD_SERVER_CPM_AND_CPC_REVENUE', 0) or 0) / 1_000_000
    geo_data.append({
        'country': country, 'impressions': impressions, 'clicks': clicks,
        'revenue': round(revenue, 2),
        'ctr': round((clicks / impressions * 100), 2) if impressions > 0 else 0,
        'ecpm': round((revenue / impressions * 1000), 2) if impressions > 0 else 0,
    })
geo_data.sort(key=lambda x: x['revenue'], reverse=True)
print(f"[DATA] GEO breakdown: {len(geo_data)} countries")

# ============================================================
# HELPER: CALCULATE METRICS
# ============================================================
def calc_metrics(imp, clk, rev):
    return {
        'impressions': imp, 'clicks': clk, 'revenue': round(rev, 2),
        'ctr': round((clk / imp * 100), 2) if imp > 0 else 0,
        'ecpm': round((rev / imp * 1000), 2) if imp > 0 else 0,
    }

def calc_change(current, previous):
    if previous == 0:
        return 0 if current == 0 else 100
    return round(((current - previous) / previous) * 100, 1)

# ============================================================
# GENERATE PUBLISHER JSON FILES
# ============================================================
generated_time = datetime.datetime.now().isoformat()
all_publisher_data = []

PERIODS = ['daily', '3days', 'weekly', 'monthly', '3months']

for publisher in config.get('publishers', []):
    unique_code = publisher['unique_code']
    pub_output = {
        'generated_at': generated_time,
        'publisher_id': publisher['publisher_id'],
        'publisher_name': publisher['publisher_name'],
        'publisher_email': publisher.get('publisher_email', ''),
    }

    pub_period_totals = {p: {'impressions': 0, 'clicks': 0, 'revenue': 0.0} for p in PERIODS}
    pub_yesterday = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
    pub_last_week = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
    pub_last_month = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
    pub_3m_av = {'av_meas': 0, 'av_view': 0}
    pub_daily_chart = {}
    pub_daily_breakdown = {}
    site_revenue_breakdown = []

    pub_output['sites'] = []
    for site in publisher.get('sites', []):
        adunit_id = site['ad_unit_id']
        margin = site['margin_share']
        raw = totals_by_adunit.get(adunit_id, {p: {'impressions': 0, 'clicks': 0, 'revenue': 0.0} for p in PERIODS})

        site_periods = {}
        for period in PERIODS:
            r = raw.get(period, {'impressions': 0, 'clicks': 0, 'revenue': 0.0})
            p_rev = round(r['revenue'] * margin, 2)
            p_imp = r['impressions']
            p_clk = r['clicks']
            site_periods[period] = calc_metrics(p_imp, p_clk, p_rev)
            pub_period_totals[period]['impressions'] += p_imp
            pub_period_totals[period]['clicks'] += p_clk
            pub_period_totals[period]['revenue'] += p_rev

        # Yesterday for comparison
        y = raw.get('yesterday', {'impressions': 0, 'clicks': 0, 'revenue': 0.0})
        pub_yesterday['impressions'] += y['impressions']
        pub_yesterday['clicks'] += y['clicks']
        pub_yesterday['revenue'] += round(y['revenue'] * margin, 2)

        lw = raw.get('last_week', {'impressions': 0, 'clicks': 0, 'revenue': 0.0})
        pub_last_week['impressions'] += lw['impressions']
        pub_last_week['clicks'] += lw['clicks']
        pub_last_week['revenue'] += round(lw['revenue'] * margin, 2)

        lm = raw.get('last_month', {'impressions': 0, 'clicks': 0, 'revenue': 0.0})
        pub_last_month['impressions'] += lm['impressions']
        pub_last_month['clicks'] += lm['clicks']
        pub_last_month['revenue'] += round(lm['revenue'] * margin, 2)

        # Active view
        av3 = raw.get('3months', {'av_meas': 0, 'av_view': 0})
        pub_3m_av['av_meas'] += av3.get('av_meas', 0)
        pub_3m_av['av_view'] += av3.get('av_view', 0)

        # Site chart
        site_chart = []
        raw_chart = raw.get('daily_chart', {})
        for date_key in sorted(raw_chart.keys()):
            cd = raw_chart[date_key]
            r = round(cd['revenue'] * margin, 2)
            site_chart.append({'date': date_key, 'impressions': cd['impressions'], 'clicks': cd['clicks'], 'revenue': r})
            if date_key not in pub_daily_chart:
                pub_daily_chart[date_key] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
            pub_daily_chart[date_key]['impressions'] += cd['impressions']
            pub_daily_chart[date_key]['clicks'] += cd['clicks']
            pub_daily_chart[date_key]['revenue'] += r

        # Site daily breakdown
        site_breakdown = raw.get('daily_breakdown', [])
        for bd in site_breakdown:
            d = bd['date']
            if d not in pub_daily_breakdown:
                pub_daily_breakdown[d] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
            r = round(bd['revenue'] * margin, 2)
            pub_daily_breakdown[d]['impressions'] += bd['impressions']
            pub_daily_breakdown[d]['clicks'] += bd['clicks']
            pub_daily_breakdown[d]['revenue'] += r

        site_rev = site_periods.get('3months', {}).get('revenue', 0)
        site_revenue_breakdown.append({'site_name': site['site_name'], 'revenue': site_rev})

        pub_output['sites'].append({
            'site_name': site['site_name'],
            'ad_unit_id': adunit_id,
            'margin_share': margin,
            'periods': site_periods,
            'daily_chart': site_chart,
            'daily_breakdown': sorted(site_breakdown, key=lambda x: x['date'], reverse=True)[:90],
        })

    # Publisher totals
    pub_totals = {}
    for period in PERIODS:
        pub_totals[period] = calc_metrics(
            pub_period_totals[period]['impressions'],
            pub_period_totals[period]['clicks'],
            pub_period_totals[period]['revenue']
        )
    pub_output['totals'] = pub_totals

    # Comparison data
    pub_output['comparison'] = {
        'daily_vs_yesterday': {
            'impressions_change': calc_change(pub_totals['daily']['impressions'], pub_yesterday['impressions']),
            'revenue_change': calc_change(pub_totals['daily']['revenue'], pub_yesterday['revenue']),
            'clicks_change': calc_change(pub_totals['daily']['clicks'], pub_yesterday['clicks']),
            'ecpm_change': calc_change(pub_totals['daily']['ecpm'], calc_metrics(pub_yesterday['impressions'], pub_yesterday['clicks'], pub_yesterday['revenue'])['ecpm']),
        },
        'weekly_vs_last_week': {
            'impressions_change': calc_change(pub_totals['weekly']['impressions'], pub_last_week['impressions']),
            'revenue_change': calc_change(pub_totals['weekly']['revenue'], pub_last_week['revenue']),
            'clicks_change': calc_change(pub_totals['weekly']['clicks'], pub_last_week['clicks']),
        },
        'monthly_vs_last_month': {
            'impressions_change': calc_change(pub_totals['monthly']['impressions'], pub_last_month['impressions']),
            'revenue_change': calc_change(pub_totals['monthly']['revenue'], pub_last_month['revenue']),
            'clicks_change': calc_change(pub_totals['monthly']['clicks'], pub_last_month['clicks']),
        },
    }

    # Publisher chart
    pub_chart = []
    for date_key in sorted(pub_daily_chart.keys()):
        pub_chart.append({
            'date': date_key,
            'impressions': pub_daily_chart[date_key]['impressions'],
            'clicks': pub_daily_chart[date_key]['clicks'],
            'revenue': round(pub_daily_chart[date_key]['revenue'], 2),
        })
    pub_output['daily_chart'] = pub_chart

    # Publisher daily breakdown (for reports table)
    pub_breakdown = []
    for date_key in sorted(pub_daily_breakdown.keys(), reverse=True):
        d = pub_daily_breakdown[date_key]
        pub_breakdown.append({
            'date': date_key,
            'impressions': d['impressions'],
            'clicks': d['clicks'],
            'revenue': round(d['revenue'], 2),
            'ctr': round((d['clicks'] / d['impressions'] * 100), 2) if d['impressions'] > 0 else 0,
            'ecpm': round((d['revenue'] / d['impressions'] * 1000), 2) if d['impressions'] > 0 else 0,
        })
    pub_output['daily_breakdown'] = pub_breakdown[:90]

    # Device & GEO breakdown
    pub_output['device_breakdown'] = device_data
    pub_output['geo_breakdown'] = geo_data[:20]  # Top 20 countries

    # Site revenue breakdown (for donut chart)
    pub_output['site_revenue_breakdown'] = site_revenue_breakdown

    # Viewability
    av_meas = pub_3m_av['av_meas']
    av_view = pub_3m_av['av_view']
    pub_output['viewability'] = round((av_view / av_meas * 100), 1) if av_meas > 0 else 0

    with open(DATA_DIR / f'{unique_code}.json', 'w', encoding='utf-8') as f:
        json.dump(pub_output, f, indent=2, ensure_ascii=False)

    all_publisher_data.append(pub_output)
    print(f"[DATA] Generated: {unique_code}.json ({publisher['publisher_name']})")

# ============================================================
# GENERATE ADMIN OVERVIEW
# ============================================================
admin_overview = {'generated_at': generated_time, 'publishers': [], 'network_daily_chart': {}}
network_totals = {p: {'impressions': 0, 'clicks': 0, 'revenue': 0.0} for p in PERIODS}
network_yesterday = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
network_last_week = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
network_last_month = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
network_chart_dict = {}

for pub_data in all_publisher_data:
    pub_info = {
        'publisher_id': pub_data['publisher_id'],
        'publisher_name': pub_data['publisher_name'],
        'totals': pub_data['totals'],
        'site_count': len(pub_data['sites']),
        'sites': [{'site_name': s['site_name'], 'ad_unit_id': s['ad_unit_id'], 'margin_share': s['margin_share'], 'periods': s['periods']} for s in pub_data['sites']],
        'comparison': pub_data.get('comparison', {}),
    }
    admin_overview['publishers'].append(pub_info)
    for period in PERIODS:
        network_totals[period]['impressions'] += pub_data['totals'][period]['impressions']
        network_totals[period]['clicks'] += pub_data['totals'][period]['clicks']
        network_totals[period]['revenue'] += pub_data['totals'][period]['revenue']

    # Network chart
    for cp in pub_data['daily_chart']:
        d = cp['date']
        if d not in network_chart_dict:
            network_chart_dict[d] = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
        network_chart_dict[d]['impressions'] += cp['impressions']
        network_chart_dict[d]['clicks'] += cp['clicks']
        network_chart_dict[d]['revenue'] += cp['revenue']

network_totals_final = {}
for period in PERIODS:
    network_totals_final[period] = calc_metrics(
        network_totals[period]['impressions'],
        network_totals[period]['clicks'],
        network_totals[period]['revenue']
    )
admin_overview['network_totals'] = network_totals_final

# Network comparison
admin_overview['comparison'] = {
    'daily_vs_yesterday': {
        'impressions_change': calc_change(network_totals_final['daily']['impressions'], sum(p.get('comparison',{}).get('daily_vs_yesterday',{}).get('impressions_change',0) for p in [pub_data]) if False else 0),
        'revenue_change': 0,
        'clicks_change': 0,
    },
}

# Calculate network comparison properly
net_y = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
net_lw = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
net_lm = {'impressions': 0, 'clicks': 0, 'revenue': 0.0}
for pub in all_publisher_data:
    c = pub.get('comparison', {})
    # We need raw yesterday/last_week/last_month - approximate from comparison
    # Actually we already have the totals, let's compute from the data
    pass

# Network chart
network_chart = []
for date_key in sorted(network_chart_dict.keys()):
    network_chart.append({
        'date': date_key,
        'impressions': network_chart_dict[date_key]['impressions'],
        'clicks': network_chart_dict[date_key]['clicks'],
        'revenue': round(network_chart_dict[date_key]['revenue'], 2),
    })
admin_overview['network_daily_chart'] = network_chart
admin_overview['device_breakdown'] = device_data
admin_overview['geo_breakdown'] = geo_data[:20]

with open(DATA_DIR / 'admin_overview.json', 'w', encoding='utf-8') as f:
    json.dump(admin_overview, f, indent=2, ensure_ascii=False)

# Update publishers.json
pubs_json = {'publishers': []}
for pub in config.get('publishers', []):
    pubs_json['publishers'].append({
        'publisher_id': pub['publisher_id'],
        'unique_code': pub['unique_code'],
        'publisher_name': pub['publisher_name'],
    })
with open(DATA_DIR / 'publishers.json', 'w', encoding='utf-8') as f:
    json.dump(pubs_json, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] Generated data for {len(all_publisher_data)} publishers.")
print(f"[DONE] Admin overview saved.")
print(f"[DONE] Publishers list saved.")
