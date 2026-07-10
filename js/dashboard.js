// Publisher Dashboard — premium edition with charts

let publisherData = null;
let currentPeriod = 'monthly';
let revenueChart = null;

(function checkAuth() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token || role !== 'publisher') {
        window.location.href = '/';
        return;
    }
    document.getElementById('pub-name').textContent = localStorage.getItem('publisher_name') || '';
    loadData();
})();

async function loadData() {
    const code = localStorage.getItem('unique_code');
    try {
        const res = await fetch(`/api/data/${code}`);
        if (!res.ok) throw new Error('Failed to load data');
        publisherData = await res.json();
        renderData();
        renderChart();
    } catch (err) {
        console.error('Error loading data:', err);
        document.getElementById('last-updated').textContent = 'No data available yet';
        document.getElementById('summary-cards').innerHTML = `
            <div class="col-span-2 lg:col-span-4 card p-8 text-center">
                <p class="text-gray-500">No data available yet. Data will appear once your sites start receiving traffic.</p>
            </div>
        `;
    }
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
    if (publisherData) renderData();
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
    if (!publisherData) return;

    const generated = new Date(publisherData.generated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('last-updated').textContent = `Last updated: ${generated}`;

    const totals = publisherData.totals[currentPeriod];

    const cards = [
        { label: 'Impressions', value: formatNumber(totals.impressions), icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
        { label: 'Revenue', value: formatCurrency(totals.revenue), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1', gradient: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10', text: 'text-green-400' },
        { label: 'eCPM', value: formatCurrency(totals.ecpm), icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', gradient: 'from-purple-500 to-pink-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
        { label: 'Clicks', value: formatNumber(totals.clicks), icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l1.764 1.817 1.817-1.817M3.348 7.536l1.817-1.817M7.536 3.348L5.719 1.531', gradient: 'from-orange-500 to-amber-500', bg: 'bg-orange-500/10', text: 'text-orange-400' },
    ];

    document.getElementById('summary-cards').innerHTML = cards.map(card => `
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

    // Sites table
    const tbody = document.getElementById('sites-table-body');
    if (!publisherData.sites || publisherData.sites.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No sites configured yet</td></tr>`;
        return;
    }

    tbody.innerHTML = publisherData.sites.map(site => {
        const p = site.periods[currentPeriod];
        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-6 py-4 text-sm font-semibold text-white">${site.site_name}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.impressions)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatNumber(p.clicks)}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${p.ctr}%</td>
                <td class="px-6 py-4 text-sm text-right text-gray-400 font-mono">${formatCurrency(p.ecpm)}</td>
                <td class="px-6 py-4 text-sm text-right font-bold text-green-400 font-mono">${formatCurrency(p.revenue)}</td>
            </tr>
        `;
    }).join('');
}

function renderChart() {
    if (!publisherData || !publisherData.daily_chart) return;

    const ctx = document.getElementById('revenue-chart').getContext('2d');

    const chartData = publisherData.daily_chart;
    const labels = chartData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const revenueData = chartData.map(d => d.revenue);
    const impressionsData = chartData.map(d => d.impressions);

    if (revenueChart) revenueChart.destroy();

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    revenueChart = new Chart(ctx, {
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
                    pointHoverBackgroundColor: '#818cf8',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
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
                    pointHoverBackgroundColor: '#34d399',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
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
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#6b7280',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 12, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    usePointStyle: true,
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
                    ticks: {
                        color: '#4b5563',
                        font: { size: 11 },
                        callback: function(value) { return '$' + value; }
                    }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    ticks: {
                        color: '#4b5563',
                        font: { size: 11 },
                        callback: function(value) {
                            if (value >= 1000000) return (value/1000000).toFixed(1) + 'M';
                            if (value >= 1000) return (value/1000).toFixed(0) + 'K';
                            return value;
                        }
                    }
                }
            }
        }
    });
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}
