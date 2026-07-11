// Publisher Dashboard — Premium v3 with sidebar, charts, analytics

let D = null; // publisher data
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

// ============================================
// NAVIGATION
// ============================================
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${page}`).classList.add('active');
    // Render page-specific content
    if (page === 'sites') renderSites();
    if (page === 'reports') renderReports();
    if (page === 'analytics') renderAnalytics();
    if (page === 'settings') renderSettings();
}

// ============================================
// PERIOD SWITCHING
// ============================================
function switchPeriod(period) {
    currentPeriod = period;
    ['daily','3days','weekly','monthly','3months'].forEach(btn => {
        const el = document.getElementById(`btn-${btn}`);
        if (btn === period) { el.classList.add('period-btn-active'); el.classList.remove('text-gray-500'); }
        else { el.classList.remove('period-btn-active'); el.classList.add('text-gray-500'); }
    });
    if (D) { renderKPIs(); renderSites(); renderReports(); }
}

// ============================================
// FORMATTERS
// ============================================
function fmtN(n) { if(n>=1e6)return(n/1e6).toFixed(2)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }
function fmtC(n) { if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K'; return '$'+n.toFixed(2); }
function trendArrow(val) {
    if (val > 0) return `<span class="trend-up flex items-center gap-0.5 text-xs font-semibold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>${val}%</span>`;
    if (val < 0) return `<span class="trend-down flex items-center gap-0.5 text-xs font-semibold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>${Math.abs(val)}%</span>`;
    return `<span class="text-gray-500 text-xs font-semibold">0%</span>`;
}

// ============================================
// RENDER ALL
// ============================================
function renderAll() {
    const gen = new Date(D.generated_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('last-updated').textContent = `Last updated: ${gen}`;
    renderKPIs();
    renderRevenueChart();
    renderSiteDonut();
    renderDeviceChart();
    renderGeoList();
}

// ============================================
// KPI CARDS WITH TRENDS
// ============================================
function renderKPIs() {
    if (!D) return;
    const t = D.totals[currentPeriod];
    const comp = D.comparison || {};
    let compKey = 'daily_vs_yesterday';
    if (currentPeriod === 'weekly') compKey = 'weekly_vs_last_week';
    if (currentPeriod === 'monthly') compKey = 'monthly_vs_last_month';
    const c = comp[compKey] || {};

    const cards = [
        { label:'Revenue', value:fmtC(t.revenue), change:c.revenue_change, icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1', bg:'bg-green-500/10', text:'text-green-400' },
        { label:'Impressions', value:fmtN(t.impressions), change:c.impressions_change, icon:'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', bg:'bg-blue-500/10', text:'text-blue-400' },
        { label:'eCPM', value:fmtC(t.ecpm), change:c.ecpm_change, icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', bg:'bg-purple-500/10', text:'text-purple-400' },
        { label:'Clicks', value:fmtN(t.clicks), change:c.clicks_change, icon:'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5', bg:'bg-orange-500/10', text:'text-orange-400' },
    ];

    document.getElementById('kpi-cards').innerHTML = cards.map(c => `
        <div class="card p-6 card-hover">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center">
                    <svg class="w-5 h-5 ${c.text}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${c.icon}"/></svg>
                </div>
                ${trendArrow(c.change || 0)}
            </div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${c.label}</p>
            <p class="text-2xl font-black text-white mt-1">${c.value}</p>
        </div>
    `).join('');
}

// ============================================
// REVENUE CHART
// ============================================
function renderRevenueChart() {
    if (!D || !D.daily_chart) return;
    const ctx = document.getElementById('revenue-chart').getContext('2d');
    const cd = D.daily_chart;
    const labels = cd.map(d => new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
    if (charts.revenue) charts.revenue.destroy();
    const grad = ctx.createLinearGradient(0,0,0,300);
    grad.addColorStop(0,'rgba(99,102,241,0.3)'); grad.addColorStop(1,'rgba(99,102,241,0)');
    charts.revenue = new Chart(ctx, {
        type:'line',
        data:{labels,datasets:[
            {label:'Revenue ($)',data:cd.map(d=>d.revenue),borderColor:'#818cf8',backgroundColor:grad,fill:true,tension:0.4,borderWidth:2,pointRadius:0,pointHoverRadius:6,yAxisID:'y'},
            {label:'Impressions',data:cd.map(d=>d.impressions),borderColor:'#34d399',backgroundColor:'transparent',tension:0.4,borderWidth:2,pointRadius:0,pointHoverRadius:6,yAxisID:'y1'}
        ]},
        options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
            plugins:{legend:{display:true,position:'top',align:'end',labels:{color:'#6b7280',usePointStyle:true,pointStyle:'circle',padding:20,font:{size:12,weight:'500'}}},
                tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:12,cornerRadius:8,displayColors:true,usePointStyle:true}},
            scales:{x:{grid:{color:'rgba(255,255,255,0.03)',drawBorder:false},ticks:{color:'#4b5563',font:{size:11},maxTicksLimit:10}},
                y:{position:'left',grid:{color:'rgba(255,255,255,0.03)',drawBorder:false},ticks:{color:'#4b5563',font:{size:11},callback:v=>'$'+v}},
                y1:{position:'right',grid:{display:false},ticks:{color:'#4b5563',font:{size:11},callback:v=>{if(v>=1e6)return(v/1e6).toFixed(1)+'M';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return v}}}}}
    });
}

// ============================================
// SITE DONUT CHART
// ============================================
function renderSiteDonut() {
    if (!D || !D.site_revenue_breakdown) return;
    const ctx = document.getElementById('site-donut').getContext('2d');
    const data = D.site_revenue_breakdown;
    if (charts.donut) charts.donut.destroy();
    const colors = ['#818cf8','#34d399','#fbbf24','#f87171','#a78bfa','#22d3ee','#fb923c','#e879f9'];
    charts.donut = new Chart(ctx, {
        type:'doughnut',
        data:{labels:data.map(d=>d.site_name),datasets:[{data:data.map(d=>d.revenue),backgroundColor:colors,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{legend:{position:'bottom',labels:{color:'#6b7280',usePointStyle:true,pointStyle:'circle',padding:15,font:{size:11}}},
                tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
    });
}

// ============================================
// DEVICE CHART
// ============================================
function renderDeviceChart() {
    if (!D || !D.device_breakdown) return;
    const ctx = document.getElementById('device-chart').getContext('2d');
    const data = D.device_breakdown;
    const labels = Object.keys(data);
    const values = labels.map(l => data[l].impressions);
    if (charts.device) charts.device.destroy();
    charts.device = new Chart(ctx, {
        type:'bar',
        data:{labels,datasets:[{data:values,backgroundColor:['#818cf8','#34d399','#fbbf24'],borderWidth:0,borderRadius:8}]},
        options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:12,cornerRadius:8,callbacks:{label:c=>fmtN(c.raw)+' impressions'}}},
            scales:{x:{grid:{display:false},ticks:{color:'#6b7280',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.03)',drawBorder:false},ticks:{color:'#4b5563',font:{size:11},callback:v=>fmtN(v)}}}}
    });
}

// ============================================
// GEO LIST
// ============================================
function renderGeoList() {
    if (!D || !D.geo_breakdown) return;
    const el = document.getElementById('geo-list');
    const data = D.geo_breakdown.slice(0, 8);
    const maxRev = data.length > 0 ? data[0].revenue : 1;
    el.innerHTML = data.map(g => `
        <div class="flex items-center gap-3">
            <span class="text-sm text-gray-300 w-32 truncate">${g.country}</span>
            <div class="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style="width:${(g.revenue/maxRev*100)}%"></div>
            </div>
            <span class="text-sm text-gray-400 font-mono w-16 text-right">${fmtC(g.revenue)}</span>
        </div>
    `).join('');
}

// ============================================
// SITES PAGE
// ============================================
function renderSites() {
    if (!D || !D.sites) return;
    const el = document.getElementById('sites-cards');
    el.innerHTML = D.sites.map(site => {
        const p = site.periods[currentPeriod];
        const chartId = `site-chart-${site.ad_unit_id}`;
        return `
        <div class="card p-6 card-hover">
            <div class="flex items-center justify-between mb-4">
                <div><h3 class="text-lg font-bold text-white">${site.site_name}</h3><p class="text-xs text-gray-500 mt-0.5">Ad Unit: ${site.ad_unit_id}</p></div>
                <div class="text-right"><p class="text-2xl font-black text-green-400">${fmtC(p.revenue)}</p><p class="text-xs text-gray-500">Revenue</p></div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="bg-white/5 rounded-lg p-3"><p class="text-xs text-gray-500">Impressions</p><p class="text-sm font-bold text-white mt-1">${fmtN(p.impressions)}</p></div>
                <div class="bg-white/5 rounded-lg p-3"><p class="text-xs text-gray-500">Clicks</p><p class="text-sm font-bold text-white mt-1">${fmtN(p.clicks)}</p></div>
                <div class="bg-white/5 rounded-lg p-3"><p class="text-xs text-gray-500">eCPM</p><p class="text-sm font-bold text-white mt-1">${fmtC(p.ecpm)}</p></div>
            </div>
            <div style="height:120px"><canvas id="${chartId}"></canvas></div>
        </div>`;
    }).join('');

    // Render mini charts for each site
    D.sites.forEach(site => {
        if (!site.daily_chart || site.daily_chart.length === 0) return;
        const ctx = document.getElementById(`site-chart-${site.ad_unit_id}`);
        if (!ctx) return;
        const cd = site.daily_chart;
        new Chart(ctx.getContext('2d'), {
            type:'line',
            data:{labels:cd.map(d=>new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
                datasets:[{data:cd.map(d=>d.revenue),borderColor:'#818cf8',backgroundColor:'rgba(99,102,241,0.1)',fill:true,tension:0.4,borderWidth:1.5,pointRadius:0}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:8,cornerRadius:6,callbacks:{label:c=>fmtC(c.raw)}}},
                scales:{x:{display:false},y:{display:false}}}
        });
    });
}

// ============================================
// REPORTS PAGE
// ============================================
function renderReports() {
    if (!D || !D.daily_breakdown) return;
    const el = document.getElementById('reports-table');
    el.innerHTML = D.daily_breakdown.map(d => `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-6 py-3.5 text-sm font-medium text-white">${d.date}</td>
            <td class="px-6 py-3.5 text-sm text-right text-gray-400 font-mono">${fmtN(d.impressions)}</td>
            <td class="px-6 py-3.5 text-sm text-right text-gray-400 font-mono">${fmtN(d.clicks)}</td>
            <td class="px-6 py-3.5 text-sm text-right text-gray-400 font-mono">${d.ctr}%</td>
            <td class="px-6 py-3.5 text-sm text-right text-gray-400 font-mono">${fmtC(d.ecpm)}</td>
            <td class="px-6 py-3.5 text-sm text-right font-bold text-green-400 font-mono">${fmtC(d.revenue)}</td>
        </tr>
    `).join('');
}

// ============================================
// ANALYTICS PAGE
// ============================================
function renderAnalytics() {
    if (!D) return;
    // Device chart
    if (D.device_breakdown) {
        const ctx = document.getElementById('analytics-device').getContext('2d');
        const data = D.device_breakdown;
        const labels = Object.keys(data);
        if (charts.analyticsDevice) charts.analyticsDevice.destroy();
        charts.analyticsDevice = new Chart(ctx, {
            type:'doughnut',
            data:{labels,datasets:[{data:labels.map(l=>data[l].revenue),backgroundColor:['#818cf8','#34d399','#fbbf24'],borderWidth:0}]},
            options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
                plugins:{legend:{position:'bottom',labels:{color:'#6b7280',usePointStyle:true,padding:15,font:{size:11}}},
                    tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
        });
    }
    // GEO table
    if (D.geo_breakdown) {
        document.getElementById('geo-table').innerHTML = D.geo_breakdown.map(g => `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-4 py-3 text-sm font-medium text-white">${g.country}</td>
                <td class="px-4 py-3 text-sm text-right text-gray-400 font-mono">${fmtN(g.impressions)}</td>
                <td class="px-4 py-3 text-sm text-right font-bold text-green-400 font-mono">${fmtC(g.revenue)}</td>
                <td class="px-4 py-3 text-sm text-right text-gray-400 font-mono">${fmtC(g.ecpm)}</td>
            </tr>
        `).join('');
    }
    // Viewability
    const viewability = D.viewability || 0;
    document.getElementById('viewability-score').textContent = viewability + '%';
}

// ============================================
// SETTINGS PAGE
// ============================================
function renderSettings() {
    if (!D) return;
    document.getElementById('settings-name').textContent = D.publisher_name;
    document.getElementById('settings-id').textContent = D.publisher_id;
    document.getElementById('settings-code').textContent = localStorage.getItem('unique_code') || '';
    document.getElementById('settings-sites').textContent = D.sites.length;
}

// ============================================
// CSV EXPORT
// ============================================
function exportCSV() {
    if (!D || !D.daily_breakdown) return;
    let csv = 'Date,Impressions,Clicks,CTR,eCPM,Revenue\n';
    D.daily_breakdown.forEach(d => {
        csv += `${d.date},${d.impressions},${d.clicks},${d.ctr}%,${d.ecpm},${d.revenue}\n`;
    });
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `xenonads-report-${D.publisher_name}.csv`;
    a.click(); URL.revokeObjectURL(url);
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }
