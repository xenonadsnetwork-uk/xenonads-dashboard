// Admin Dashboard — final version with publisher management

let adminData = null;
let publishersList = null;
let currentPeriod = 'monthly';
let networkChart = null;
let expandedPublisher = null;
let currentTab = 'overview';

// ============================================
// AUTH CHECK
// ============================================
(function checkAuth() {
    const role = localStorage.getItem('role');
    if (!role || role !== 'admin') { window.location.href = 'index.html'; return; }
    loadData();
    loadPublishers();
})();

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tab) {
    currentTab = tab;
    ['overview', 'publishers', 'add'].forEach(t => {
        const nav = document.getElementById(`nav-${t}`);
        const content = document.getElementById(`tab-content-${t}`);
        if (t === tab) { nav.classList.add('nav-btn-active'); nav.classList.remove('text-gray-500'); content.classList.remove('hidden'); }
        else { nav.classList.remove('nav-btn-active'); nav.classList.add('text-gray-500'); content.classList.add('hidden'); }
    });
}

// ============================================
// DATA LOADING
// ============================================
async function loadData() {
    try {
        const res = await fetch('data/admin_overview.json');
        if (!res.ok) throw new Error('Failed');
        adminData = await res.json();
        renderOverview();
        renderChart();
    } catch (err) {
        document.getElementById('last-updated').textContent = 'No data available yet. Data updates hourly via GitHub Actions.';
    }
}

async function loadPublishers() {
    try {
        const res = await fetch('data/publishers.json');
        if (!res.ok) throw new Error('Failed');
        publishersList = await res.json();
        renderPublishersList();
    } catch (err) { console.error('Error loading publishers:', err); }
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
    if (adminData) renderOverview();
}

// ============================================
// FORMATTERS
// ============================================
function formatNumber(num) { if (num >= 1_000_000) return (num/1_000_000).toFixed(2)+'M'; if (num >= 1_000) return (num/1_000).toFixed(1)+'K'; return num.toLocaleString(); }
function formatCurrency(num) { if (num >= 1000) return '$'+(num/1000).toFixed(1)+'K'; return '$'+num.toFixed(2); }

// ============================================
// OVERVIEW RENDER
// ============================================
function renderOverview() {
    if (!adminData) return;
    const generated = new Date(adminData.generated_at).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
    document.getElementById('last-updated').textContent = `Last updated: ${generated}`;
    const totals = adminData.network_totals[currentPeriod];
    const cards = [
        { label:'Total Impressions', value:formatNumber(totals.impressions), icon:'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', bg:'bg-blue-500/10', text:'text-blue-400' },
        { label:'Total Revenue', value:formatCurrency(totals.revenue), icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1', bg:'bg-green-500/10', text:'text-green-400' },
        { label:'Network eCPM', value:formatCurrency(totals.ecpm), icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', bg:'bg-purple-500/10', text:'text-purple-400' },
        { label:'Total Clicks', value:formatNumber(totals.clicks), icon:'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5', bg:'bg-orange-500/10', text:'text-orange-400' },
    ];
    document.getElementById('network-cards').innerHTML = cards.map(c => `
        <div class="card p-6 card-hover">
            <div class="flex items-start justify-between mb-3"><div class="w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center"><svg class="w-5 h-5 ${c.text}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${c.icon}" /></svg></div></div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${c.label}</p><p class="text-2xl font-black text-white mt-1">${c.value}</p>
        </div>`).join('');

    const tbody = document.getElementById('publishers-table-body');
    if (!adminData.publishers || adminData.publishers.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No publishers configured yet</td></tr>'; return; }
    let html = '';
    adminData.publishers.forEach((pub, index) => {
        const p = pub.totals[currentPeriod];
        const isExpanded = expandedPublisher === index;
        html += `
            <tr class="hover:bg-white/5 transition-colors cursor-pointer" onclick="toggleExpand(${index})">
                <td class="px-6 py-4 text-sm font-semibold text-white flex items-center gap-2">
                    <svg class="w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                    ${pub.publisher_name}
                </td>
                <td class="px-6 py-4 text-sm text-center text-gray-400">${pub.site_count}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.impressions)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.clicks)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatCurrency(p.ecpm)}</td>
                <td class="px-6 py-4 text-sm text-right font-bold text-green-400 font-mono">${formatCurrency(p.revenue)}</td>
                <td class="px-6 py-4 text-center"><span class="text-gray-600 text-xs">▸</span></td>
            </tr>
            <tr class="expand-row ${isExpanded ? 'open' : ''}" id="expand-${index}">
                <td colspan="7" class="px-6 py-0">
                    <div class="py-6 ${isExpanded ? '' : 'opacity-0'}">
                        <div class="bg-black/20 rounded-xl p-6 border border-white/5">
                            <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Sites — ${pub.publisher_name}</h4>
                            <div class="space-y-4">
                                ${pub.sites.map(site => {
                                    const sp = site.periods[currentPeriod];
                                    const marginPercent = Math.round(site.margin_share * 100);
                                    return `<div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white/5 rounded-lg">
                                        <div class="flex-1">
                                            <p class="text-sm font-semibold text-white">${site.site_name}</p>
                                            <p class="text-xs text-gray-500 mt-0.5">Ad Unit: ${site.ad_unit_id}</p>
                                            <div class="flex gap-4 mt-2 text-xs text-gray-500">
                                                <span>Imp: ${formatNumber(sp.impressions)}</span><span>Rev: ${formatCurrency(sp.revenue)}</span>
                                                <span>eCPM: ${formatCurrency(sp.ecpm)}</span><span>Margin: ${marginPercent}%</span>
                                            </div>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>`;
    });
    tbody.innerHTML = html;
}

function toggleExpand(index) { expandedPublisher = expandedPublisher === index ? null : index; renderOverview(); }

// ============================================
// PUBLISHERS LIST RENDER
// ============================================
function renderPublishersList() {
    const tbody = document.getElementById('publishers-list-body');
    if (!publishersList || !publishersList.publishers || publishersList.publishers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No publishers yet. Use "Add Publisher" tab to create one.</td></tr>';
        return;
    }
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
    tbody.innerHTML = publishersList.publishers.map(pub => `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-6 py-4 text-sm font-semibold text-white">${pub.publisher_name}</td>
            <td class="px-6 py-4"><span class="code-badge">${pub.unique_code}</span></td>
            <td class="px-6 py-4 text-xs text-gray-400 truncate max-w-xs">${dashUrl}</td>
            <td class="px-6 py-4 text-sm text-center text-gray-400">—</td>
            <td class="px-6 py-4 text-center">
                <button onclick="copyCode('${pub.unique_code}')" class="copy-btn text-gray-500 text-sm">📋 Copy Code</button>
            </td>
        </tr>
    `).join('');
}

function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => showToast('Code copied: ' + code));
}

// ============================================
// ADD PUBLISHER — Generate Code & Invitation
// ============================================
function generatePublisher() {
    const name = document.getElementById('new-pub-name').value.trim();
    const email = document.getElementById('new-pub-email').value.trim();
    const siteName = document.getElementById('new-site-name').value.trim();
    const adunitId = document.getElementById('new-adunit-id').value.trim();
    const margin = parseInt(document.getElementById('new-margin').value) / 100;

    if (!name || !email || !siteName || !adunitId) {
        showToast('Please fill all fields', true);
        return;
    }

    // Generate unique code
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const pubId = 'pub_' + String(Date.now()).slice(-6);
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html', 'index.html');

    // Show result
    document.getElementById('invite-placeholder').style.display = 'none';
    document.getElementById('invite-result').style.display = 'block';

    document.getElementById('result-name').textContent = name;
    document.getElementById('result-code').textContent = code;
    document.getElementById('result-link').textContent = dashUrl;

    // Email template
    const emailTemplate = `Dear ${name},

Welcome to Xenon Ads! Your publisher account has been set up.

Dashboard Link: ${dashUrl}
Your Access Code: ${code}

Use the access code to log in to your dashboard and view your revenue performance.

Data updates hourly, so you'll always see fresh stats.

Best regards,
Xenon Ads Team
rahad@xenonads.io`;
    document.getElementById('result-email').value = emailTemplate;

    // Config JSON to add
    const configEntry = `{
  "publisher_id": "${pubId}",
  "unique_code": "${code}",
  "publisher_name": "${name}",
  "publisher_email": "${email}",
  "sites": [
    {
      "site_name": "${siteName}",
      "ad_unit_id": "${adunitId}",
      "margin_share": ${margin}
    }
  ]
}`;
    document.getElementById('result-config').textContent = configEntry;

    showToast('Access code generated successfully!');
}

// ============================================
// COPY UTILITY
// ============================================
function copyText(elementId) {
    const el = document.getElementById(elementId);
    let text;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') text = el.value;
    else text = el.textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
}

// ============================================
// TOAST
// ============================================
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// CHART
// ============================================
function renderChart() {
    if (!adminData || !adminData.network_daily_chart) return;
    const ctx = document.getElementById('network-chart').getContext('2d');
    const cd = adminData.network_daily_chart;
    const labels = cd.map(d => new Date(d.date).toLocaleDateString('en-US', { month:'short', day:'numeric' }));
    if (networkChart) networkChart.destroy();
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.3)'); grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
    networkChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [
            { label:'Revenue ($)', data: cd.map(d=>d.revenue), borderColor:'#818cf8', backgroundColor:grad, fill:true, tension:0.4, borderWidth:2, pointRadius:0, pointHoverRadius:6, yAxisID:'y' },
            { label:'Impressions', data: cd.map(d=>d.impressions), borderColor:'#34d399', backgroundColor:'transparent', tension:0.4, borderWidth:2, pointRadius:0, pointHoverRadius:6, yAxisID:'y1' }
        ]},
        options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            plugins: { legend:{display:true,position:'top',align:'end',labels:{color:'#6b7280',usePointStyle:true,pointStyle:'circle',padding:20,font:{size:12,weight:'500'}}},
                tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:12,cornerRadius:8,displayColors:true,usePointStyle:true} },
            scales: { x:{grid:{color:'rgba(255,255,255,0.03)',drawBorder:false},ticks:{color:'#4b5563',font:{size:11},maxTicksLimit:10}},
                y:{position:'left',grid:{color:'rgba(255,255,255,0.03)',drawBorder:false},ticks:{color:'#4b5563',font:{size:11},callback:v=>'$'+v}},
                y1:{position:'right',grid:{display:false},ticks:{color:'#4b5563',font:{size:11},callback:v=>{if(v>=1e6)return(v/1e6).toFixed(1)+'M';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return v;}}} }
        }
    });
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }
