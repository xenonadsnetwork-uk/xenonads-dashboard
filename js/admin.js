// Admin Dashboard — Premium v3 with sidebar, charts, publisher management

let A = null; // admin data
let PL = null; // publishers list
let currentPeriod = 'monthly';
let charts = {};
let expandedPub = null;

(function checkAuth() {
    const role = localStorage.getItem('role');
    if (!role || role !== 'admin') { window.location.href = 'index.html'; return; }
    loadData(); loadPublishers();
})();

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${page}`).classList.add('active');
    if (page === 'publishers') renderPubList();
    if (page === 'analytics') renderAdminAnalytics();
}

function switchPeriod(period) {
    currentPeriod = period;
    ['daily','3days','weekly','monthly','3months'].forEach(btn => {
        const el = document.getElementById(`btn-${btn}`);
        if (btn === period) { el.classList.add('period-btn-active'); el.classList.remove('text-gray-500'); }
        else { el.classList.remove('period-btn-active'); el.classList.add('text-gray-500'); }
    });
    if (A) { renderKPIs(); renderPubTable(); }
}

function fmtN(n) { if(n>=1e6)return(n/1e6).toFixed(2)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }
function fmtC(n) { if(n>=1e3)return'$'+(n/1e3).toFixed(1)+'K'; return '$'+n.toFixed(2); }

async function loadData() {
    try {
        const res = await fetch('data/admin_overview.json');
        if (!res.ok) throw new Error('Failed');
        A = await res.json();
        renderAll();
    } catch (err) {
        document.getElementById('last-updated').textContent = 'No data available yet. Data updates hourly.';
    }
}

async function loadPublishers() {
    try {
        const res = await fetch('data/publishers.json');
        if (!res.ok) throw new Error('Failed');
        PL = await res.json();
    } catch (err) { console.error('Error loading publishers:', err); }
}

function renderAll() {
    const gen = new Date(A.generated_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('last-updated').textContent = `Last updated: ${gen}`;
    renderKPIs();
    renderNetworkChart();
    renderPubDonut();
    renderPubTable();
}

function renderKPIs() {
    if (!A) return;
    const t = A.network_totals[currentPeriod];
    const cards = [
        { label:'Total Revenue', value:fmtC(t.revenue), icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1', bg:'bg-green-500/10', text:'text-green-400' },
        { label:'Total Impressions', value:fmtN(t.impressions), icon:'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', bg:'bg-blue-500/10', text:'text-blue-400' },
        { label:'Network eCPM', value:fmtC(t.ecpm), icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', bg:'bg-purple-500/10', text:'text-purple-400' },
        { label:'Total Clicks', value:fmtN(t.clicks), icon:'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5', bg:'bg-orange-500/10', text:'text-orange-400' },
    ];
    document.getElementById('kpi-cards').innerHTML = cards.map(c => `
        <div class="card p-6 card-hover">
            <div class="flex items-start justify-between mb-3"><div class="w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center"><svg class="w-5 h-5 ${c.text}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${c.icon}"/></svg></div></div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${c.label}</p><p class="text-2xl font-black text-white mt-1">${c.value}</p>
        </div>`).join('');
}

function renderNetworkChart() {
    if (!A || !A.network_daily_chart) return;
    const ctx = document.getElementById('network-chart').getContext('2d');
    const cd = A.network_daily_chart;
    if (charts.network) charts.network.destroy();
    const grad = ctx.createLinearGradient(0,0,0,300);
    grad.addColorStop(0,'rgba(99,102,241,0.3)'); grad.addColorStop(1,'rgba(99,102,241,0)');
    charts.network = new Chart(ctx, {
        type:'line',
        data:{labels:cd.map(d=>new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
            datasets:[
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

function renderPubDonut() {
    if (!A || !A.publishers) return;
    const ctx = document.getElementById('pub-donut').getContext('2d');
    const data = A.publishers.map(p => ({name: p.publisher_name, rev: p.totals['3months'].revenue}));
    if (charts.pubDonut) charts.pubDonut.destroy();
    const colors = ['#818cf8','#34d399','#fbbf24','#f87171','#a78bfa','#22d3ee','#fb923c','#e879f9'];
    charts.pubDonut = new Chart(ctx, {
        type:'doughnut',
        data:{labels:data.map(d=>d.name),datasets:[{data:data.map(d=>d.rev),backgroundColor:colors,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{legend:{position:'bottom',labels:{color:'#6b7280',usePointStyle:true,pointStyle:'circle',padding:15,font:{size:11}}},
                tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
    });
}

function renderPubTable() {
    if (!A || !A.publishers) return;
    const tbody = document.getElementById('pub-table');
    let html = '';
    A.publishers.forEach((pub, i) => {
        const p = pub.totals[currentPeriod];
        const isExp = expandedPub === i;
        html += `
        <tr class="hover:bg-white/5 transition-colors cursor-pointer" onclick="toggleExpand(${i})">
            <td class="px-6 py-4 text-sm font-semibold text-white flex items-center gap-2">
                <svg class="w-4 h-4 text-gray-500 transition-transform ${isExp?'rotate-90':''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                ${pub.publisher_name}
            </td>
            <td class="px-6 py-4 text-sm text-center text-gray-400">${pub.site_count}</td>
            <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${fmtN(p.impressions)}</td>
            <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${fmtN(p.clicks)}</td>
            <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${fmtC(p.ecpm)}</td>
            <td class="px-6 py-4 text-sm text-right font-bold text-green-400 font-mono">${fmtC(p.revenue)}</td>
            <td class="px-6 py-4 text-center"><span class="text-gray-600 text-xs">▸</span></td>
        </tr>
        <tr class="expand-row ${isExp?'open':''}" id="expand-${i}">
            <td colspan="7" class="px-6 py-0">
                <div class="py-6 ${isExp?'':'opacity-0'}">
                    <div class="bg-black/20 rounded-xl p-6 border border-white/5">
                        <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Sites — ${pub.publisher_name}</h4>
                        <div class="space-y-4">
                            ${pub.sites.map(site => {
                                const sp = site.periods[currentPeriod];
                                const m = Math.round(site.margin_share*100);
                                return `<div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white/5 rounded-lg">
                                    <div class="flex-1">
                                        <p class="text-sm font-semibold text-white">${site.site_name}</p>
                                        <p class="text-xs text-gray-500 mt-0.5">Ad Unit: ${site.ad_unit_id}</p>
                                        <div class="flex gap-4 mt-2 text-xs text-gray-500">
                                            <span>Imp: ${fmtN(sp.impressions)}</span><span>Rev: ${fmtC(sp.revenue)}</span>
                                            <span>eCPM: ${fmtC(sp.ecpm)}</span><span>Margin: ${m}%</span>
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

function toggleExpand(i) { expandedPub = expandedPub === i ? null : i; renderPubTable(); }

// ============================================
// ADD SITE TO EXISTING PUBLISHER
// ============================================
function showAddSiteForm(pubId, pubName) {
    document.getElementById('add-site-pub-id').value = pubId;
    document.getElementById('add-site-pub-name').textContent = pubName;
    document.getElementById('add-site-form').style.display = 'block';
    document.getElementById('add-site-result').style.display = 'none';
    document.getElementById('add-site-form').scrollIntoView({ behavior: 'smooth' });
}

function generateAddSite() {
    const pubId = document.getElementById('add-site-pub-id').value;
    const pubName = document.getElementById('add-site-pub-name').textContent;
    const siteName = document.getElementById('add-site-name').value.trim();
    const adunitId = document.getElementById('add-site-adunit').value.trim();
    const margin = parseInt(document.getElementById('add-site-margin').value) / 100;

    if (!siteName || !adunitId) { showToast('Please fill all fields', true); return; }

    // Generate config entry
    const configEntry = `Add this site to the "${pubName}" publisher's sites array in config.json:

{
  "site_name": "${siteName}",
  "ad_unit_id": "${adunitId}",
  "margin_share": ${margin}
}`;

    document.getElementById('add-site-form').style.display = 'none';
    document.getElementById('add-site-result').style.display = 'block';
    document.getElementById('add-site-result-name').textContent = siteName;
    document.getElementById('add-site-result-adunit').textContent = adunitId;
    document.getElementById('add-site-result-margin').textContent = Math.round(margin * 100) + '%';
    document.getElementById('add-site-config').textContent = configEntry;
    showToast('Site config generated!');
}

function copyAddSiteConfig() {
    const text = document.getElementById('add-site-config').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Config copied!'));
}

function renderPubList() {
    if (!PL) return;
    const tbody = document.getElementById('pub-list');
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html','index.html');
    if (!PL.publishers || PL.publishers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No publishers yet</td></tr>'; return;
    }
    tbody.innerHTML = PL.publishers.map(pub => `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-6 py-4 text-sm font-semibold text-white">${pub.publisher_name}</td>
            <td class="px-6 py-4"><span class="code-badge">${pub.unique_code}</span></td>
            <td class="px-6 py-4 text-xs text-gray-400 truncate max-w-xs">${dashUrl}</td>
            <td class="px-6 py-4 text-center"><button onclick="copyCode('${pub.unique_code}')" class="copy-btn text-gray-500 text-sm">📋 Copy Code</button></td>
            <td class="px-6 py-4 text-center"><button onclick="showAddSiteForm('${pub.publisher_id}', '${pub.publisher_name}')" class="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">+ Add Site</button></td>
        </tr>
    `).join('');
}

function copyCode(code) { navigator.clipboard.writeText(code).then(() => showToast('Code copied: ' + code)); }

function generatePublisher() {
    const name = document.getElementById('new-pub-name').value.trim();
    const email = document.getElementById('new-pub-email').value.trim();
    const siteName = document.getElementById('new-site-name').value.trim();
    const adunitId = document.getElementById('new-adunit-id').value.trim();
    const margin = parseInt(document.getElementById('new-margin').value) / 100;
    if (!name || !email || !siteName || !adunitId) { showToast('Please fill all fields', true); return; }
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = ''; for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const pubId = 'pub_' + String(Date.now()).slice(-6);
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html','index.html');
    document.getElementById('invite-placeholder').style.display = 'none';
    document.getElementById('invite-result').style.display = 'block';
    document.getElementById('result-name').textContent = name;
    document.getElementById('result-code').textContent = code;
    document.getElementById('result-link').textContent = dashUrl;
    document.getElementById('result-email').value = `Dear ${name},\n\nWelcome to Xenon Ads! Your publisher account has been set up.\n\nDashboard Link: ${dashUrl}\nYour Access Code: ${code}\n\nUse the access code to log in to your dashboard and view your revenue performance.\n\nData updates hourly, so you'll always see fresh stats.\n\nBest regards,\nXenon Ads Team\nrahad@xenonads.io`;
    document.getElementById('result-config').textContent = `{\n  "publisher_id": "${pubId}",\n  "unique_code": "${code}",\n  "publisher_name": "${name}",\n  "publisher_email": "${email}",\n  "sites": [\n    {\n      "site_name": "${siteName}",\n      "ad_unit_id": "${adunitId}",\n      "margin_share": ${margin}\n    }\n  ]\n}`;
    showToast('Access code generated successfully!');
}

function copyText(id) {
    const el = document.getElementById(id);
    const text = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.toggle('error', isError); t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function renderAdminAnalytics() {
    if (!A) return;
    if (A.device_breakdown) {
        const ctx = document.getElementById('admin-device-chart').getContext('2d');
        const data = A.device_breakdown;
        const labels = Object.keys(data);
        if (charts.adminDevice) charts.adminDevice.destroy();
        charts.adminDevice = new Chart(ctx, {
            type:'doughnut',
            data:{labels,datasets:[{data:labels.map(l=>data[l].revenue),backgroundColor:['#818cf8','#34d399','#fbbf24'],borderWidth:0}]},
            options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
                plugins:{legend:{position:'bottom',labels:{color:'#6b7280',usePointStyle:true,padding:15,font:{size:11}}},
                    tooltip:{backgroundColor:'rgba(10,10,15,0.95)',titleColor:'#fff',bodyColor:'#9ca3af',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
        });
    }
    if (A.geo_breakdown) {
        const el = document.getElementById('admin-geo-list');
        const data = A.geo_breakdown.slice(0, 10);
        const maxRev = data.length > 0 ? data[0].revenue : 1;
        el.innerHTML = data.map(g => `
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-300 w-32 truncate">${g.country}</span>
                <div class="flex-1 bg-white/5 rounded-full h-2 overflow-hidden"><div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style="width:${(g.revenue/maxRev*100)}%"></div></div>
                <span class="text-sm text-gray-400 font-mono w-16 text-right">${fmtC(g.revenue)}</span>
            </div>
        `).join('');
    }
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }
