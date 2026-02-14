/*
 * SolarDiagnose - System Logic
 * Handles API communication, Charts, and UI updates.
 */

const API_BASE_URL = 'http://localhost:8000';

// Global State
let lastSimulationData = null;
let currentUserId = localStorage.getItem('userId') || 'default';
let charts = {
    efficiency: null,
    power: null,
    deg: null,
    comp: null
};

document.addEventListener('DOMContentLoaded', () => {
    loadTheme(); // Load theme first
    checkUserSession();
    initApp();
    checkBackendStatus();

    // Real-time polling for Dashboard
    if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) {
        setInterval(loadDashboard, 5000); // Update every 5 seconds
    }
    // Frequent ping for connectivity indicator
    setInterval(checkBackendStatus, 10000);
});

async function checkBackendStatus() {
    const statusDot = document.getElementById('backend-status-dot');
    const statusText = document.getElementById('backend-status-text');

    try {
        const response = await fetch(`${API_BASE_URL}/`, { method: 'GET' });
        if (response.ok) {
            if (statusDot) statusDot.style.background = '#10b981';
            if (statusText) statusText.textContent = 'Backend Online';
        } else {
            throw new Error();
        }
    } catch (e) {
        if (statusDot) statusDot.style.background = '#ef4444';
        if (statusText) statusText.textContent = 'Backend Offline';
    }
}

function checkUserSession() {
    if (!localStorage.getItem('userId')) {
        const name = prompt("Welcome to SolarDiagnose! Please enter your name or Student ID for session isolation:", "User_" + Math.floor(Math.random() * 1000));
        if (name) {
            const id = name.trim().replace(/\s+/g, '_');
            localStorage.setItem('userId', id);
            currentUserId = id;
            trackUser(id);
        }
    } else {
        trackUser(currentUserId);
    }
    updateUserUI();
}

function trackUser(id) {
    let recent = JSON.parse(localStorage.getItem('recentUsers') || '[]');
    if (!recent.includes(id)) {
        recent.push(id);
        localStorage.setItem('recentUsers', JSON.stringify(recent));
    }
}

function updateUserUI() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !document.getElementById('user-profile')) {
        const profile = document.createElement('div');
        profile.id = 'user-profile';
        profile.style.cssText = 'margin-top: auto; padding: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;';

        const recent = JSON.parse(localStorage.getItem('recentUsers') || '[]');
        const otherUsers = recent.filter(u => u !== currentUserId).slice(-3); // Show last 3 others

        let usersHtml = otherUsers.length > 0 ? `
            <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1);">
                <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.5rem;">QUICK SWITCH</span>
                ${otherUsers.map(u => `
                    <div onclick="switchSession('${u}')" style="cursor: pointer; margin-bottom: 0.4rem; color: var(--primary); font-size: 0.75rem;">
                        <i class="fas fa-history" style="font-size: 0.6rem;"></i> ${u}
                    </div>
                `).join('')}
            </div>
        ` : '';

        profile.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; color: var(--bg-dark);">
                        <i class="fas fa-user"></i>
                    </div>
                    <div>
                        <strong style="color: var(--text-main); display: block;">${currentUserId}</strong>
                        <span style="font-size: 0.7rem; color: var(--secondary);">Session Active</span>
                    </div>
                </div>
                <button onclick="toggleTheme()" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: 28px; height: 28px; border-radius: 8px; color: var(--primary); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-circle-half-stroke"></i>
                </button>
            </div>
            <button onclick="changeUser()" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.75rem; padding: 0;">
                <i class="fas fa-plus"></i> New Session
            </button>
            ${usersHtml}
        `;
        sidebar.appendChild(profile);
    }
}

function switchSession(id) {
    localStorage.setItem('userId', id);
    window.location.reload();
}

function changeUser() {
    const name = prompt("Enter new User ID/Name:", "");
    if (name && name.trim()) {
        const id = name.trim().replace(/\s+/g, '_');
        localStorage.setItem('userId', id);
        trackUser(id);
        window.location.reload();
    }
}

// --- Theme Management ---
function loadTheme() {
    const isLight = localStorage.getItem('theme') === 'light';
    if (isLight) {
        document.body.classList.add('light-mode');
    }
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-mode');
    const isLight = body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

function initApp() {
    // 1. Load last simulation from storage FIRST
    const saved = localStorage.getItem('lastSimulation');
    if (saved) {
        lastSimulationData = JSON.parse(saved);
    }

    const path = window.location.pathname;

    // 2. Now run page selection logic
    if (path.endsWith('index.html') || path === '/' || path.endsWith('frontend/')) {
        const clearBtn = document.getElementById('btn-clear-metrics');
        if (clearBtn) clearBtn.addEventListener('click', resetSystemStats);
        loadDashboard();
    } else if (path.includes('simulation.html')) {
        setupSimulation();
    } else if (path.includes('performance.html')) {
        loadPerformance();
    } else if (path.includes('diagnosis.html')) {
        setupDiagnosis();
    } else if (path.includes('results.html')) {
        setupResults();
    }
}

// --- Dashboard ---
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard-summary`, {
            headers: { 'X-User-ID': currentUserId }
        });
        if (!response.ok) throw new Error('API Unavailable');
        const data = await response.json();

        const clearBtn = document.getElementById('btn-clear-metrics');
        if (data.total_simulations === 0) {
            if (clearBtn) clearBtn.style.display = 'none';
            updateElement('sys-gain', '-- W');
            updateElement('sys-delta', '--°C');
            updateElement('sys-efficiency', '--%');
            updateElement('sys-health', '--');
            updateElement('sys-co2', '-- kg');
            updateElement('sys-fault', 'No Analysis');

            const statusBadge = document.getElementById('global-status');
            statusBadge.className = 'status-badge status-normal';
            statusBadge.innerHTML = '<i class="fas fa-clock"></i> Pending Simulation';
        } else {
            if (clearBtn) clearBtn.style.display = 'flex';
            // Added logic for new features
            let qGain = 0;
            let deltaT = 0;
            let efficiency = data.average_efficiency;

            if (lastSimulationData) {
                qGain = lastSimulationData.useful_heat_gain;
                deltaT = lastSimulationData.simulated_outlet_temperature - lastSimulationData.inlet_temperature;
            }

            // Estimate CO2 Offset: (~0.5kg per kWh of heat produced)
            // Simplified calculation for dashboard context
            const co2Offset = (qGain / 1000) * 0.5 * data.total_simulations;

            updateElement('sys-gain', qGain.toFixed(0) + ' W');
            updateElement('sys-delta', deltaT.toFixed(1) + '°C');
            updateElement('sys-efficiency', efficiency.toFixed(1) + '%');
            updateElement('sys-health', data.system_health_index.toFixed(0));
            updateElement('sys-co2', co2Offset.toFixed(2) + ' kg');
            updateElement('sys-fault', data.recent_faults.length > 0 ? data.recent_faults[0] : 'Normal');

            const statusBadge = document.getElementById('global-status');
            if (data.system_health_index < 90) {
                statusBadge.className = 'status-badge status-fault';
                statusBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Action Required';
            } else {
                statusBadge.className = 'status-badge status-normal';
                statusBadge.innerHTML = '<i class="fas fa-shield-check"></i> System Stable';
            }
        }

        renderDashboardCharts(data);
    } catch (error) {
        console.error('Dashboard Error:', error);
        // Mock data for demo if API fails
        renderDashboardCharts({ average_efficiency: 75, system_health_index: 100 });
    }
}

async function resetSystemStats() {
    if (!confirm('Clear dashboard metrics for ' + currentUserId + '? (Note: Detailed Logs and Diagnostic History will be preserved)')) return;
    try {
        await fetch(`${API_BASE_URL}/reset-stats`, {
            method: 'POST',
            headers: { 'X-User-ID': currentUserId }
        });
        localStorage.removeItem('lastSimulation');
        lastSimulationData = null;
        loadDashboard();
        alert('System history cleared successfully.');
    } catch (e) {
        alert('Error resetting stats.');
    }
}

function renderDashboardCharts(apiData) {
    const history = apiData.history || [];
    const labels = history.map(h => h.timestamp);
    const effData = history.map(h => h.efficiency);
    const gainData = history.map(h => h.heat_gain);

    const ctx1 = document.getElementById('efficiencyChart');
    if (ctx1) {
        if (charts.efficiency) charts.efficiency.destroy();
        charts.efficiency = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: labels.length > 0 ? labels : ['Pending'],
                datasets: [{
                    label: 'Efficiency %',
                    data: effData.length > 0 ? effData : [0],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                animation: { duration: 800 },
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    const ctx2 = document.getElementById('powerChart');
    if (ctx2) {
        if (charts.power) charts.power.destroy();
        charts.power = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: labels.length > 0 ? labels : ['Pending'],
                datasets: [{
                    label: 'Yield (W)',
                    data: gainData.length > 0 ? gainData : [0],
                    backgroundColor: '#3b82f6',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                animation: { duration: 800 },
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

// --- Simulation ---
function setupSimulation() {
    const form = document.getElementById('sim-form');
    if (!form) return;

    let simLiveChart = null;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;

        const inputs = {
            solar_irradiance: parseFloat(document.getElementById('irradiance').value),
            inlet_temperature: parseFloat(document.getElementById('tin').value),
            ambient_temperature: parseFloat(document.getElementById('tamb').value),
            mass_flow_rate: parseFloat(document.getElementById('flow_rate').value),
            fault_condition: document.getElementById('fault_type').value,
            outlet_temperature: document.getElementById('measured_tout').value ? parseFloat(document.getElementById('measured_tout').value) : null
        };

        try {
            const response = await fetch(`${API_BASE_URL}/simulate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                },
                body: JSON.stringify(inputs)
            });

            if (!response.ok) throw new Error('Simulation failed');
            const result = await response.json();

            // Store result
            lastSimulationData = { ...inputs, ...result };
            localStorage.setItem('lastSimulation', JSON.stringify(lastSimulationData));

            // UI Update
            document.getElementById('sim-results').style.display = 'block';
            updateElement('res-tout', result.simulated_outlet_temperature.toFixed(2));
            updateElement('res-eff', result.thermal_efficiency.toFixed(1) + '%');
            updateElement('res-gain', result.useful_heat_gain.toFixed(0));

            // Animate Real-time Chart
            const ctx = document.getElementById('sim-live-chart');
            if (ctx) {
                if (simLiveChart) simLiveChart.destroy();

                const steps = 10;
                const dataPoints = [];
                const labels = [];

                simLiveChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Stability Trace',
                            data: dataPoints,
                            borderColor: '#10b981',
                            tension: 0.3,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: { y: { display: false }, x: { display: false } },
                        plugins: { legend: { display: false } }
                    }
                });

                // Fake "Computing" Animation
                for (let i = 0; i <= steps; i++) {
                    setTimeout(() => {
                        labels.push('');
                        // Convergence simulation animation
                        const noise = (Math.random() - 0.5) * (steps - i);
                        dataPoints.push(result.thermal_efficiency + noise);
                        simLiveChart.update();
                    }, i * 150);
                }
            }

            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } catch (error) {
            alert('Backend connection error. Please ensure the FastAPI server is running.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// --- Performance ---
async function loadPerformance() {
    if (!lastSimulationData) return;

    try {
        const payload = {
            solar_irradiance: lastSimulationData.solar_irradiance,
            inlet_temperature: lastSimulationData.inlet_temperature,
            outlet_temperature: lastSimulationData.outlet_temperature || lastSimulationData.simulated_outlet_temperature,
            mass_flow_rate: lastSimulationData.mass_flow_rate,
            ambient_temperature: lastSimulationData.ambient_temperature,
            fault_condition: lastSimulationData.fault_condition
        };

        const response = await fetch(`${API_BASE_URL}/analyze-performance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        updateElement('perf-eff', data.thermal_efficiency.toFixed(1) + '%');
        updateElement('perf-loss', data.heat_loss.toFixed(0) + ' W');
        updateElement('perf-deg', data.performance_degradation.toFixed(1) + '%');

        const prog = document.getElementById('eff-progress');
        if (prog) prog.style.width = data.thermal_efficiency + '%';

        const tbody = document.getElementById('perf-table-body');
        tbody.innerHTML = `
            <tr>
                <td>Thermal Efficiency</td>
                <td>75.0% (FR-τα)</td>
                <td>${data.thermal_efficiency.toFixed(1)}%</td>
                <td style="color: var(--danger)">${data.performance_degradation.toFixed(1)}%</td>
            </tr>
            <tr>
                <td>Outlet Temperature</td>
                <td>Baseline Derived</td>
                <td>${payload.outlet_temperature.toFixed(1)}°C</td>
                <td>${data.condition}</td>
            </tr>
            <tr>
                <td>Status Message</td>
                <td colspan="3">${data.message}</td>
            </tr>
        `;
    } catch (e) { console.error(e); }
}

// --- Diagnosis ---
function setupDiagnosis() {
    const btn = document.getElementById('btn-diagnose');
    if (!btn) return;

    const tabSim = document.getElementById('tab-sim');
    const tabManual = document.getElementById('tab-manual');
    const manualForm = document.getElementById('manual-form');
    const sourceStatus = document.getElementById('source-status');

    let mode = 'sim'; // Default mode

    tabSim.addEventListener('click', () => {
        mode = 'sim';
        tabSim.style.background = 'var(--primary)';
        tabManual.style.background = 'var(--text-muted)';
        manualForm.style.display = 'none';
        sourceStatus.textContent = lastSimulationData ? 'Sync Active' : 'No Sim Found';
    });

    tabManual.addEventListener('click', () => {
        mode = 'manual';
        tabManual.style.background = 'var(--primary)';
        tabSim.style.background = 'var(--text-muted)';
        manualForm.style.display = 'block';
        sourceStatus.textContent = 'Manual Ready';
    });

    btn.addEventListener('click', async () => {
        let payload = {};

        if (mode === 'sim') {
            if (!lastSimulationData) {
                alert('Please run a simulation first or use Manual Entry.');
                return;
            }
            payload = {
                solar_irradiance: lastSimulationData.solar_irradiance,
                inlet_temperature: lastSimulationData.inlet_temperature,
                outlet_temperature: lastSimulationData.simulated_outlet_temperature,
                mass_flow_rate: lastSimulationData.mass_flow_rate,
                thermal_efficiency: lastSimulationData.thermal_efficiency,
                heat_gain: lastSimulationData.useful_heat_gain
            };
        } else {
            // Manual Mode calculation
            const gVal = document.getElementById('diag-g').value;
            const tinVal = document.getElementById('diag-tin').value;
            const toutVal = document.getElementById('diag-tout').value;
            const flowVal = document.getElementById('diag-flow').value;

            const G = gVal !== '' ? parseFloat(gVal) : 800;
            const Tin = tinVal !== '' ? parseFloat(tinVal) : 30;
            const Tout = toutVal !== '' ? parseFloat(toutVal) : 55;
            const m = flowVal !== '' ? parseFloat(flowVal) : 0.02;

            // Physical calculation for diagnostic completeness
            const Cp = 4186;
            const Area = 2.0;
            const qGain = m * Cp * (Tout - Tin);
            const efficiency = G > 0 ? (qGain / (G * Area)) * 100 : 0;

            payload = {
                solar_irradiance: G,
                inlet_temperature: Tin,
                outlet_temperature: Tout,
                mass_flow_rate: m,
                thermal_efficiency: Math.max(0, efficiency),
                heat_gain: Math.max(0, qGain)
            };
        }

        btn.innerHTML = '<i class="fas fa-microscope fa-spin"></i> Analyzing...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/detect-fault`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            document.getElementById('diag-result').style.display = 'block';
            updateElement('diag-fault', result.predicted_fault);
            updateElement('diag-conf', result.confidence_score.toFixed(1) + '%');
            updateElement('diag-sev', result.confidence_score > 85 ? 'Critical Action Required' : 'Monitor System');
            updateElement('diag-rec', result.suggestion);

            // Show/Hide Maintenance Guide and filter specific suggestions
            const guide = document.getElementById('maintenance-guide');
            if (guide) {
                if (result.predicted_fault === 'Normal Condition') {
                    guide.style.display = 'none';
                } else {
                    guide.style.display = 'block';
                    // Hide all hint cards first
                    document.querySelectorAll('.fault-hint').forEach(el => el.style.display = 'none');

                    // Show only the specific card
                    if (result.predicted_fault === 'Dust Accumulation') document.getElementById('hint-dust').style.display = 'block';
                    if (result.predicted_fault === 'Heat Leakage') document.getElementById('hint-leak').style.display = 'block';
                    if (result.predicted_fault === 'Pump Degradation') document.getElementById('hint-pump').style.display = 'block';
                    if (result.predicted_fault === 'Sensor Drift') document.getElementById('hint-sensor').style.display = 'block';
                    if (result.predicted_fault === 'Low Efficiency') document.getElementById('hint-low').style.display = 'block';
                }
            }

            // Reload history table
            loadDiagnosticHistory();

            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } catch (e) {
            alert('Diagnostic engine error.');
        } finally {
            btn.innerHTML = '<i class="fas fa-brain"></i> Start Deep Diagnostic Scan';
            btn.disabled = false;
        }
    });

    // Refresh history button
    const refreshBtn = document.getElementById('btn-refresh-history');
    if (refreshBtn) refreshBtn.addEventListener('click', loadDiagnosticHistory);

    loadDiagnosticHistory();
}

async function loadDiagnosticHistory() {
    const tbody = document.getElementById('diag-history-body');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_BASE_URL}/diagnostic-history`, {
            headers: { 'X-User-ID': currentUserId }
        });
        const history = await response.json();

        tbody.innerHTML = '';
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No history found</td></tr>';
            return;
        }

        history.forEach((rec, idx) => {
            const row = document.createElement('tr');

            // Highlight if fault repeats in sequence
            const isRepeat = idx < history.length - 1 && rec.predicted_fault !== 'Normal Condition' && rec.predicted_fault === history[idx + 1].predicted_fault;
            if (isRepeat) row.style.background = 'rgba(239, 68, 68, 0.05)';

            row.innerHTML = `
                <td>${rec.timestamp.split(' ')[1]}<br><small>${rec.timestamp.split(' ')[0]}</small></td>
                <td>
                    <span title="Irradiance">${rec.solar_irradiance}W</span>, 
                    <span title="Temp In">${rec.inlet_temperature}°</span>, 
                    <span title="Temp Out">${rec.outlet_temperature}°</span>
                </td>
                <td style="color: ${rec.predicted_fault === 'Normal Condition' ? 'var(--secondary)' : 'var(--danger)'}">
                    ${rec.predicted_fault}
                    ${isRepeat ? ' <i class="fas fa-repeat" title="Repeated Fault"></i>' : ''}
                </td>
                <td>${rec.confidence_score}%</td>
                <td>
                    <button class="btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="alert('Params: ${rec.mass_flow_rate}kg/s, ${rec.thermal_efficiency}%, ${rec.heat_gain}W')">
                        Details
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (e) {
        console.error('Error loading diagnostic history:', e);
    }
}

// --- Reports & Results ---
function setupResults() {
    renderResultCharts();
    loadLogsTable();

    const btn = document.getElementById('btn-download-report');
    if (btn) btn.addEventListener('click', generatePDF);

    // Info click handlers
    const infoEff = document.getElementById('info-eff-type');
    const infoPerf = document.getElementById('info-perf-comp');

    if (infoEff) infoEff.addEventListener('click', () => toggleGraphDesc('eff-type'));
    if (infoPerf) infoPerf.addEventListener('click', () => toggleGraphDesc('perf-comp'));
}

function toggleGraphDesc(type) {
    const el = document.getElementById(`desc-${type}`);
    if (!el) return;

    if (el.style.display === 'none') {
        el.style.display = 'block';
        el.classList.add('animate-fade');
    } else {
        el.style.display = 'none';
        el.classList.remove('animate-fade');
    }
}

async function loadLogsTable() {
    const tbody = document.getElementById('logs-body');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_BASE_URL}/dashboard-summary`, {
            headers: { 'X-User-ID': currentUserId }
        });
        const data = await response.json();

        tbody.innerHTML = '';
        if (!data.history || data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No simulation records found</td></tr>';
            return;
        }

        // Reverse history to show latest first
        [...data.history].reverse().forEach(item => {
            const row = document.createElement('tr');
            const healthClass = item.efficiency > 70 ? 'status-normal' : 'status-fault';
            const statusTag = item.efficiency > 70 ? 'Optimal' : 'Checking';

            row.innerHTML = `
                <td>${item.timestamp}</td>
                <td>Solar Analysis</td>
                <td>${item.efficiency.toFixed(1)}%</td>
                <td><span class="status-badge ${healthClass}">${statusTag}</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (e) {
        console.error('Error loading logs:', e);
    }
}

async function renderResultCharts() {
    try {
        const response = await fetch(`${API_BASE_URL}/diagnostic-history`, {
            headers: { 'X-User-ID': currentUserId }
        });
        const history = await response.json();

        if (!history || history.length === 0) return;

        // 1. Calculate Average Efficiency by Fault Type
        const faultGroups = {};
        history.forEach(rec => {
            if (!faultGroups[rec.predicted_fault]) faultGroups[rec.predicted_fault] = [];
            faultGroups[rec.predicted_fault].push(rec.thermal_efficiency);
        });

        const labels = Object.keys(faultGroups);
        const avgEfficiencies = labels.map(label => {
            const sum = faultGroups[label].reduce((a, b) => a + b, 0);
            return (sum / faultGroups[label].length).toFixed(1);
        });

        // 2. Get Latest vs Ideal
        const latest = history[0];

        const ctx1 = document.getElementById('chart-deg');
        if (ctx1) {
            if (charts.deg) charts.deg.destroy();
            charts.deg = new Chart(ctx1, {
                type: 'polarArea',
                data: {
                    labels: labels,
                    datasets: [{
                        data: avgEfficiencies,
                        backgroundColor: [
                            '#10b981', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#3b82f6'
                        ].slice(0, labels.length)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        const ctx2 = document.getElementById('chart-comp');
        if (ctx2) {
            if (charts.comp) charts.comp.destroy();
            charts.comp = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: ['Thermal Eff %', 'Heat Gain W'],
                    datasets: [
                        { label: 'Ideal', data: [75, 4500], backgroundColor: '#10b981' },
                        {
                            label: 'Current (Latest)',
                            data: [latest.thermal_efficiency, latest.heat_gain],
                            backgroundColor: latest.thermal_efficiency > 70 ? '#3b82f6' : '#ef4444'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // --- Generate Descriptions ---
        const descEff = document.getElementById('desc-eff-type');
        if (descEff) {
            let summary = `This Polar Area chart visualizes the <strong>impact of specific faults</strong> on system efficiency. `;
            const worstFault = labels[avgEfficiencies.indexOf(Math.min(...avgEfficiencies).toString())];
            const bestFault = labels[avgEfficiencies.indexOf(Math.max(...avgEfficiencies).toString())];

            summary += `Currently, <strong>${worstFault}</strong> exhibits the highest performance drop (average efficiency: ${Math.min(...avgEfficiencies)}%). `;
            summary += `In contrast, <strong>${bestFault}</strong> shows the highest resilience with ${Math.max(...avgEfficiencies)}% efficiency. `;
            descEff.innerHTML = summary;
        }

        const descPerf = document.getElementById('desc-perf-comp');
        if (descPerf) {
            const currentEff = latest.thermal_efficiency;
            const idealEff = 75;
            const diff = (idealEff - currentEff).toFixed(1);

            let summary = `Comparative Analysis: The system is currently operating at <strong>${currentEff}%</strong> efficiency, `;
            summary += `which is <strong>${diff}% lower</strong> than the theoretical ideal of ${idealEff}%. `;

            if (diff > 20) {
                summary += `This gap indicates a <strong>critical degradation</strong> requiring immediate maintenance as noted in the logs.`;
            } else if (diff > 5) {
                summary += `This moderate deviation suggests the beginning of component fouling or drift.`;
            } else {
                summary += `The system is performing near peak theoretical capacity.`;
            }
            descPerf.innerHTML = summary;
        }
    } catch (e) {
        console.error('Error rendering dynamic charts:', e);
    }
}

async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header & Branding
    doc.setFillColor(5, 4, 10); // Matches --bg-dark
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 180, 0); // Matches --solar-gold
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('SolarDiagnose | Analysis Report', 20, 25);

    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`User ID: ${currentUserId} | Date: ${new Date().toLocaleString()}`, 20, 34);

    try {
        // Fetch Data for Report
        const histRes = await fetch(`${API_BASE_URL}/diagnostic-history`, { headers: { 'X-User-ID': currentUserId } });
        const summaryRes = await fetch(`${API_BASE_URL}/dashboard-summary`, { headers: { 'X-User-ID': currentUserId } });
        const history = await histRes.json();
        const summary = await summaryRes.json();

        let yPos = 55;

        // 2. Simulation Review Section
        doc.setTextColor(5, 4, 10);
        doc.setFontSize(16);
        doc.text('I. Executive Simulation Review', 20, yPos);
        yPos += 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text([
            `Total Simulation Cycles Performed: ${summary.total_simulations}`,
            `Overall Average Operating Efficiency: ${summary.average_efficiency.toFixed(2)}%`,
            `Estimated System Health Index: ${summary.system_health_index.toFixed(1)}/100`
        ], 20, yPos);
        yPos += 20;

        // 3. Performance Metrics
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('II. System Performance Metrics', 20, yPos);

        const perfData = history.slice(0, 5).map(h => [
            h.timestamp.split(' ')[1],
            `${h.solar_irradiance} W/m2`,
            `${h.thermal_efficiency.toFixed(1)}%`,
            `${h.heat_gain.toFixed(0)} W`,
            h.predicted_fault === 'Normal Condition' ? 'Healthy' : 'Degraded'
        ]);

        doc.autoTable({
            startY: yPos + 5,
            head: [['Time', 'Irradiance', 'Efficiency', 'Heat Gain', 'Status']],
            body: perfData,
            headStyles: { fillColor: [255, 123, 0] },
            theme: 'striped'
        });
        yPos = doc.lastAutoTable.finalY + 15;

        // 4. Fault Diagnosis & AI Analysis
        doc.setFontSize(16);
        doc.text('III. AI-Driven Fault Diagnosis Report', 20, yPos);

        const faultData = history.slice(0, 10).map(h => [
            h.timestamp,
            h.predicted_fault,
            `${h.confidence_score}%`,
            h.confidence_score > 85 ? 'Critical' : 'Moderate'
        ]);

        doc.autoTable({
            startY: yPos + 5,
            head: [['Timestamp', 'Detected Fault Type', 'AI Confidence', 'Severity']],
            body: faultData,
            headStyles: { fillColor: [244, 63, 94] },
            theme: 'grid'
        });
        yPos = doc.lastAutoTable.finalY + 15;

        // 5. Maintenance Recommendations (Suggestions)
        if (yPos > 240) { doc.addPage(); yPos = 20; }

        doc.setFontSize(16);
        doc.text('IV. Actionable Maintenance Suggestions', 20, yPos);
        yPos += 10;
        doc.setFontSize(10);

        const uniqueFaults = [...new Set(history.map(h => h.predicted_fault))].filter(f => f !== 'Normal Condition');

        if (uniqueFaults.length === 0) {
            doc.setTextColor(16, 185, 129);
            doc.text('System is operating within optimal parameters. No immediate maintenance required.', 20, yPos);
        } else {
            uniqueFaults.forEach(fault => {
                doc.setTextColor(244, 63, 94);
                doc.setFont('helvetica', 'bold');
                doc.text(`> ${fault.toUpperCase()}:`, 20, yPos);
                yPos += 5;
                doc.setTextColor(60, 60, 60);
                doc.setFont('helvetica', 'normal');

                let advice = "";
                if (fault === 'Dust Accumulation') advice = "Perform surface cleaning of collector glazing using demineralized water; verify no new shading obstructions.";
                if (fault === 'Heat Leakage') advice = "Inspect thermal insulation cladding for breaches; check piping gaskets and mounting bridges for heat loss.";
                if (fault === 'Pump Degradation') advice = "Initiate system descaling flush; verify pump motor electrical signature and impeller health.";
                if (fault === 'Sensor Drift') advice = "Execute electronic sensor recalibration routine; verify signal-to-noise ratio at RTD junctions.";

                const splitText = doc.splitTextToSize(advice, pageWidth - 40);
                doc.text(splitText, 25, yPos);
                yPos += (splitText.length * 5) + 5;
            });
        }

        // Footer
        const finalY = doc.internal.pageSize.getHeight() - 10;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('Generated by SolarDiagnose AI - For academic and experimental evaluation only.', pageWidth / 2, finalY, { align: 'center' });

        doc.save(`${currentUserId}_Solar_Deep_Report.pdf`);

    } catch (err) {
        console.error("PDF Export failed:", err);
        alert("Report generation failed. Please ensure the backend is running.");
    }
}

// Helper
function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
