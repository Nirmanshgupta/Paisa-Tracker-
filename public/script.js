/* =========================================================
   Paisa Tracker – frontend (plain JavaScript, no libraries)
   Data is saved in the SQLite database through the backend
   API (see server.js). Only the theme choice stays in the browser.
   ========================================================= */

// ---------- Settings ----------
var CATEGORIES = {
  expense: ["Food", "Transport", "Shopping", "Bills", "Rent", "Health", "Education", "Entertainment", "Other"],
  income:  ["Pocket money", "Salary", "Business", "Gift", "Other"]
};
var COLORS = ["#2B4EFF", "#E8590C", "#0E8A6B", "#C2255C", "#F2A900", "#7048E8", "#0C8599", "#74B816", "#868E96"];

// ---------- Browser storage (only used for the theme choice) ----------
function load(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}

var transactions = [];   // filled from the database by loadData()
var budget = 0;
var editingId = null;
var lastDeleted = null;
var toastTimer = null;

// ---------- Talking to the backend ----------
async function api(method, url, body) {
  var options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  var response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    throw new Error("Cannot reach the server. Is it running? (npm start)");
  }
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// Get everything from the database
async function loadData() {
  transactions = await api("GET", "/api/transactions");
  var b = await api("GET", "/api/budget");
  budget = b.budget;
}

// ---------- Helpers ----------
function $(id) { return document.getElementById(id); }
var money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function rupees(n) { return money.format(n); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function monthLabel(ym) {
  var p = ym.split("-");
  return new Date(+p[0], +p[1] - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}
function shortMonth(ym) {
  var p = ym.split("-");
  return new Date(+p[0], +p[1] - 1, 1).toLocaleString("en-IN", { month: "short" });
}
function sum(list, type) {
  return list.filter(function (t) { return t.type === type; })
             .reduce(function (a, t) { return a + t.amount; }, 0);
}
function allCategories() {
  var all = CATEGORIES.expense.concat(CATEGORIES.income);
  return all.filter(function (c, i) { return all.indexOf(c) === i; });
}
function colorFor(cat) {
  var i = CATEGORIES.expense.indexOf(cat);
  return COLORS[i >= 0 ? i : COLORS.length - 1];
}

// ---------- Form ----------
function currentType() { return document.querySelector('input[name="type"]:checked').value; }

function fillCategorySelect(selected) {
  var list = CATEGORIES[currentType()];
  $("category").innerHTML = list.map(function (c) {
    return '<option value="' + c + '"' + (c === selected ? " selected" : "") + ">" + c + "</option>";
  }).join("");
}

function resetForm() {
  editingId = null;
  $("amount").value = "";
  $("note").value = "";
  $("date").value = todayStr();
  $("tExp").checked = true;
  fillCategorySelect();
  $("formErr").textContent = "";
  $("formTitle").textContent = "Add transaction";
  $("saveBtn").textContent = "Add transaction";
  $("cancelBtn").hidden = true;
}

async function saveTransaction() {
  var amount = parseFloat($("amount").value);
  var date = $("date").value;
  if (!(amount > 0)) { $("formErr").textContent = "Enter an amount greater than 0."; $("amount").focus(); return; }
  if (!date) { $("formErr").textContent = "Pick a date."; $("date").focus(); return; }

  var item = {
    type: currentType(),
    amount: Math.round(amount * 100) / 100,
    category: $("category").value,
    date: date,
    note: $("note").value.trim()
  };

  try {
    if (editingId) {
      await api("PUT", "/api/transactions/" + editingId, item);
      showToast("Changes saved");
    } else {
      await api("POST", "/api/transactions", item);
      showToast("Transaction added");
    }
    await loadData();
  } catch (e) {
    $("formErr").textContent = e.message;
    return;
  }
  resetForm();
  render();
}

function startEdit(id) {
  var t = transactions.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  editingId = id;
  (t.type === "income" ? $("tInc") : $("tExp")).checked = true;
  fillCategorySelect(t.category);
  $("amount").value = t.amount;
  $("date").value = t.date;
  $("note").value = t.note;
  $("formErr").textContent = "";
  $("formTitle").textContent = "Edit transaction";
  $("saveBtn").textContent = "Save changes";
  $("cancelBtn").hidden = false;
  $("amount").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTransaction(id) {
  var t = transactions.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  try {
    await api("DELETE", "/api/transactions/" + id);
    await loadData();
  } catch (e) { showToast(e.message); return; }
  lastDeleted = t;
  if (editingId === id) resetForm();
  render();
  showToast("Transaction deleted", true);
}

async function undoDelete() {
  if (!lastDeleted) return;
  try {
    await api("POST", "/api/transactions", lastDeleted);   // same id, so it is restored
    await loadData();
  } catch (e) { showToast(e.message); return; }
  lastDeleted = null;
  hideToast();
  render();
}

// ---------- Toast ----------
function showToast(msg, withUndo) {
  $("toastMsg").textContent = msg;
  $("toastUndo").hidden = !withUndo;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4500);
}
function hideToast() { $("toast").classList.remove("show"); }

// ---------- Month picker ----------
function buildMonthOptions() {
  var months = {};
  months[todayStr().slice(0, 7)] = true;
  transactions.forEach(function (t) { months[t.date.slice(0, 7)] = true; });
  var keys = Object.keys(months).sort().reverse();
  var sel = $("monthSel");
  var keep = sel.value || todayStr().slice(0, 7);
  sel.innerHTML = '<option value="all">All time</option>' + keys.map(function (k) {
    return '<option value="' + k + '">' + monthLabel(k) + "</option>";
  }).join("");
  sel.value = (keep === "all" || months[keep]) ? keep : todayStr().slice(0, 7);
}

function inPeriod() {
  var m = $("monthSel").value;
  return transactions.filter(function (t) { return m === "all" || t.date.slice(0, 7) === m; });
}

// ---------- Summary ----------
function renderSummary() {
  var list = inPeriod();
  var inc = sum(list, "income"), exp = sum(list, "expense"), bal = inc - exp;
  var m = $("monthSel").value;
  $("balLabel").textContent = "Net balance · " + (m === "all" ? "All time" : monthLabel(m));
  $("balance").textContent = rupees(bal);
  $("balance").className = "big" + (bal < 0 ? " neg" : "");
  $("inc").textContent = rupees(inc);
  $("exp").textContent = rupees(exp);
  $("cnt").textContent = list.length;
}

// ---------- Budget ----------
function renderBudget() {
  var m = $("monthSel").value;
  var ym = m === "all" ? todayStr().slice(0, 7) : m;
  var spent = transactions.filter(function (t) { return t.type === "expense" && t.date.slice(0, 7) === ym; })
                          .reduce(function (a, t) { return a + t.amount; }, 0);
  var bar = $("budgetBar");
  if (!budget) {
    bar.style.width = "0%";
    bar.className = "";
    $("budgetMsg").textContent = "Set a budget to see how much you can still spend in " + monthLabel(ym) + ".";
    return;
  }
  var pct = Math.min(100, Math.round(spent / budget * 100));
  bar.style.width = pct + "%";
  bar.className = spent > budget ? "over" : (pct >= 80 ? "warn" : "");
  var left = budget - spent;
  $("budgetMsg").textContent = monthLabel(ym) + ": spent " + rupees(spent) + " of " + rupees(budget) + ". " +
    (left >= 0 ? rupees(left) + " left." : rupees(-left) + " over budget.");
}

async function saveBudget() {
  var v = parseFloat($("budgetInput").value);
  var value = v > 0 ? v : 0;
  try {
    await api("PUT", "/api/budget", { budget: value });
  } catch (e) { showToast(e.message); return; }
  budget = value;
  showToast(budget ? "Budget saved" : "Budget removed");
  renderBudget();
}

// ---------- Charts ----------
function renderDonut() {
  var list = inPeriod().filter(function (t) { return t.type === "expense"; });
  var total = sum(list, "expense");
  var box = $("donutBox");
  if (!total) { box.innerHTML = '<p class="note">Add an expense to see your spending split.</p>'; return; }

  var byCat = {};
  list.forEach(function (t) { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });

  var offset = 0;
  var circles = cats.map(function (c) {
    var pct = byCat[c] / total * 100;
    var svg = '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + colorFor(c) + '" stroke-width="6" ' +
              'stroke-dasharray="' + pct + " " + (100 - pct) + '" stroke-dashoffset="' + (-offset) + '"></circle>';
    offset += pct;
    return svg;
  }).join("");

  var legend = cats.map(function (c) {
    return '<li><span class="sw" style="background:' + colorFor(c) + '"></span>' + escapeHtml(c) +
           '<span class="v">' + Math.round(byCat[c] / total * 100) + "%</span></li>";
  }).join("");

  box.innerHTML =
    '<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Spending by category">' +
    '<g transform="rotate(-90 21 21)">' + circles + "</g></svg>" +
    '<ul class="legend">' + legend + "</ul>";
}

function renderBars() {
  var now = new Date();
  var months = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  var data = months.map(function (ym) {
    var list = transactions.filter(function (t) { return t.date.slice(0, 7) === ym; });
    return { ym: ym, inc: sum(list, "income"), exp: sum(list, "expense") };
  });
  var max = Math.max.apply(null, data.map(function (d) { return Math.max(d.inc, d.exp); }).concat([1]));
  $("bars").innerHTML = data.map(function (d) {
    return '<div class="col" title="' + monthLabel(d.ym) + ": income " + rupees(d.inc) + ", expenses " + rupees(d.exp) + '">' +
      '<div class="pairbars"><i class="i" style="height:' + (d.inc / max * 100) + '%"></i>' +
      '<i class="e" style="height:' + (d.exp / max * 100) + '%"></i></div>' +
      "<small>" + shortMonth(d.ym) + "</small></div>";
  }).join("");
}

// ---------- Transaction list ----------
function renderList() {
  var q = $("search").value.trim().toLowerCase();
  var type = $("fType").value, cat = $("fCat").value, sort = $("fSort").value;

  var list = inPeriod().filter(function (t) {
    if (type !== "all" && t.type !== type) return false;
    if (cat !== "all" && t.category !== cat) return false;
    if (q && (t.note + " " + t.category).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });

  list.sort(function (a, b) {
    if (sort === "old")  return a.date.localeCompare(b.date);
    if (sort === "high") return b.amount - a.amount;
    if (sort === "low")  return a.amount - b.amount;
    return b.date.localeCompare(a.date);
  });

  $("listCount").textContent = list.length + (list.length === 1 ? " transaction" : " transactions");

  if (!list.length) {
    var hasAny = transactions.length > 0;
    $("list").innerHTML = '<li class="empty"><p>' +
      (hasAny ? "Nothing matches these filters. Try a different period or clear the search." :
                "No transactions yet. Add your first one using the form.") + "</p>" +
      (hasAny ? "" : '<button class="btn" id="sampleBtn" type="button">Add sample data</button>') + "</li>";
    return;
  }

  $("list").innerHTML = list.map(function (t) {
    var sign = t.type === "income" ? "+" : "−";
    var dateText = new Date(t.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return '<li class="item">' +
      '<span class="dot" style="background:' + (t.type === "income" ? "var(--income)" : colorFor(t.category)) + '"></span>' +
      "<div><strong>" + escapeHtml(t.category) + "</strong><small>" +
        (t.note ? escapeHtml(t.note) + " · " : "") + dateText + "</small></div>" +
      '<span class="amt ' + t.type + '">' + sign + rupees(t.amount) + "</span>" +
      '<div class="acts">' +
        '<button class="btn small" data-edit="' + t.id + '" type="button">Edit</button>' +
        '<button class="btn small danger" data-del="' + t.id + '" type="button">Delete</button>' +
      "</div></li>";
  }).join("");
}

// ---------- Main render ----------
function render() {
  buildMonthOptions();
  renderSummary();
  renderBudget();
  renderDonut();
  renderBars();
  renderList();
}

// ---------- Extras ----------
async function addSampleData() {
  var d = new Date();
  function ago(days) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  var s = [
    ["income", 15000, "Pocket money", 1, "Monthly allowance"],
    ["expense", 250, "Food", 0, "Lunch with friends"],
    ["expense", 80, "Transport", 1, "Auto fare"],
    ["expense", 1200, "Shopping", 3, "New shoes"],
    ["expense", 499, "Bills", 4, "Mobile recharge"],
    ["expense", 350, "Entertainment", 6, "Movie tickets"],
    ["expense", 900, "Education", 9, "Books"],
    ["income", 2000, "Gift", 12, "Birthday gift"],
    ["expense", 600, "Food", 20, "Groceries"],
    ["income", 14000, "Pocket money", 33, "Monthly allowance"],
    ["expense", 3200, "Rent", 36, "Room share"],
    ["expense", 1500, "Shopping", 40, "Clothes"]
  ];
  var items = s.map(function (r) {
    return { type: r[0], amount: r[1], category: r[2], date: ago(r[3]), note: r[4] };
  });
  try {
    await api("POST", "/api/transactions", items);   // saves all rows in one go
    await loadData();
  } catch (e) { showToast(e.message); return; }
  render();
}

function openExport() {
  var rows = [["Date", "Type", "Category", "Amount", "Note"]];
  transactions.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
    rows.push([t.date, t.type, t.category, t.amount, '"' + t.note.replace(/"/g, '""') + '"']);
  });
  $("csvText").value = rows.map(function (r) { return r.join(","); }).join("\n");
  $("csvDlg").showModal();
}

function copyCsv() {
  var box = $("csvText");
  box.focus();
  box.select();
  var ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  $("csvCopy").textContent = ok ? "Copied" : "Press Ctrl+C to copy";
  setTimeout(function () { $("csvCopy").textContent = "Copy"; }, 2000);
}

var clearArmed = false;
async function clearAll() {
  var btn = $("clearBtn");
  if (!clearArmed) {
    clearArmed = true;
    btn.textContent = "Click again to confirm";
    btn.classList.add("armed");
    setTimeout(function () { clearArmed = false; btn.textContent = "Clear all"; btn.classList.remove("armed"); }, 3000);
    return;
  }
  clearArmed = false;
  btn.textContent = "Clear all";
  btn.classList.remove("armed");
  try {
    await api("DELETE", "/api/transactions");
    await loadData();
  } catch (e) { showToast(e.message); return; }
  resetForm();
  render();
  showToast("All transactions cleared");
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  save("paisa_theme", theme);
}

// ---------- Events ----------
$("saveBtn").addEventListener("click", saveTransaction);
$("cancelBtn").addEventListener("click", resetForm);
$("budgetBtn").addEventListener("click", saveBudget);
$("exportBtn").addEventListener("click", openExport);
$("csvCopy").addEventListener("click", copyCsv);
$("csvClose").addEventListener("click", function () { $("csvDlg").close(); });
$("clearBtn").addEventListener("click", clearAll);
$("toastUndo").addEventListener("click", undoDelete);
$("themeBtn").addEventListener("click", function () {
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  setTheme(isDark ? "light" : "dark");
});
document.querySelectorAll('input[name="type"]').forEach(function (r) {
  r.addEventListener("change", function () { fillCategorySelect(); });
});
["monthSel", "search", "fType", "fCat", "fSort"].forEach(function (id) {
  $(id).addEventListener("input", function () { renderSummary(); renderBudget(); renderDonut(); renderList(); });
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && ["amount", "note", "date"].indexOf(document.activeElement.id) !== -1) saveTransaction();
});
$("list").addEventListener("click", function (e) {
  var el = e.target.closest("button");
  if (!el) return;
  if (el.dataset.edit) startEdit(el.dataset.edit);
  else if (el.dataset.del) deleteTransaction(el.dataset.del);
  else if (el.id === "sampleBtn") addSampleData();
});

// ---------- Start ----------
(async function init() {
  var savedTheme = load("paisa_theme", null);
  if (savedTheme) setTheme(savedTheme);
  else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) $("themeBtn").textContent = "Light mode";

  $("fCat").innerHTML = '<option value="all">All categories</option>' +
    allCategories().map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
  resetForm();
  try {
    await loadData();
  } catch (e) {
    $("list").innerHTML = '<li class="empty"><p>' + escapeHtml(e.message) + "</p></li>";
    return;
  }
  $("budgetInput").value = budget || "";
  $("monthSel").value = todayStr().slice(0, 7);
  render();
})();
