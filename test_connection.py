import sys
sys.stdout.reconfigure(encoding='utf-8')

from googleads import ad_manager

print("1. Loading GAM client from googleads.yaml...")
client = ad_manager.AdManagerClient.LoadFromStorage('googleads.yaml')

print("2. Connecting to NetworkService...")
network_service = client.GetService('NetworkService')
current_network = network_service.getCurrentNetwork()

print("3. CONNECTION SUCCESSFUL!")
print(f"   Network Name: {current_network['displayName']}")
print(f"   Network Code: {current_network['networkCode']}")
print(f"   Currency:     {current_network['currencyCode']}")
print(f"   Time Zone:    {current_network['timeZone']}")

print("\n4. Fetching ad units from InventoryService...")
inventory_service = client.GetService('InventoryService')
statement = ad_manager.StatementBuilder(version='v202605')

found_any = False
ad_units = []
while True:
    response = inventory_service.getAdUnitsByStatement(statement.ToStatement())
    if 'results' in response and len(response['results']):
        found_any = True
        for ad_unit in response['results']:
            parent_id = ad_unit.parentId if hasattr(ad_unit, 'parentId') else 'N/A'
            ad_units.append({
                'name': ad_unit['name'],
                'id': ad_unit['id'],
                'parent_id': parent_id
            })
            print(f"   Ad Unit: {ad_unit['name']:<40} | ID: {ad_unit['id']}")
        statement.offset += statement.limit
    else:
        break

if not found_any:
    print("   No ad units found. This is expected for a fresh GAM account.")
else:
    print(f"\n   Total ad units found: {len(ad_units)}")

print("\n5. Test complete. GAM API is working correctly!")
