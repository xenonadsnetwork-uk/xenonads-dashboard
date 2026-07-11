// Admin Dashboard — Clean Professional v5

let A = null;
let PL = null;
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
        document.getElementById('last-updated').textContent = 'No data available yet';
    }
}

async function loadPublishers() {
    try {
        const res = await fetch('data/publishers.json');
        if (!res.ok) throw new Error('Failed');
        PL = await res.json();
    } catch (err) { console.error('Error:', err); }
}

function renderAll() {
    const gen = new Date(A.generated_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
    document.getElementById('last-updated').textContent = `Updated: ${gen}`;
    renderKPIs(); renderNetworkChart(); renderPubDonut(); renderPubTable();
}

function renderKPIs() {
    if (!A) return;
    const t = A.network_totals[currentPeriod];
    const cards = [
        { label:'Total Revenue', value:fmtC(t.revenue) },
        { label:'Total Impressions', value:fmtN(t.impressions) },
        { label:'Network eCPM', value:fmtC(t.ecpm) },
        { label:'Total Clicks', value:fmtN(t.clicks) },
    ];
    document.getElementById('kpi-cards').innerHTML = cards.map(c => `
        <div class="card p-5 card-hover">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">${c.label}</p>
            <p class="text-2xl font-bold text-gray-900">${c.value}</p>
        </div>
    `).join('');
}

function renderNetworkChart() {
    if (!A || !A.network_daily_chart) return;
    const ctx = document.getElementById('network-chart').getContext('2d');
    const cd = A.network_daily_chart;
    if (charts.network) charts.network.destroy();
    const grad = ctx.createLinearGradient(0,0,0,280);
    grad.addColorStop(0,'rgba(37,99,235,0.1)'); grad.addColorStop(1,'rgba(37,99,235,0)');
    charts.network = new Chart(ctx, {
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

function renderPubDonut() {
    if (!A || !A.publishers) return;
    const ctx = document.getElementById('pub-donut').getContext('2d');
    const data = A.publishers.map(p => ({name:p.publisher_name,rev:p.totals['3months'].revenue}));
    if (charts.pubDonut) charts.pubDonut.destroy();
    const colors = ['#2563eb','#059669','#7c3aed','#ea580c','#0891b2','#ca8a04','#dc2626','#db2777'];
    charts.pubDonut = new Chart(ctx, {
        type:'doughnut',
        data:{labels:data.map(d=>d.name),datasets:[{data:data.map(d=>d.rev),backgroundColor:colors,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:12,font:{size:11},color:'#6b7280'}},
                tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
    });
}

function renderPubTable() {
    if (!A || !A.publishers) return;
    let html = '';
    A.publishers.forEach((pub, i) => {
        const p = pub.totals[currentPeriod];
        const isExp = expandedPub === i;
        html += `
        <tr class="hover:bg-gray-50 cursor-pointer" onclick="toggleExpand(${i})">
            <td class="px-5 py-3.5 text-sm font-semibold text-gray-900 flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-gray-400 transition-transform ${isExp?'rotate-90':''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
                ${pub.publisher_name}
            </td>
            <td class="px-5 py-3.5 text-sm text-center text-gray-600">${pub.site_count}</td>
            <td class="px-5 py-3.5 text-sm text-right text-gray-600 font-mono">${fmtN(p.impressions)}</td>
            <td class="px-5 py-3.5 text-sm text-right text-gray-600 font-mono">${fmtN(p.clicks)}</td>
            <td class="px-5 py-3.5 text-sm text-right text-gray-600 font-mono">${fmtC(p.ecpm)}</td>
            <td class="px-5 py-3.5 text-sm text-right font-semibold text-gray-900 font-mono">${fmtC(p.revenue)}</td>
            <td class="px-5 py-3.5 text-center"><span class="text-gray-300 text-xs">▸</span></td>
        </tr>
        <tr class="expand-row ${isExp?'open':''}" id="expand-${i}">
            <td colspan="7" class="px-5 py-0">
                <div class="py-5 ${isExp?'':'opacity-0'}">
                    <div class="bg-gray-50 rounded-lg p-5 border border-gray-200">
                        <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sites — ${pub.publisher_name}</h4>
                        <div class="space-y-3">
                            ${pub.sites.map(site => {
                                const sp = site.periods[currentPeriod];
                                const m = Math.round(site.margin_share*100);
                                return `<div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                                    <div class="flex-1">
                                        <p class="text-sm font-semibold text-gray-900">${site.site_name}</p>
                                        <p class="text-xs text-gray-400 mt-0.5">Ad Unit: ${site.ad_unit_id}</p>
                                        <div class="flex gap-4 mt-1.5 text-xs text-gray-500">
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
    document.getElementById('pub-table').innerHTML = html;
}

function toggleExpand(i) { expandedPub = expandedPub === i ? null : i; renderPubTable(); }

function showAddSiteForm(pubId, pubName) {
    document.getElementById('add-site-pub-id').value = pubId;
    document.getElementById('add-site-pub-name').textContent = pubName;
    document.getElementById('add-site-form').style.display = 'block';
    document.getElementById('add-site-result').style.display = 'none';
    document.getElementById('add-site-form').scrollIntoView({ behavior:'smooth' });
}

function generateAddSite() {
    const pubId = document.getElementById('add-site-pub-id').value;
    const pubName = document.getElementById('add-site-pub-name').textContent;
    const siteName = document.getElementById('add-site-name').value.trim();
    const adunitId = document.getElementById('add-site-adunit').value.trim();
    const margin = parseInt(document.getElementById('add-site-margin').value) / 100;
    if (!siteName || !adunitId) { showToast('Please fill all fields', true); return; }
    const configEntry = `Add this site to the "${pubName}" publisher's sites array in config.json:\n\n{\n  "site_name": "${siteName}",\n  "ad_unit_id": "${adunitId}",\n  "margin_share": ${margin}\n}`;
    document.getElementById('add-site-form').style.display = 'none';
    document.getElementById('add-site-result').style.display = 'block';
    document.getElementById('add-site-result-name').textContent = siteName;
    document.getElementById('add-site-result-adunit').textContent = adunitId;
    document.getElementById('add-site-result-margin').textContent = Math.round(margin*100)+'%';
    document.getElementById('add-site-config').textContent = configEntry;
    showToast('Site config generated');
}

function copyAddSiteConfig() {
    navigator.clipboard.writeText(document.getElementById('add-site-config').textContent).then(() => showToast('Config copied'));
}

function renderPubList() {
    if (!PL) return;
    const tbody = document.getElementById('pub-list');
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html','index.html');
    if (!PL.publishers || PL.publishers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-gray-400">No publishers yet</td></tr>'; return;
    }
    tbody.innerHTML = PL.publishers.map(pub => `
        <tr class="hover:bg-gray-50">
            <td class="px-5 py-3.5 text-sm font-semibold text-gray-900">${pub.publisher_name}</td>
            <td class="px-5 py-3.5"><span class="code-badge">${pub.unique_code}</span></td>
            <td class="px-5 py-3.5 text-xs text-gray-400 truncate max-w-xs">${dashUrl}</td>
            <td class="px-5 py-3.5 text-center"><button onclick="copyCode('${pub.unique_code}')" class="copy-btn text-gray-400 text-sm">📋 Copy</button></td>
            <td class="px-5 py-3.5 text-center"><button onclick="showAddSiteForm('${pub.publisher_id}','${pub.publisher_name}')" class="bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-md text-xs font-medium">+ Add Site</button></td>
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
    let code = ''; for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random()*chars.length)];
    const pubId = 'pub_' + String(Date.now()).slice(-6);
    const dashUrl = window.location.origin + window.location.pathname.replace('admin.html','index.html');
    document.getElementById('invite-placeholder').style.display = 'none';
    document.getElementById('invite-result').style.display = 'block';
    document.getElementById('result-name').textContent = name;
    document.getElementById('result-code').textContent = code;
    document.getElementById('result-link').textContent = dashUrl;
    document.getElementById('result-email').value = `Dear ${name},\n\nWelcome to Xenon Ads! Your publisher account has been set up.\n\nDashboard Link: ${dashUrl}\nYour Access Code: ${code}\n\nUse the access code to log in to your dashboard and view your revenue performance.\n\nData updates hourly.\n\nBest regards,\nXenon Ads Team\nrahad@xenonads.io`;
    document.getElementById('result-config').textContent = `{\n  "publisher_id": "${pubId}",\n  "unique_code": "${code}",\n  "publisher_name": "${name}",\n  "publisher_email": "${email}",\n  "sites": [\n    {\n      "site_name": "${siteName}",\n      "ad_unit_id": "${adunitId}",\n      "margin_share": ${margin}\n    }\n  ]\n}`;
    showToast('Access code generated');
}

function copyText(id) {
    const el = document.getElementById(id);
    const text = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Copied'));
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.toggle('error', isError); t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
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
            data:{labels,datasets:[{data:labels.map(l=>data[l].revenue),backgroundColor:['#2563eb','#059669','#7c3aed'],borderWidth:0}]},
            options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
                plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:12,font:{size:11},color:'#6b7280'}},
                    tooltip:{backgroundColor:'#fff',titleColor:'#111827',bodyColor:'#6b7280',borderColor:'#e5e7eb',borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:c=>`${c.label}: ${fmtC(c.raw)}`}}}}
        });
    }
    if (A.geo_breakdown) {
        const el = document.getElementById('admin-geo-list');
        const data = A.geo_breakdown.slice(0, 10);
        const maxRev = data.length > 0 ? data[0].revenue : 1;
        el.innerHTML = data.map(g => `
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-700 w-28 truncate">${g.country}</span>
                <div class="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div class="bg-gray-900 h-full rounded-full" style="width:${(g.revenue/maxRev*100)}%"></div></div>
                <span class="text-sm text-gray-500 font-mono w-14 text-right">${fmtC(g.revenue)}</span>
            </div>
        `).join('');
    }
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }
