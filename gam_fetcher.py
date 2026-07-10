"""
GAM Data Fetcher — Google Ad Manager theke report data pull kore.
Ei module sob API call handle kore: connection, report request, data parse.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import datetime
import gzip
import csv
import io
import json
from googleads import ad_manager


class GAMFetcher:
    """GAM API theke reporting data fetch korar class."""

    def __init__(self, yaml_path='googleads.yaml'):
        """GAM client load kore."""
        print("[GAM] Loading GAM client...")
        self.client = ad_manager.AdManagerClient.LoadFromStorage(yaml_path)
        self.network_code = '23357538919'
        print("[GAM] Client loaded successfully.")

    def fetch_report(self, start_date, end_date, dimensions=None, columns=None):
        """
        GAM theke report data fetch kore.
        
        Args:
            start_date: datetime.date
            end_date: datetime.date
            dimensions: list of dimension names (default: DATE + AD_UNIT_NAME)
            columns: list of column names (default: impressions, clicks, revenue)
        
        Returns:
            list of dict rows
        """
        if dimensions is None:
            dimensions = ['DATE', 'AD_UNIT_NAME', 'AD_UNIT_ID']
        if columns is None:
            columns = [
                'AD_SERVER_IMPRESSIONS',
                'AD_SERVER_CLICKS',
                'AD_SERVER_CTR',
                'AD_SERVER_CPM_AND_CPC_REVENUE'
            ]

        report_downloader = self.client.GetDataDownloader(version='v202605')

        report_job = {
            'reportQuery': {
                'dimensions': dimensions,
                'columns': columns,
                'dateRangeType': 'CUSTOM_DATE',
                'startDate': {
                    'year': start_date.year,
                    'month': start_date.month,
                    'day': start_date.day
                },
                'endDate': {
                    'year': end_date.year,
                    'month': end_date.month,
                    'day': end_date.day
                }
            }
        }

        print(f"[GAM] Requesting report: {start_date} to {end_date}...")
        report_job_id = report_downloader.WaitForReport(report_job)
        print(f"[GAM] Report ready. Job ID: {report_job_id}")

        # Download to memory
        report_file = io.BytesIO()
        report_downloader.DownloadReportToFile(report_job_id, 'CSV_DUMP', report_file)
        report_file.seek(0)

        # Decompress + parse
        decompressed = gzip.decompress(report_file.read()).decode('utf-8')
        reader = csv.DictReader(io.StringIO(decompressed))
        rows = list(reader)

        print(f"[GAM] Fetched {len(rows)} rows.")
        return rows

    def fetch_all_ad_units(self):
        """GAM theke sob ad unit er list fetch kore."""
        inventory_service = self.client.GetService('InventoryService')
        statement = ad_manager.StatementBuilder(version='v202605')

        ad_units = []
        while True:
            response = inventory_service.getAdUnitsByStatement(statement.ToStatement())
            if 'results' in response and len(response['results']):
                for au in response['results']:
                    ad_units.append({
                        'name': au['name'],
                        'id': au['id']
                    })
                statement.offset += statement.limit
            else:
                break

        return ad_units


# Test run
if __name__ == '__main__':
    fetcher = GAMFetcher()

    print("\n--- Ad Units ---")
    units = fetcher.fetch_all_ad_units()
    for u in units:
        print(f"  {u['name']:<40} | ID: {u['id']}")

    print("\n--- Last 7 Days Report ---")
    today = datetime.date.today()
    week_ago = today - datetime.timedelta(days=7)
    rows = fetcher.fetch_report(week_ago, today)

    if rows:
        print(f"  Columns: {list(rows[0].keys())}")
        for i, row in enumerate(rows[:5]):
            print(f"  Row {i}: {row}")
        if len(rows) > 5:
            print(f"  ... ({len(rows) - 5} more rows)")
    else:
        print("  No data (expected for fresh account with no traffic yet)")
