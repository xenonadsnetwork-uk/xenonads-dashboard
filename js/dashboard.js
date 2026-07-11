// Publisher Dashboard — Clean Professional v5

let D = null;
let currentPeriod = 'monthly';
let charts = {};

(function checkAuth() {
    const role = localStorage.getItem('role');
    const code = localStorage.getItem('unique_code');
    if (!role || role !== 'publisher' || !code) { window.location.href = 'index.html'; return; }
    document.getElementById('pub-name').textContent = localStorage.getItem('publisher_name') || '';
    loadData();
})();

async function loadData() {
    const code = localStorage.getItem('unique_code');
    try {
        const res = await fetch(`data/${code}.json`);
        if (!res.ok) throw new Error('Failed');
        D = await res.json();
        renderAll();
    } catch (err) {
        document.getElementById('last-updated').textContent = 'No data available yet';
    }
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${page}`).classList.add('active');
    if (page === 'sites') renderSites();
    if (page === 'reports') renderReports();
    if (page === 'analytics') renderAnalytics();
    if (page === 'settings') renderSettings();
}

function switchPeriod(period) {
    currentPeriod = period;
    ['daily','3days','weekly','monthly','3months'].forEach(btn => {
        const el = document.getElementById(`btn-${btn}`);
        if (btn === period) { el.classList.add('period-btn-active'); el.classList.remove('text-gray-500'); }
        else { el.classList.remove('period-btn-active'); el.classList.add('text-gray-500'); }
    });
    if (D) { renderKPIs(); renderSites(); renderReports(); }
}

function fmtN(n) { if(n>=1e6)return(n/1e6).toFixed(2)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }
function fmtC(n) { if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K'; return '$'+n.toFixed(2); }
function trendArrow(val) {
    if (val > 0) return `<span class="trend-up text-xs font-medium flex items-center gap-0.5"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M5 15l7-7 7 7"/></svg>${val}%</span>`;
    if (val < 0) return `<span class="trend-down text-xs font-medium flex items-center gap-0.5"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M19 9l-7 7-7-7"/></svg>${Math.abs(val)}%</span>`;
    return `<span class="text-gray-400 text-xs font-medium">—</span>`;
}

function renderAll() {
    const gen = new Date(D.generated_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('last-updated').textContent = `Updated: ${gen}`;
    renderKPIs(); renderRevenueChart(); renderSiteDonut(); renderDeviceChart(); renderGeoList();
}

function renderKPIs() {
    if (!D) return;
    const t = D.totals[currentPeriod];
    const comp = D.comparison || {};
    let compKey = 'daily_vs_yesterday';
    if (currentPeriod === 'weekly') compKey = 'weekly_vs_last_week';
    if (currentPeriod === 'monthly') compKey = 'monthly_vs_last_month';
    const c = comp[compKey] || {};
    const cards = [
        { label:'Revenue', value:fmtC(t.revenue), change:c.revenue_change, color:'#059669' },
        { label:'Impressions', value:fmtN(t.impressions), change:c.impressions_change, color:'#2563eb' },
        { label:'eCPM', value:fmtC(t.ecpm), change:c.ecpm_change, color:'#7c3aed' },
        { label:'Clicks', value:fmtN(t.clicks), change:c.clicks_change, color:'#ea580c' },
    ];
    document.getElementById('kpi-cards').innerHTML = cards.map(c => `
        <div class="card p-5 card-hover">
            <div class="flex items-start justify-between mb-2">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">${c.label}</p>
                ${trendArrow(c.change || 0)}
            </div>
            <p class="text-2xl font-bold text-gray-900">${c.value}</p>
        </div>
    `).join('');
}

function renderRevenueChart() {
    if (!D || !D.daily_chart) return;
    const ctx = document.getElementById('revenue-chart').getContext('2d');
    const cd = D.daily_chart;
    if (charts.revenue) charts.revenue.destroy();
    const grad = ctx.createLinearGradient(0,0,0,280);
    grad.addColorStop(0,'rgba(37,99,235,0.1)'); grad.addColorStop(1,'rgba(37,99,235,0)');
    charts.revenue = new Chart(ctx, {
        type:'line',
        data:{labels:cd.map(d=>new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
            datasets:[
                {label:'Revenue ($)',data:cd.map(d=>d.revenue),borderColor:'#2563eb',backgroundColor:grad,fill:true,tension:0.3,borderWidth:2,pointRadius:0,pointHoverRadius:5,yAxisID:'y'},
                {label:'Impressions',data:cd.map(d=>d.impressions),borderColor:'#059669',backgroundColor:'transparent',tension:0.3,borderWidth:2,pointRadius:0,pointHoverRadius:5,yAxisID:'y1'}
            ]},
        options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
            plugins:{legend:{position:'top',align:'end',labels:{usePointStyle:true,pointStyle:'circle',padding:15,font:{size:11},color:'#6b7280'}},
                tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,usePointStyle:true}},
            scales:{x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10},maxTicksLimit:8}},
                y:{position:'left',grid:{color:'#f3f4f6'},ticks:{color:'#9ca3af',font:{size:10},callback:v=>'$'+v}},
                y1:{position:'right',grid:{display:false},ticks:{color:'#9ca3af',font:{size:10},callback:v=>{if(v>=1e6)return(v/1e6).toFixed(1)+'M';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return v}}}}}
    });
}

function renderSiteDonut() {
    if (!D || !D.site_revenue_breakdown) return;
    const ctx = document.getElementById('site-donut').getContext('2d');
    const data = D.site_revenue_breakdown;
    if (charts.donut) charts.donut.destroy();
    const colors = ['#2563eb','#059669','#7c3aed','#ea580c','#0891b2','#ca8a04','#dc2626','#db2777'];
    charts.donut = new Chart(ctx, {
        type:'doughnut',
        data:{labels:data.map(d=>d.site_name),datasets:[{data:data.map(d=>d.revenue),backgroundColor:colors,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:12,font:{size:11},color:'#6b7280'}},
                tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
    });
}

function renderDeviceChart() {
    if (!D || !D.device_breakdown) return;
    const ctx = document.getElementById('device-chart').getContext('2d');
    const data = D.device_breakdown;
    const labels = Object.keys(data);
    if (charts.device) charts.device.destroy();
    charts.device = new Chart(ctx, {
        type:'bar',
        data:{labels,datasets:[{data:labels.map(l=>data[l].impressions),backgroundColor:['#2563eb','#059669','#7c3aed'],borderWidth:0,borderRadius:6}]},
        options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:c=>fmtN(c.raw)+' impressions'}}},
            scales:{x:{grid:{display:false},ticks:{color:'#6b7280',font:{size:11}}},y:{grid:{color:'#f3f4f6'},ticks:{color:'#9ca3af',font:{size:10},callback:v=>fmtN(v)}}}}
    });
}

function renderGeoList() {
    if (!D || !D.geo_breakdown) return;
    const el = document.getElementById('geo-list');
    const data = D.geo_breakdown.slice(0, 8);
    const maxRev = data.length > 0 ? data[0].revenue : 1;
    el.innerHTML = data.map(g => `
        <div class="flex items-center gap-3">
            <span class="text-sm text-gray-700 w-28 truncate">${g.country}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div class="bg-gray-900 h-full rounded-full" style="width:${(g.revenue/maxRev*100)}%"></div>
            </div>
            <span class="text-sm text-gray-500 font-mono w-14 text-right">${fmtC(g.revenue)}</span>
        </div>
    `).join('');
}

function renderSites() {
    if (!D || !D.sites) return;
    const el = document.getElementById('sites-cards');
    el.innerHTML = D.sites.map(site => {
        const p = site.periods[currentPeriod];
        const chartId = `site-chart-${site.ad_unit_id}`;
        return `
        <div class="card p-5 card-hover">
            <div class="flex items-center justify-between mb-4">
                <div><h3 class="text-base font-semibold text-gray-900">${site.site_name}</h3><p class="text-xs text-gray-400 mt-0.5">Ad Unit: ${site.ad_unit_id}</p></div>
                <div class="text-right"><p class="text-xl font-bold text-gray-900">${fmtC(p.revenue)}</p><p class="text-xs text-gray-400">Revenue</p></div>
            </div>
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-400">Impressions</p><p class="text-sm font-semibold text-gray-900 mt-0.5">${fmtN(p.impressions)}</p></div>
                <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-400">Clicks</p><p class="text-sm font-semibold text-gray-900 mt-0.5">${fmtN(p.clicks)}</p></div>
                <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-400">eCPM</p><p class="text-sm font-semibold text-gray-900 mt-0.5">${fmtC(p.ecpm)}</p></div>
            </div>
            <div style="height:100px"><canvas id="${chartId}"></canvas></div>
        </div>`;
    }).join('');
    D.sites.forEach(site => {
        if (!site.daily_chart || site.daily_chart.length === 0) return;
        const ctx = document.getElementById(`site-chart-${site.ad_unit_id}`);
        if (!ctx) return;
        const cd = site.daily_chart;
        new Chart(ctx.getContext('2d'), {
            type:'line',
            data:{labels:cd.map(d=>new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
                datasets:[{data:cd.map(d=>d.revenue),borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.08)',fill:true,tension:0.3,borderWidth:1.5,pointRadius:0}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:8,cornerRadius:6,callbacks:{label:c=>fmtC(c.raw)}}},
                scales:{x:{display:false},y:{display:false}}}
        });
    });
}

function renderReports() {
    if (!D || !D.daily_breakdown) return;
    document.getElementById('reports-table').innerHTML = D.daily_breakdown.map(d => `
        <tr class="hover:bg-gray-50">
            <td class="px-5 py-3 text-sm text-gray-900">${d.date}</td>
            <td class="px-5 py-3 text-sm text-right text-gray-600 font-mono">${fmtN(d.impressions)}</td>
            <td class="px-5 py-3 text-sm text-right text-gray-600 font-mono">${fmtN(d.clicks)}</td>
            <td class="px-5 py-3 text-sm text-right text-gray-600 font-mono">${d.ctr}%</td>
            <td class="px-5 py-3 text-sm text-right text-gray-600 font-mono">${fmtC(d.ecpm)}</td>
            <td class="px-5 py-3 text-sm text-right font-semibold text-gray-900 font-mono">${fmtC(d.revenue)}</td>
        </tr>
    `).join('');
}

function renderAnalytics() {
    if (!D) return;
    if (D.device_breakdown) {
        const ctx = document.getElementById('analytics-device').getContext('2d');
        const data = D.device_breakdown;
        const labels = Object.keys(data);
        if (charts.analyticsDevice) charts.analyticsDevice.destroy();
        charts.analyticsDevice = new Chart(ctx, {
            type:'doughnut',
            data:{labels,datasets:[{data:labels.map(l=>data[l].revenue),backgroundColor:['#2563eb','#059669','#7c3aed'],borderWidth:0}]},
            options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
                plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:12,font:{size:11},color:'#6b7280'}},
                    tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
        });
    }
    if (D.geo_breakdown) {
        document.getElementById('geo-table').innerHTML = D.geo_breakdown.map(g => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-2.5 text-sm text-gray-900">${g.country}</td>
                <td class="px-4 py-2.5 text-sm text-right text-gray-600 font-mono">${fmtN(g.impressions)}</td>
                <td class="px-4 py-2.5 text-sm text-right font-semibold text-gray-900 font-mono">${fmtC(g.revenue)}</td>
                <td class="px-4 py-2.5 text-sm text-right text-gray-600 font-mono">${fmtC(g.ecpm)}</td>
            </tr>
        `).join('');
    }
    document.getElementById('viewability-score').textContent = (D.viewability || 0) + '%';
}

function renderSettings() {
    if (!D) return;
    document.getElementById('settings-name').textContent = D.publisher_name;
    document.getElementById('settings-id').textContent = D.publisher_id;
    document.getElementById('settings-code').textContent = localStorage.getItem('unique_code') || '';
    document.getElementById('settings-sites').textContent = D.sites.length;
}

function exportCSV() {
    if (!D || !D.daily_breakdown) return;
    let csv = 'Date,Impressions,Clicks,CTR,eCPM,Revenue\n';
    D.daily_breakdown.forEach(d => { csv += `${d.date},${d.impressions},${d.clicks},${d.ctr}%,${d.ecpm},${d.revenue}\n`; });
    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`xenonads-report.csv`; a.click();
    URL.revokeObjectURL(url);
}

function logout() { localStorage.clear(); window.location.href='index.html'; }
