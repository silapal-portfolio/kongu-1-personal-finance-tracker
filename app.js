// ══════════════════════════════════════════
//   FinanceAI — app.js
//   Complete logic: transactions, charts,
//   anomaly detection, forecasting
// ══════════════════════════════════════════

const BASE_URL = "http://127.0.0.1:8000";

let transactions = JSON.parse(localStorage.getItem("financeai_txns")) || [];
let analyticsTab = "daily";

// Chart instances
let charts = {};

// Category icons + colours
const CAT_META = {
  food:          { icon: "🍔", color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
  transport:     { icon: "🚗", color: "#38bdf8", bg: "rgba(56,189,248,0.15)" },
  shopping:      { icon: "🛍️", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  entertainment: { icon: "🎬", color: "#fb923c", bg: "rgba(251,146,60,0.15)"  },
  technology:    { icon: "💻", color: "#34d399", bg: "rgba(52,211,153,0.15)"  },
  health:        { icon: "🏥", color: "#f472b6", bg: "rgba(244,114,182,0.15)" },
  education:     { icon: "📚", color: "#fbbf24", bg: "rgba(251,191,36,0.15)"  },
  utilities:     { icon: "💡", color: "#94a3b8", bg: "rgba(148,163,184,0.15)" },
  travel:        { icon: "✈️", color: "#60a5fa", bg: "rgba(96,165,250,0.15)"  },
  other:         { icon: "📦", color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

function getCat(name) {
  const key = (name || "other").toLowerCase().replace(/[^a-z]/g, "");
  return CAT_META[key] || CAT_META["other"];
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
  // Set default date
  document.getElementById("dateInput").value = todayStr();

  // Nav bindings
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });

  // Check API status
  checkAPI();

  // Month label
  document.getElementById("currentMonth").textContent =
    new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  // Render app
  checkEmptyState();
  if (transactions.length > 0) fullRefresh();
});

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
function navigate(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");

  const btn = document.querySelector(`[data-page="${pageId}"]`);
  if (btn) btn.classList.add("active");

  // Render relevant page content
  if (pageId === "analytics")    { renderAnalyticsCharts(); renderCategoryRank(); }
  if (pageId === "forecast")     runForecast();
  if (pageId === "anomalies")    renderAnomalies();
  if (pageId === "transactions") renderAllTransactions();
}

function goToAdd() {
  // Show appContent if empty state was showing
  checkEmptyState(true);
  navigate("add");
}

// ══════════════════════════════════════════
//  EMPTY STATE
// ══════════════════════════════════════════
function checkEmptyState(forceShow = false) {
  const empty = document.getElementById("emptyState");
  const app   = document.getElementById("appContent");

  if (transactions.length === 0 && !forceShow) {
    empty.style.display = "flex";
    app.style.display   = "none";
  } else {
    empty.style.display = "none";
    app.style.display   = "block";
  }
}

// ══════════════════════════════════════════
//  ADD TRANSACTION
// ══════════════════════════════════════════
async function addTransaction() {
  const merchant    = document.getElementById("merchantInput").value.trim();
  const description = document.getElementById("descInput").value.trim();
  const amount      = parseFloat(document.getElementById("amountInput").value);
  const date        = document.getElementById("dateInput").value;

  if (!merchant || !amount || !date) {
    showToast("⚠️ Please fill Merchant, Amount and Date", "warning");
    return;
  }

  if (amount <= 0) {
    showToast("⚠️ Amount must be greater than 0", "warning");
    return;
  }

  const btn  = document.getElementById("addBtn");
  const text = document.getElementById("addBtnText");
  btn.disabled = true;
  text.innerHTML = '<span class="spinner"></span> Analyzing…';

  let category = "Other";
  let anomalyResult = "Normal ✅";
  let isAnomaly = false;

  // ── CATEGORY PREDICTION ──
  try {
    const catRes = await fetch(BASE_URL + "/predict/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant, description, amount })
    });
    const catData = await catRes.json();
    category = catData.category || "Other";
  } catch (_) {
    category = guessCategory(merchant, description);
  }

  // ── ANOMALY DETECTION ──
  try {
    const features = Array(29).fill(0);
    features[28] = amount;

    const anomRes = await fetch(BASE_URL + "/predict/anomaly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features })
    });
    const anomData = await anomRes.json();
    anomalyResult = anomData.result || "Normal ✅";
    isAnomaly = anomalyResult.toLowerCase().includes("fraud");
  } catch (_) {
    isAnomaly = detectLocalAnomaly(amount);
    anomalyResult = isAnomaly ? "Fraud 🚨" : "Normal ✅";
  }

  // ── BUILD TRANSACTION ──
  const txn = { id: Date.now(), merchant, description, amount, date, category, anomaly: anomalyResult, isAnomaly };
  transactions.push(txn);
  localStorage.setItem("financeai_txns", JSON.stringify(transactions));

  // ── UPDATE UI ──
  checkEmptyState();
  fullRefresh();
  showAIPanel(txn);

  btn.disabled = false;
  text.textContent = "✦ Classify & Add";
  clearForm();

  showToast(isAnomaly ? "🚨 Anomaly detected in this transaction!" : "✅ Transaction added successfully", isAnomaly ? "error" : "success");
}

// ── LOCAL ANOMALY FALLBACK ──
function detectLocalAnomaly(amount) {
  if (transactions.length < 5) return false;
  const avg = transactions.reduce((s, t) => s + t.amount, 0) / transactions.length;
  return amount > avg * 4;
}

// ── LOCAL CATEGORY GUESS ──
function guessCategory(merchant, desc) {
  const text = (merchant + " " + desc).toLowerCase();
  if (/swiggy|zomato|food|pizza|biryani|restaurant|cafe|eat/.test(text)) return "Food";
  if (/uber|ola|metro|bus|fuel|petrol|diesel|cab/.test(text)) return "Transport";
  if (/amazon|flipkart|myntra|shop|cloth/.test(text)) return "Shopping";
  if (/netflix|hotstar|spotify|movie|game|entertain/.test(text)) return "Entertainment";
  if (/hospital|medical|doctor|pharma|medicine/.test(text)) return "Health";
  if (/college|school|course|book|udemy|education/.test(text)) return "Education";
  if (/electricity|water|internet|broadband|bill|recharge/.test(text)) return "Utilities";
  if (/laptop|phone|mobile|gadget|tech/.test(text)) return "Technology";
  return "Other";
}

function showAIPanel(txn) {
  const panel = document.getElementById("aiResultPanel");
  panel.classList.add("visible");

  document.getElementById("resultCategory").textContent = txn.category;
  document.getElementById("resultAnomaly").innerHTML = txn.isAnomaly
    ? `<span style="color:var(--danger);">🚨 Anomaly Detected</span>`
    : `<span style="color:var(--accent);">✅ Normal</span>`;

  document.getElementById("resultInsight").textContent = generateInsight(txn);
}

function generateInsight(txn) {
  const sameCat = transactions.filter(t => t.id !== txn.id && t.category === txn.category);
  const avgCat  = sameCat.length ? sameCat.reduce((s,t) => s+t.amount, 0) / sameCat.length : 0;

  if (txn.isAnomaly) {
    const avg = transactions.filter(t=>t.id!==txn.id).reduce((s,t)=>s+t.amount,0) / Math.max(transactions.length-1,1);
    return `⚠️ This transaction (₹${txn.amount}) is ${(txn.amount/avg).toFixed(1)}× your average spend. This has been flagged as unusual.`;
  }

  if (avgCat > 0 && txn.amount > avgCat * 2) {
    return `📊 You usually spend ₹${Math.round(avgCat)} on ${txn.category}. This is ${(txn.amount/avgCat).toFixed(1)}× higher than usual.`;
  }

  const todayTotal = transactions
    .filter(t => t.date === txn.date)
    .reduce((s,t) => s+t.amount, 0);

  if (todayTotal > 5000) {
    return `📅 You've spent ₹${todayTotal.toLocaleString("en-IN")} today across ${transactions.filter(t=>t.date===txn.date).length} transactions.`;
  }

  return `✅ Looks like a normal ${txn.category.toLowerCase()} expense. Keep tracking your spending!`;
}

function clearForm() {
  ["merchantInput","amountInput","descInput"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("dateInput").value = todayStr();
}

// ══════════════════════════════════════════
//  FULL REFRESH (ALL SECTIONS)
// ══════════════════════════════════════════
function fullRefresh() {
  updateDashboard();
  renderRecentTransactions();
  updateFilterDropdown();
}

// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
function updateDashboard() {
  const total = transactions.reduce((s,t) => s+t.amount, 0);
  document.getElementById("totalSpent").textContent = "₹" + total.toLocaleString("en-IN");
  document.getElementById("txnCount").textContent = transactions.length + " transactions";

  // This month
  const now = new Date();
  const thisMonth = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  const monthTxns = transactions.filter(t => t.date.startsWith(thisMonth));
  const monthTotal = monthTxns.reduce((s,t) => s+t.amount, 0);
  document.getElementById("monthlySpent").textContent = "₹" + monthTotal.toLocaleString("en-IN");
  document.getElementById("monthLabel").textContent = now.toLocaleDateString("en-IN",{month:"long"});

  // Anomaly count
  const anomCount = transactions.filter(t => t.isAnomaly).length;
  document.getElementById("anomalyCount").textContent = anomCount;

  // Top category
  const catMap = buildCategoryMap();
  const top = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
  if (top) {
    const meta = getCat(top[0]);
    document.getElementById("topCategory").textContent = meta.icon + " " + top[0];
    document.getElementById("topCategoryAmt").textContent = "₹" + top[1].toLocaleString("en-IN");
  }

  // Charts
  renderDashboardCharts(catMap);
}

function renderDashboardCharts(catMap) {
  // Daily trend
  const daily = buildDailyMap();
  const labels = Object.keys(daily).slice(-14); // last 14 days
  const data   = labels.map(k => daily[k]);

  destroyChart("trendChart");
  charts["trendChart"] = new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Daily Spend (₹)",
        data,
        borderColor: "#4ade80",
        backgroundColor: "rgba(74,222,128,0.08)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#4ade80",
        pointRadius: 4,
      }]
    },
    options: chartOptions()
  });

  // Pie
  const catLabels = Object.keys(catMap);
  const catData   = Object.values(catMap);
  const catColors = catLabels.map(c => getCat(c).color);

  destroyChart("pieChart");
  charts["pieChart"] = new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: catLabels,
      datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 2, borderColor: "#0d1422" }]
    },
    options: {
      ...chartOptions(),
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 11 }, padding: 12 } }
      }
    }
  });
}

// ══════════════════════════════════════════
//  ANALYTICS CHARTS
// ══════════════════════════════════════════
function setAnalyticsTab(tab, el) {
  analyticsTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderAnalyticsCharts();
}

function renderAnalyticsCharts() {
  let dataMap, title, color, chartType;

  if (analyticsTab === "daily") {
    dataMap = buildDailyMap();
    title = "Daily Spending (₹)";
    color = "#4ade80";
    chartType = "line";
    document.getElementById("analyticsChartTitle").textContent = "Daily Spending";
  } else if (analyticsTab === "weekly") {
    dataMap = buildWeeklyMap();
    title = "Weekly Spending (₹)";
    color = "#38bdf8";
    chartType = "bar";
    document.getElementById("analyticsChartTitle").textContent = "Weekly Spending";
  } else {
    dataMap = buildMonthlyMap();
    title = "Monthly Spending (₹)";
    color = "#a78bfa";
    chartType = "bar";
    document.getElementById("analyticsChartTitle").textContent = "Monthly Spending";
  }

  const labels = Object.keys(dataMap);
  const data   = Object.values(dataMap);

  destroyChart("analyticsChart");
  charts["analyticsChart"] = new Chart(document.getElementById("analyticsChart"), {
    type: chartType,
    data: {
      labels,
      datasets: [{
        label: title,
        data,
        borderColor: color,
        backgroundColor: chartType === "line" ? color + "20" : color + "cc",
        fill: chartType === "line",
        tension: 0.4,
        borderRadius: chartType === "bar" ? 8 : 0,
        pointBackgroundColor: color,
        pointRadius: chartType === "line" ? 4 : 0,
      }]
    },
    options: chartOptions()
  });

  // Category chart
  const catMap = buildCategoryMap();
  const catLabels = Object.keys(catMap);
  const catData   = Object.values(catMap);
  const catColors = catLabels.map(c => getCat(c).color);

  destroyChart("catChart");
  charts["catChart"] = new Chart(document.getElementById("catChart"), {
    type: "doughnut",
    data: {
      labels: catLabels,
      datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 2, borderColor: "#111927" }]
    },
    options: {
      ...chartOptions(),
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 11 }, padding: 10 } }
      }
    }
  });
}

function renderCategoryRank() {
  const catMap = buildCategoryMap();
  const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = sorted[0] ? sorted[0][1] : 1;

  const html = sorted.map(([cat, amt]) => {
    const meta = getCat(cat);
    const pct  = ((amt / max) * 100).toFixed(0);
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:14px;font-weight:600;">${meta.icon} ${cat}</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:${meta.color};">₹${amt.toLocaleString("en-IN")}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;">
          <div style="width:${pct}%;height:100%;background:${meta.color};border-radius:3px;transition:width 0.6s;"></div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("catRankList").innerHTML = html || "<div class='empty-msg'><p>No data yet</p></div>";
}

// ══════════════════════════════════════════
//  FORECAST
// ══════════════════════════════════════════
async function runForecast() {
  const el      = document.getElementById("forecastBig");
  const badge   = document.getElementById("forecastBadge");
  const insight = document.getElementById("forecastInsightBox");

  if (transactions.length < 5) {
    el.textContent = "₹—";
    badge.textContent = `Add ${5 - transactions.length} more transactions to unlock`;
    return;
  }

  // Use amounts from transactions (up to last 30)
  const last30 = transactions.slice(-30).map(t => t.amount);

  // Try LSTM API
  let prediction = null;
  try {
    const res = await fetch(BASE_URL + "/predict/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_30_days: last30 })
    });
    const data = await res.json();
    prediction = Math.round(data.prediction);
  } catch (_) {
    // Fallback: linear trend
    prediction = localForecast(last30);
  }

  el.textContent    = "₹" + prediction.toLocaleString("en-IN");
  badge.textContent = "Predicted next month";

  // Monthly comparison
  const monthly = buildMonthlyMap();
  const months  = Object.values(monthly);
  const lastMonth = months[months.length - 1] || 0;
  const diff    = prediction - lastMonth;
  const pct     = lastMonth > 0 ? ((diff / lastMonth) * 100).toFixed(1) : 0;

  insight.style.display = "block";
  if (diff > 0) {
    insight.textContent = `📈 Your spending is predicted to increase by ₹${Math.abs(diff).toLocaleString("en-IN")} (${pct}%) compared to last month. Consider reducing discretionary expenses.`;
  } else {
    insight.textContent = `📉 Great news! Your spending is predicted to drop by ₹${Math.abs(diff).toLocaleString("en-IN")} (${Math.abs(pct)}%) next month. Keep it up!`;
  }

  renderForecastChart(last30, prediction);
}

function localForecast(arr) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((a,b)=>a+b,0);
  const avg = sum / arr.length;
  const days = 30;
  return Math.round(avg * days);
}

function renderForecastChart(history, prediction) {
  const labels = history.map((_, i) => "Day " + (i + 1));
  labels.push("Next Month →");
  const data = [...history, null];

  destroyChart("forecastChart");
  charts["forecastChart"] = new Chart(document.getElementById("forecastChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Past Transactions (₹)",
          data: [...history, history[history.length-1]],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: "#38bdf8",
        },
        {
          label: "Forecast (₹)",
          data: [...Array(history.length).fill(null), prediction],
          borderColor: "#4ade80",
          backgroundColor: "rgba(74,222,128,0.15)",
          borderDash: [6,3],
          pointRadius: 8,
          pointBackgroundColor: "#4ade80",
          fill: true,
        }
      ]
    },
    options: chartOptions()
  });
}

// ══════════════════════════════════════════
//  ANOMALIES
// ══════════════════════════════════════════
function renderAnomalies() {
  const anomalies = transactions.filter(t => t.isAnomaly);
  const el = document.getElementById("anomalyList");

  if (anomalies.length === 0) {
    el.innerHTML = `<div class="empty-msg"><div class="icon">✅</div><p>No anomalies detected.<br/>Your spending looks normal.</p></div>`;
    return;
  }

  // Sort by amount desc
  const sorted = [...anomalies].sort((a,b) => b.amount - a.amount);

  el.innerHTML = sorted.map(t => {
    const avg = transactions.filter(x => x.id !== t.id).reduce((s,x)=>s+x.amount,0) / Math.max(transactions.length-1,1);
    const mult = avg > 0 ? (t.amount / avg).toFixed(1) : "?";
    const meta = getCat(t.category);

    return `
      <div class="alert-item" style="margin-bottom:12px;">
        <div class="alert-icon">🚨</div>
        <div style="flex:1;">
          <div class="alert-title">${t.merchant}</div>
          <div class="alert-detail">
            ${meta.icon} ${t.category} · ${formatDate(t.date)}<br/>
            <span style="color:var(--warning);">${mult}× higher</span> than your average transaction of ₹${Math.round(avg).toLocaleString("en-IN")}
          </div>
          ${t.description ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${t.description}</div>` : ""}
        </div>
        <div class="alert-amount">₹${t.amount.toLocaleString("en-IN")}</div>
      </div>
    `;
  }).join("");
}

// ══════════════════════════════════════════
//  TRANSACTIONS
// ══════════════════════════════════════════
function renderRecentTransactions() {
  const recent = [...transactions].reverse().slice(0, 5);
  document.getElementById("recentList").innerHTML = recent.length
    ? recent.map(txnHTML).join("")
    : `<div class="empty-msg" style="padding:20px;"><p>No transactions yet.</p></div>`;
}

function renderAllTransactions() {
  const catFilter   = document.getElementById("filterCat").value.toLowerCase();
  const monthFilter = document.getElementById("filterMonth").value;

  let filtered = [...transactions].reverse();

  if (catFilter)   filtered = filtered.filter(t => (t.category||"").toLowerCase().includes(catFilter));
  if (monthFilter) filtered = filtered.filter(t => t.date.startsWith(monthFilter));

  document.getElementById("txnPageCount").textContent = filtered.length + " transactions";
  document.getElementById("allTransactionsList").innerHTML = filtered.length
    ? filtered.map(txnHTML).join("")
    : `<div class="empty-msg"><div class="icon">🔍</div><p>No transactions match the filter.</p></div>`;
}

function txnHTML(t) {
  const meta = getCat(t.category);
  const catTag = `<span class="txn-cat" style="background:${meta.bg};color:${meta.color};">${meta.icon} ${t.category}</span>`;
  const flag = t.isAnomaly ? `<span class="txn-anomaly-flag" title="Anomaly detected">🚨</span>` : "";

  return `
    <div class="txn-item">
      <div class="txn-icon" style="background:${meta.bg};">${meta.icon}</div>
      <div class="txn-info">
        <div class="txn-merchant">${t.merchant} ${flag}</div>
        <div class="txn-desc">${t.description || "—"}</div>
        <div class="txn-meta">${catTag}<span class="txn-date">${formatDate(t.date)}</span></div>
      </div>
      <div class="txn-amount" style="color:${t.isAnomaly ? 'var(--danger)' : 'var(--text)'};">
        ₹${t.amount.toLocaleString("en-IN")}
      </div>
    </div>
  `;
}

function updateFilterDropdown() {
  const cats = [...new Set(transactions.map(t => t.category))].sort();
  const sel  = document.getElementById("filterCat");
  const cur  = sel.value;
  sel.innerHTML = `<option value="">All Categories</option>` +
    cats.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join("");
  if (cur) sel.value = cur;
}

function clearAllTransactions() {
  if (!confirm("Delete ALL transactions? This cannot be undone.")) return;
  transactions = [];
  localStorage.removeItem("financeai_txns");
  Object.values(charts).forEach(c => c?.destroy());
  charts = {};
  checkEmptyState();
  showToast("🗑 All transactions cleared", "warning");
}

// ══════════════════════════════════════════
//  DATA HELPERS
// ══════════════════════════════════════════
function buildDailyMap() {
  const map = {};
  transactions.forEach(t => {
    map[t.date] = (map[t.date] || 0) + t.amount;
  });
  return sortObj(map);
}

function buildWeeklyMap() {
  const map = {};
  transactions.forEach(t => {
    const d   = new Date(t.date);
    const wk  = getWeekLabel(d);
    map[wk] = (map[wk] || 0) + t.amount;
  });
  return sortObj(map);
}

function buildMonthlyMap() {
  const map = {};
  transactions.forEach(t => {
    const m = t.date.substring(0, 7);
    map[m] = (map[m] || 0) + t.amount;
  });
  return sortObj(map);
}

function buildCategoryMap() {
  const map = {};
  transactions.forEach(t => {
    const cat = t.category || "Other";
    map[cat] = (map[cat] || 0) + t.amount;
  });
  return map;
}

function getWeekLabel(d) {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().split("T")[0];
}

function sortObj(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a],[b]) => a.localeCompare(b)));
}

// ══════════════════════════════════════════
//  CHART HELPERS
// ══════════════════════════════════════════
function chartOptions() {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111927",
        titleColor: "#f1f5f9",
        bodyColor: "#94a3b8",
        borderColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: ctx => " ₹" + Number(ctx.raw || 0).toLocaleString("en-IN")
        }
      }
    },
    scales: {
      x: { ticks: { color: "#64748b", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      y: { ticks: { color: "#64748b", font: { size: 11 }, callback: v => "₹" + Number(v).toLocaleString("en-IN") }, grid: { color: "rgba(255,255,255,0.04)" } }
    }
  };
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

// ══════════════════════════════════════════
//  API STATUS CHECK
// ══════════════════════════════════════════
async function checkAPI() {
  const dot  = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const res = await fetch(BASE_URL + "/", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.classList.add("online");
      text.textContent = "API online";
    } else {
      throw new Error();
    }
  } catch (_) {
    dot.classList.add("offline");
    text.textContent = "API offline";
  }
}

// ══════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast     = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}




