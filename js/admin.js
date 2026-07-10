// Admin Dashboard — premium edition with margin management + charts

let adminData = null;
let publishersList = null;
let currentPeriod = 'monthly';
let networkChart = null;
let expandedPublisher = null;

(function checkAuth() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || role !== 'admin') {
        window.location.href = '/';
        return;
    }
    loadData();
    loadPublishers();
})();

async function loadData() {
    try {
        const res = await fetch('/api/admin/overview');
        if (!res.ok) throw new Error('Failed to load data');
        adminData = await res.json();
        renderData();
        renderChart();
    } catch (err) {
        console.error('Error loading data:', err);
        document.getElementById('last-updated').textContent = 'No data available. Click "Refresh" to pull from GAM.';
    }
}

async function loadPublishers() {
    try {
        const res = await fetch('/api/admin/publishers');
        if (!res.ok) throw new Error('Failed to load publishers');
        publishersList = await res.json();
        if (adminData) renderData();
    } catch (err) {
        console.error('Error loading publishers:', err);
    }
}

async function refreshData() {
    const btn = document.getElementById('refresh-btn');
    const text = document.getElementById('refresh-text');
    btn.disabled = true;
    text.textContent = 'Refreshing...';

    try {
        const res = await fetch('/api/admin/refresh', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            text.textContent = 'Done!';
            showToast('Data refreshed from GAM successfully');
            await loadData();
            setTimeout(() => { text.textContent = 'Refresh'; btn.disabled = false; }, 2000);
        } else {
            throw new Error(data.detail || 'Refresh failed');
        }
    } catch (err) {
        text.textContent = 'Error';
        showToast('Refresh failed: ' + err.message, true);
        setTimeout(() => { text.textContent = 'Refresh'; btn.disabled = false; }, 3000);
    }
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    if (isError) {
        toast.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        toast.style.color = '#ef4444';
    } else {
        toast.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        toast.style.color = '#22c55e';
    }
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function switchPeriod(period) {
    currentPeriod = period;
    const buttons = ['daily', '3days', 'weekly', 'monthly', '3months'];
    buttons.forEach(btn => {
        const el = document.getElementById(`btn-${btn}`);
        if (btn === period) {
            el.classList.add('period-btn-active');
            el.classList.remove('text-gray-500');
        } else {
            el.classList.remove('period-btn-active');
            el.classList.add('text-gray-500');
        }
    });
    if (adminData) renderData();
}

function formatNumber(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function formatCurrency(num) {
    if (num >= 1000) return '$' + (num / 1000).toFixed(1) + 'K';
    return '$' + num.toFixed(2);
}

function renderData() {
    if (!adminData) return;

    const generated = new Date(adminData.generated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('last-updated').textContent = `Last updated: ${generated}`;

    const totals = adminData.network_totals[currentPeriod];

    const cards = [
        { label: 'Total Impressions', value: formatNumber(totals.impressions), icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', bg: 'bg-blue-500/10', text: 'text-blue-400' },
        { label: 'Total Revenue', value: formatCurrency(totals.revenue), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1', bg: 'bg-green-500/10', text: 'text-green-400' },
        { label: 'Network eCPM', value: formatCurrency(totals.ecpm), icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', bg: 'bg-purple-500/10', text: 'text-purple-400' },
        { label: 'Total Clicks', value: formatNumber(totals.clicks), icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l1.764 1.817 1.817-1.817M3.348 7.536l1.817-1.817M7.536 3.348L5.719 1.531', bg: 'bg-orange-500/10', text: 'text-orange-400' },
    ];

    document.getElementById('network-cards').innerHTML = cards.map(card => `
        <div class="card p-6 card-hover">
            <div class="flex items-start justify-between mb-3">
                <div class="w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center">
                    <svg class="w-5 h-5 ${card.text}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="${card.icon}" />
                    </svg>
                </div>
            </div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${card.label}</p>
            <p class="text-2xl font-black text-white mt-1">${card.value}</p>
        </div>
    `).join('');

    // Publishers table
    const tbody = document.getElementById('publishers-table-body');
    if (!adminData.publishers || adminData.publishers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No publishers configured yet</td></tr>`;
        return;
    }

    let html = '';
    adminData.publishers.forEach((pub, index) => {
        const p = pub.totals[currentPeriod];
        const isExpanded = expandedPublisher === index;

        html += `
            <tr class="hover:bg-white/5 transition-colors cursor-pointer" onclick="toggleExpand(${index})">
                <td class="px-6 py-4 text-sm font-semibold text-white flex items-center gap-2">
                    <svg class="w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    ${pub.publisher_name}
                </td>
                <td class="px-6 py-4 text-sm text-center text-gray-400">${pub.site_count}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.impressions)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.clicks)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatCurrency(p.ecpm)}</td>
                <td class="px-6 py-4 text-sm text-right font-bold text-green-400 font-mono">${formatCurrency(p.revenue)}</td>
                <td class="px-6 py-4 text-center">
                    <span class="text-gray-600 text-xs">▸</span>
                </td>
            </tr>
            <tr class="expand-row ${isExpanded ? 'open' : ''}" id="expand-${index}">
                <td colspan="7" class="px-6 py-0">
                    <div class="py-6 ${isExpanded ? '' : 'opacity-0'}">
                        <div class="bg-black/20 rounded-xl p-6 border border-white/5">
                            <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Site Margins — ${pub.publisher_name}</h4>
                            <div class="space-y-4">
                                ${pub.sites.map((site, sIndex) => {
                                    const sp = site.periods[currentPeriod];
                                    const marginPercent = Math.round(site.margin_share * 100);
                                    return `
                                    <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white/5 rounded-lg">
                                        <div class="flex-1">
                                            <p class="text-sm font-semibold text-white">${site.site_name}</p>
                                            <p class="text-xs text-gray-500 mt-0.5">Ad Unit: ${site.ad_unit_id}</p>
                                            <div class="flex gap-4 mt-2 text-xs text-gray-500">
                                                <span>Imp: ${formatNumber(sp.impressions)}</span>
                                                <span>Rev: ${formatCurrency(sp.revenue)}</span>
                                                <span>eCPM: ${formatCurrency(sp.ecpm)}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-4 sm:w-64">
                                            <div class="flex-1">
                                                <div class="flex items-center justify-between mb-1">
                                                    <span class="text-xs text-gray-500">Publisher Share</span>
                                                    <span class="text-sm font-bold text-indigo-400" id="margin-val-${index}-${sIndex}">${marginPercent}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value="${marginPercent}"
                                                    class="margin-slider w-full"
                                                    oninput="updateMarginDisplay(${index}, ${sIndex}, this.value)"
                                                    onchange="saveMargin('${pub.publisher_id}', ${sIndex}, this.value)">
                                            </div>
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function toggleExpand(index) {
    if (expandedPublisher === index) {
        expandedPublisher = null;
    } else {
        expandedPublisher = index;
    }
    renderData();
}

function updateMarginDisplay(pubIndex, siteIndex, value) {
    document.getElementById(`margin-val-${pubIndex}-${siteIndex}`).textContent = value + '%';
}

async function saveMargin(publisherId, siteIndex, percentValue) {
    const marginShare = parseInt(percentValue) / 100;
    try {
        const res = await fetch('/api/admin/update-margin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                publisher_id: publisherId,
                site_index: siteIndex,
                margin_share: marginShare
            })
        });

        if (res.ok) {
            const data = await res.json();
            showToast(`Margin updated: ${data.site_name} → ${percentValue}%`);
        } else {
            const err = await res.json();
            showToast('Error: ' + err.detail, true);
        }
    } catch (err) {
        showToast('Connection error', true);
    }
}

function renderChart() {
    if (!adminData || !adminData.network_daily_chart) return;

    const ctx = document.getElementById('network-chart').getContext('2d');
    const chartData = adminData.network_daily_chart;

    const labels = chartData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const revenueData = chartData.map(d => d.revenue);
    const impressionsData = chartData.map(d => d.impressions);

    if (networkChart) networkChart.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    networkChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue ($)',
                    data: revenueData,
                    borderColor: '#818cf8',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    yAxisID: 'y',
                },
                {
                    label: 'Impressions',
                    data: impressionsData,
                    borderColor: '#34d399',
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: { color: '#6b7280', usePointStyle: true, pointStyle: 'circle', padding: 20, font: { size: 12, weight: '500' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.95)',
                    titleColor: '#fff', bodyColor: '#9ca3af',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                    padding: 12, cornerRadius: 8, displayColors: true, usePointStyle: true,
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#4b5563', font: { size: 11 }, maxTicksLimit: 10 }
                },
                y: {
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#4b5563', font: { size: 11 }, callback: function(v) { return '$' + v; } }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    ticks: { color: '#4b5563', font: { size: 11 }, callback: function(v) {
                        if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
                        if (v >= 1000) return (v/1000).toFixed(0) + 'K';
                        return v;
                    }}
                }
            }
        }
    });
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}
