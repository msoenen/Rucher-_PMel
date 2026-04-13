// Remplacez par votre URL Apps Script JSON
const JSON_URL = "VOTRE_URL_APPS_SCRIPT?action=status";
const CHART_URL_BASE = "VOTRE_URL_APPS_SCRIPT";

let currentTab = "dashboard";
let currentMetric = "poids";
let currentPeriod = "7j";
let currentChartType = "line";
let selectedHives = [1, 2, 3];
let refreshSeconds = 60;

let mainChart = null;
let detailWeightChart = null;
let detailTempChart = null;
let sparkCharts = [];
let lastStatusData = null;

function showBanner(message) {
  const el = document.getElementById("banner");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideBanner() {
  document.getElementById("banner").classList.add("hidden");
}

function formatValue(v, suffix = "") {
  if (v === "NaN" || v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isNaN(n)) return n.toFixed(1).replace(".", ",") + suffix;
  return String(v);
}

function formatDelta(v, suffix = "") {
  if (v === "NaN" || v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + suffix;
}

function palette(idx) {
  const colors = [
    "#b7791f", "#2f855a", "#805ad5", "#e53e3e",
    "#3182ce", "#dd6b20", "#38a169", "#d53f8c",
    "#84cc16", "#f97316", "#6366f1", "#0f766e",
    "#ca8a04", "#dc2626", "#7c3aed", "#0891b2"
  ];
  return colors[idx % colors.length];
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }
  return await res.json();
}

function buildDashboardFromStatus(data) {
  const dashboardGrid = document.getElementById("dashboardGrid");

  const activeHives = data.ruches.filter(r => !["COUPURE", "NA"].includes(r.etat)).length;
  const totalWeight = data.ruches.reduce((sum, r) => {
    const n = Number(r.poids);
    return !Number.isNaN(n) ? sum + n : sum;
  }, 0);
  const temps = data.ruches
    .map(r => Number(r.temp))
    .filter(v => !Number.isNaN(v));
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

  dashboardGrid.innerHTML = `
    <div class="card-box">
      <div class="card-title">Ruches actives</div>
      <div class="card-value">${activeHives}</div>
    </div>

    <div class="card-box">
      <div class="card-title">Poids total</div>
      <div class="card-value">${formatValue(totalWeight, " kg")}</div>
    </div>

    <div class="card-box">
      <div class="card-title">Temp. moy. int.</div>
      <div class="card-value">${formatValue(avgTemp, " °C")}</div>
    </div>

    <div class="card-box">
      <div class="card-title">Temp. ext.</div>
      <div class="card-value">${formatValue(data.tempExt, " °C")}</div>
    </div>

    <div class="card-box">
      <div class="card-title">Alertes</div>
      <div class="card-value">${data.alertCount ?? 0}</div>
    </div>

    <div class="card-box">
      <div class="card-title">Dernière mesure</div>
      <div class="card-value">${data.timestamp || "—"}</div>
    </div>
  `;

  document.getElementById("topTemp").textContent = formatValue(data.tempExt, "°C");
  document.getElementById("topDate").textContent = data.timestamp || "—";
  document.getElementById("topAlerts").textContent = data.alertCount ?? 0;
}

function destroySparkCharts() {
  sparkCharts.forEach(c => c.destroy());
  sparkCharts = [];
}

function renderStatusCards(data) {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  destroySparkCharts();

  data.ruches.forEach(r => {
    const div = document.createElement("div");
    div.className = "hive-card " + (r.etat || "NA");
    div.innerHTML = `
      <div class="hive-header">
        <div class="hive-title">Ruche ${r.id}</div>
        <div class="state">${r.etat || "NA"}</div>
      </div>

      <div class="hive-values">
        <div class="value-box">
          <div class="value-label">Poids</div>
          <div class="value-number">${formatValue(r.poids, " kg")}</div>
        </div>

        <div class="value-box">
          <div class="value-label">Δ 24h</div>
          <div class="value-number">${formatDelta(r.delta24h, " kg")}</div>
        </div>

        <div class="value-box">
          <div class="value-label">Temp.</div>
          <div class="value-number">${formatValue(r.temp, " °C")}</div>
        </div>
      </div>

      <div class="spark-wrap">
        <canvas id="spark-${r.id}"></canvas>
      </div>
    `;

    div.addEventListener("click", () => openDetail(r.id));
    cards.appendChild(div);
  });

  data.ruches.forEach(r => {
    const canvas = document.getElementById(`spark-${r.id}`);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const series = Array.isArray(r.sparkPoids) ? r.sparkPoids : [];

    const spark = new Chart(ctx, {
      type: "line",
      data: {
        labels: series.map((_, i) => i),
        datasets: [{
          data: series,
          borderColor: "#b7791f",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });

    sparkCharts.push(spark);
  });
}

function renderHiveButtons() {
  const container = document.getElementById("hiveButtons");
  container.innerHTML = "";

  for (let i = 1; i <= 16; i++) {
    const btn = document.createElement("button");
    btn.className = "btn" + (selectedHives.includes(i) ? " active" : "");
    btn.textContent = "R" + i;
    btn.addEventListener("click", () => toggleHive(i));
    container.appendChild(btn);
  }
}

function toggleHive(id) {
  const idx = selectedHives.indexOf(id);
  if (idx >= 0) {
    if (selectedHives.length > 1) selectedHives.splice(idx, 1);
  } else {
    selectedHives.push(id);
  }
  renderHiveButtons();
  loadChart();
}

function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add("active");

  document.getElementById("dashboardTab").classList.toggle("hidden", tab !== "dashboard");
  document.getElementById("chartTab").classList.toggle("hidden", tab === "dashboard");

  if (tab === "poids") {
    currentMetric = "poids";
    document.getElementById("chartTitle").textContent = "Évolution du Poids";
    loadChart();
  } else if (tab === "temp") {
    currentMetric = "temp";
    document.getElementById("chartTitle").textContent = "Évolution de la Température";
    loadChart();
  } else {
    loadDashboard();
  }
}

function setPeriod(period, btn) {
  currentPeriod = period;
  document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  loadChart();
}

function setChartType(type, btn) {
  currentChartType = type;
  document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  loadChart();
}

async function loadDashboard() {
  try {
    const data = await fetchJson(JSON_URL);
    lastStatusData = data;
    hideBanner();
    buildDashboardFromStatus(data);
    renderStatusCards(data);
  } catch (err) {
    console.error(err);
    showBanner("Erreur chargement dashboard");
  }
}

function buildChartUrl(metric, period, hives) {
  const params = new URLSearchParams({
    action: "chart",
    metric: metric,
    period: period,
    hives: hives.join(",")
  });
  return `${CHART_URL_BASE}?${params.toString()}`;
}

async function loadChart() {
  try {
    const data = await fetchJson(buildChartUrl(currentMetric, currentPeriod, selectedHives));
    hideBanner();
    renderChart(data);
  } catch (err) {
    console.error(err);
    showBanner("Erreur chargement courbe");
  }
}

function renderChart(result) {
  const ctx = document.getElementById("mainChart").getContext("2d");
  if (mainChart) mainChart.destroy();

  mainChart = new Chart(ctx, {
    type: currentChartType,
    data: {
      labels: result.labels || [],
      datasets: (result.series || []).map((s, idx) => ({
        label: s.label,
        data: s.data,
        borderColor: palette(idx),
        backgroundColor: palette(idx) + "66",
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 0,
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom" }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6 } },
        y: { beginAtZero: false }
      }
    }
  });
}

async function openDetail(hiveId) {
  try {
    const url = `${CHART_URL_BASE}?action=hiveDetail&hive=${hiveId}&period=${currentPeriod}`;
    const data = await fetchJson(url);

    document.getElementById("detailTitle").textContent = "Ruche " + hiveId;
    document.getElementById("detailModal").classList.remove("hidden");

    const ctxW = document.getElementById("detailWeightChart").getContext("2d");
    const ctxT = document.getElementById("detailTempChart").getContext("2d");

    if (detailWeightChart) detailWeightChart.destroy();
    if (detailTempChart) detailTempChart.destroy();

    detailWeightChart = new Chart(ctxW, {
      type: "line",
      data: {
        labels: data.labels || [],
        datasets: [{
          label: "Poids",
          data: data.poids || [],
          borderColor: "#b7791f",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    detailTempChart = new Chart(ctxT, {
      type: "line",
      data: {
        labels: data.labels || [],
        datasets: [{
          label: "Température",
          data: data.temp || [],
          borderColor: "#e53e3e",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } catch (err) {
    console.error(err);
    showBanner("Erreur détail ruche");
  }
}

function closeDetail() {
  document.getElementById("detailModal").classList.add("hidden");
  if (detailWeightChart) detailWeightChart.destroy();
  if (detailTempChart) detailTempChart.destroy();
  detailWeightChart = null;
  detailTempChart = null;
}

function initEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll(".period-btn").forEach(btn => {
    btn.addEventListener("click", () => setPeriod(btn.dataset.period, btn));
  });

  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.addEventListener("click", () => setChartType(btn.dataset.type, btn));
  });

  document.getElementById("closeDetailBtn").addEventListener("click", closeDetail);
  document.getElementById("refreshBtn").addEventListener("click", () => {
    if (currentTab === "dashboard") loadDashboard();
    else loadChart();
  });
}

function init() {
  initEvents();
  renderHiveButtons();
  loadDashboard();

  setInterval(() => {
    if (currentTab === "dashboard") loadDashboard();
    else loadChart();
  }, refreshSeconds * 1000);
}

init();
