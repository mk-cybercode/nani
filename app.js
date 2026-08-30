/* ============================================================
   CONFIG — PASTE YOUR OWN VALUES HERE
   ------------------------------------------------------------
   1. SUPABASE_URL   Supabase → Project Settings → API → Project URL
   2. SUPABASE_ANON_KEY   the "anon public" key on the same page
      (never the service_role key)
   3. PASSCODE       whatever you and your partner will type in
   ============================================================ */
const CONFIG = {
  SUPABASE_URL:      "https://ufiplsfnmabxyxsabqti.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmaXBsc2ZubWFieHl4c2FicXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMTAxNjcsImV4cCI6MjEwMzY4NjE2N30.yB_hYbyslU_HcEsXdSZWxVtqpMuubLN4VGSK01uoup0",
  PASSCODE:          "9095",
  BUSINESS_NAME:     "Nanie's Delicacies"
};
/* ====================== end of config ====================== */


/* ---------- small helpers ---------- */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const NBSP = " ";

/** 1250.5  ->  "R 1 250.50" */
function money(value) {
  const n = Number(value) || 0;
  const neg = n < 0;
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? "-R" : "R") + NBSP + grouped + "." + cents;
}

/** "12,50" or "12.50" or "" -> number */
function toNum(text) {
  const n = parseFloat(String(text == null ? "" : text).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "2026-08-30" -> "30 Aug 2026" */
function niceDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return d + " " + MONTHS[m - 1] + " " + y;
}

/** Same, but the year is left off when it is this year — list rows are tight. */
function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  if (y === new Date().getFullYear()) return d + " " + MONTHS[m - 1];
  return d + " " + MONTHS[m - 1] + " " + y;
}

function escapeHTML(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Start/end (inclusive) for the date filter. */
function filterRange(which) {
  const now = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  const iso = (dt) => dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
  if (which === "this") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
             to:   iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (which === "last") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
             to:   iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  return null; // "all"
}

function inRange(iso, range) {
  if (!range) return true;
  return iso >= range.from && iso <= range.to;
}


/* ---------- products ---------- */

function findProduct(name) {
  return db.products.find((p) => p.name === name) || null;
}

function costOf(name) {
  const product = findProduct(name);
  return product ? Number(product.cost_price || 0) : 0;
}

/** What one sale made: (price each - cost each) x units. */
function saleProfit(sale) {
  const units = Number(sale.units || 0);
  return (Number(sale.unit_price || 0) - Number(sale.unit_cost || 0)) * units;
}


/* ---------- app state ---------- */

let sb = null;

const db = {
  customers: [],
  products: [],
  sales: [],
  purchases: [],
  stock: [],
  adjustments: []
};

const state = {
  screen: "home",
  filter: { sales: "this", purchases: "this", stock: "this" },
  loaded: false
};


/* ---------- passcode gate ---------- */

const GATE_KEY = "nanies.unlocked.v1";

function startGate() {
  const gate = $("#gate");
  if (localStorage.getItem(GATE_KEY) === CONFIG.PASSCODE) { openApp(); return; }

  gate.hidden = false;
  const input = $("#gate-input");
  const error = $("#gate-error");
  setTimeout(() => input.focus(), 250);

  const tryOpen = () => {
    if (input.value === CONFIG.PASSCODE) {
      try { localStorage.setItem(GATE_KEY, input.value); } catch (e) { /* private mode */ }
      gate.hidden = true;
      openApp();
    } else {
      error.hidden = false;
      input.value = "";
      input.focus();
    }
  };

  $("#gate-btn").addEventListener("click", tryOpen);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryOpen(); });
  input.addEventListener("input", () => { error.hidden = true; });
}

function lock() {
  try { localStorage.removeItem(GATE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}


/* ---------- start up ---------- */

function openApp() {
  $("#app").hidden = false;

  // the Supabase library comes from a CDN — on a phone with no signal it never arrives
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    $("#screen").innerHTML =
      '<div class="card"><div class="empty">' +
      '<span class="empty-big">\ud83d\udcf6</span>' +
      "<strong>Could not start up</strong><br>" +
      "This needs internet the first time it opens. Get onto data or wifi, " +
      "then close and open it again." +
      "</div></div>" +
      '<button class="btn btn-block" style="margin-top:16px" onclick="location.reload()">Try again</button>';
    return;
  }

  if (!CONFIG.SUPABASE_URL.startsWith("https://") || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT")) {
    $("#screen").innerHTML =
      '<div class="card"><div class="empty">' +
      '<span class="empty-big">⚙︎</span>' +
      "<strong>Not connected yet</strong><br>" +
      "Open <code>app.js</code> and paste your Supabase URL and anon key into the " +
      "config block at the top. The steps are in SETUP.md." +
      "</div></div>";
    return;
  }

  sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  wireChrome();
  watchConnection();
  go("home");
  loadAll().then(listenForChanges);
}

function wireChrome() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => go(tab.dataset.nav));
  });
  $("#fab").addEventListener("click", () => {
    if (state.screen === "sales") editSale(null);
    if (state.screen === "purchases") editPurchase(null);
    if (state.screen === "stock") editStock(null);
    if (state.screen === "products") editProduct(null);
  });
  $("#back-btn").addEventListener("click", () => go("home"));
  $("#menu-btn").addEventListener("click", openMenu);

  $$("[data-close]").forEach((el) => el.addEventListener("click", closeSheet));
  $("#ask").addEventListener("click", (e) => {
    if (e.target.dataset.askClose) closeAsk(false);
  });
  $("#ask-no").addEventListener("click", () => closeAsk(false));
}

function watchConnection() {
  const banner = $("#offline");
  const paint = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", () => { paint(); loadAll(); });
  window.addEventListener("offline", paint);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && navigator.onLine) loadAll();
  });
  paint();
}


/* ---------- data ---------- */

async function loadAll() {
  if (!navigator.onLine) return;
  try {
    const [customers, products, sales, purchases, stock, adjustments] = await Promise.all([
      sb.from("customers").select("*").order("name"),
      sb.from("products").select("*").order("name"),
      sb.from("sales").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("purchases").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("stock_orders").select("*").order("date_ordered", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("adjustments").select("*").order("date", { ascending: false }).order("created_at", { ascending: false })
    ]);

    const failed = [customers, products, sales, purchases, stock, adjustments].find((r) => r.error);
    if (failed) throw failed.error;

    db.customers   = customers.data   || [];
    db.products    = products.data    || [];
    db.sales       = sales.data       || [];
    db.purchases   = purchases.data   || [];
    db.stock       = stock.data       || [];
    db.adjustments = adjustments.data || [];
    state.loaded = true;
    render();
  } catch (err) {
    console.error(err);
    toast("Could not load the data. " + friendlyError(err));
  }
}

let reloadTimer = null;
function listenForChanges() {
  sb.channel("nanies-all")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(loadAll, 400);
    })
    .subscribe();
}

function friendlyError(err) {
  const msg = (err && (err.message || err.hint)) || "";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No internet.";
  if (/row-level security/i.test(msg)) return "The database is blocking access — run schema.sql again.";
  return msg;
}

/** insert / update / delete, with a plain message if it fails. */
async function save(table, row, id) {
  if (!navigator.onLine) { toast("No internet — not saved."); return false; }
  try {
    const q = id ? sb.from(table).update(row).eq("id", id) : sb.from(table).insert(row);
    const { error } = await q;
    if (error) throw error;
    await loadAll();
    return true;
  } catch (err) {
    console.error(err);
    toast("Not saved. " + friendlyError(err));
    return false;
  }
}

async function remove(table, id) {
  if (!navigator.onLine) { toast("No internet — not deleted."); return false; }
  try {
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw error;
    await loadAll();
    return true;
  } catch (err) {
    console.error(err);
    toast("Not deleted. " + friendlyError(err));
    return false;
  }
}


/* ---------- navigation ---------- */

const TITLES = { home: "Home", sales: "Sales", purchases: "Purchases",
                 stock: "Stock orders", products: "Products & prices" };

function go(screen) {
  state.screen = screen;
  $("#title").textContent = TITLES[screen];
  $$(".tab").forEach((t) => {
    if (t.dataset.nav === screen) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  $("#back-btn").hidden = (screen !== "products");
  $("#fab").hidden = (screen === "home");
  window.scrollTo(0, 0);
  render();
}

function render() {
  const screen = $("#screen");
  if (state.screen === "sales")     { screen.innerHTML = salesScreen();     wireList("sales");     return; }
  if (state.screen === "purchases") { screen.innerHTML = purchasesScreen(); wireList("purchases"); return; }
  if (state.screen === "stock")     { screen.innerHTML = stockScreen();     wireList("stock");     return; }
  if (state.screen === "products")  { screen.innerHTML = productsScreen();  wireProducts();        return; }
  screen.innerHTML = homeScreen();
  wireHome();
}

function emptyBox(message) {
  return '<div class="card"><div class="empty"><span class="empty-big">✎</span>' +
         escapeHTML(message) + "</div></div>";
}

function filterBar(kind) {
  const now = state.filter[kind];
  const opt = (key, label) =>
    '<button data-filter="' + key + '" aria-pressed="' + (now === key) + '">' + label + "</button>";
  return '<div class="segment" data-filter-for="' + kind + '">' +
         opt("this", "This month") + opt("last", "Last month") + opt("all", "All") +
         "</div>";
}

function wireList(kind) {
  $$('[data-filter-for="' + kind + '"] button').forEach((b) => {
    b.addEventListener("click", () => { state.filter[kind] = b.dataset.filter; render(); });
  });
  $$("[data-open]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.open;
      if (kind === "sales")     editSale(db.sales.find((s) => s.id === id));
      if (kind === "purchases") editPurchase(db.purchases.find((p) => p.id === id));
      if (kind === "stock")     editStock(db.stock.find((s) => s.id === id));
    });
  });
}


/* ---------- sales ---------- */

const SALE_STATUS = {
  paid:   { label: "Paid",     pill: "pill-good" },
  part:   { label: "Part paid", pill: "pill-warn" },
  unpaid: { label: "Not paid", pill: "pill-bad" }
};

function salesScreen() {
  if (!state.loaded) return '<div class="card"><div class="empty">Loading…</div></div>';

  const range = filterRange(state.filter.sales);
  const rows = db.sales.filter((s) => inRange(s.date, range));

  const total  = rows.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const profit = rows.reduce((sum, s) => sum + saleProfit(s), 0);
  const owed   = rows.reduce((sum, s) =>
    sum + Math.max(0, Number(s.amount || 0) - Number(s.amount_received || 0)), 0);

  let html = filterBar("sales");

  html += '<div class="section-head"><span>' + rows.length + " sale" + (rows.length === 1 ? "" : "s") +
          "</span><span>" + money(total) + "</span></div>";

  if (!rows.length) {
    html += emptyBox("No sales yet. Tap + to add the first one.");
    return html;
  }

  html += '<div class="card">';
  rows.forEach((s) => {
    const meta = SALE_STATUS[s.status] || SALE_STATUS.unpaid;
    const outstanding = Math.max(0, Number(s.amount || 0) - Number(s.amount_received || 0));
    html +=
      '<button class="row" data-open="' + s.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(s.customer) + "</div>" +
          '<div class="row-sub">' +
            tidyUnits(s.units) + " × " + escapeHTML(s.product) + " · " + shortDate(s.date) +
            " · " + (s.method === "eft" ? "EFT" : "Cash") +
            (s.status === "part" ? " · " + money(outstanding) + " still due" : "") + "</div>" +
        "</div>" +
        '<div class="row-side">' +
          '<div class="row-amt">' + money(s.amount) + "</div>" +
          '<span class="pill ' + meta.pill + '">' + meta.label + "</span>" +
        "</div>" +
      "</button>";
  });
  html += "</div>";

  html += '<p class="field-hint" style="text-align:center">Profit on these sales: <strong>' +
          money(profit) + "</strong>" +
          (owed > 0 ? " · still owed to us: <strong>" + money(owed) + "</strong>" : "") + "</p>";
  return html;
}

function editSale(sale) {
  const isNew = !sale;
  const s = sale || {
    date: todayISO(), customer: "", product: "", units: "", unit_price: "", unit_cost: 0,
    status: "unpaid", amount_received: "", method: "cash", note: ""
  };

  const body =
    field("Date", '<input id="f-date" type="date" value="' + escapeHTML(s.date) + '">') +
    pickerField("Sold to", "f-customer", db.customers.map((c) => c.name), s.customer, "customer") +
    pickerField("Product", "f-product", db.products.map((p) => p.name), s.product, "product") +
    '<div class="two">' +
      field("How many units", numberInput("f-units", s.units, "0")) +
      field("Price for one", amountInput("f-price", s.unit_price)) +
    "</div>" +
    '<div class="totals-box" id="f-totals"></div>' +
    field("Have they paid?", choice("f-status", [
      ["paid", "Paid"], ["part", "Part paid"], ["unpaid", "Not paid"]
    ], s.status)) +
    '<div id="wrap-received">' +
      field("How much have they paid so far", amountInput("f-received", s.amount_received)) +
    "</div>" +
    field("Paid by", choice("f-method", [["cash", "Cash"], ["eft", "EFT"]], s.method)) +
    field("Note (optional)", '<textarea id="f-note">' + escapeHTML(s.note || "") + "</textarea>") +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "New sale" : "Edit sale", body, async () => {
    const customer = $("#f-customer").value;
    const product  = $("#f-product").value;
    const units    = toNum($("#f-units").value);
    const price    = toNum($("#f-price").value);
    const amount   = units * price;
    const status   = choiceValue("f-status");

    if (!customer) { toast("Choose who you sold to."); return false; }
    if (!product)  { toast("Choose a product."); return false; }
    if (units <= 0) { toast("Enter how many units you sold."); return false; }
    if (price <= 0) { toast("Enter the price for one unit."); return false; }

    let received = toNum($("#f-received").value);
    if (status === "paid") received = amount;
    if (status === "unpaid") received = 0;
    if (received > amount) received = amount;

    // the cost is copied in when the sale is captured, so changing a
    // product's cost price later does not rewrite old sales
    const keepCost = !isNew && product === s.product;
    const row = {
      date: $("#f-date").value || todayISO(),
      customer: customer,
      product: product,
      units: units,
      unit_price: price,
      unit_cost: keepCost ? Number(s.unit_cost || 0) : costOf(product),
      amount: amount,
      status: status,
      amount_received: received,
      method: choiceValue("f-method"),
      note: $("#f-note").value.trim() || null
    };
    const ok = await save("sales", row, isNew ? null : s.id);
    if (ok) toast(isNew ? "Sale saved." : "Sale updated.");
    return ok;
  });

  // running total and profit, updated as they type
  const showTotals = () => {
    const units = toNum($("#f-units").value);
    const price = toNum($("#f-price").value);
    const name  = $("#f-product").value;
    const keepCost = !isNew && name === s.product;
    const cost  = keepCost ? Number(s.unit_cost || 0) : costOf(name);
    const total = units * price;
    const profit = (price - cost) * units;

    let note = "";
    if (name && !cost) {
      note = '<div class="totals-note">No cost price set for ' + escapeHTML(name) +
             " — profit cannot be worked out. Set it under Products &amp; prices on Home.</div>";
    }
    $("#f-totals").innerHTML =
      '<div class="totals-row"><span>Total</span><strong>' + money(total) + "</strong></div>" +
      '<div class="totals-row"><span>Cost (' + tidyUnits(units) + " × " + money(cost) +
        ")</span><span>" + money(cost * units) + "</span></div>" +
      '<div class="totals-row totals-profit"><span>Profit</span><strong class="' +
        (profit < 0 ? "amt-bad" : "amt-good") + '">' + money(profit) + "</strong></div>" + note;
  };

  const syncReceived = () => {
    const status = choiceValue("f-status");
    const total = toNum($("#f-units").value) * toNum($("#f-price").value);
    $("#wrap-received").hidden = (status !== "part");
    if (status === "paid") $("#f-received").value = total ? total.toFixed(2) : "";
    if (status === "unpaid") $("#f-received").value = "";
  };

  const refresh = () => { showTotals(); syncReceived(); };

  // picking a product fills in its usual selling price
  $("#f-product").addEventListener("change", () => {
    const product = findProduct($("#f-product").value);
    if (product && Number(product.sell_price || 0) > 0) {
      $("#f-price").value = Number(product.sell_price).toFixed(2);
    }
    refresh();
  });
  $("#f-units").addEventListener("input", refresh);
  $("#f-price").addEventListener("input", refresh);
  onChoice("f-status", syncReceived);
  refresh();

  wirePickers();
  if (!isNew) wireDelete("this sale", () => remove("sales", s.id));
}


/* ---------- what the money adds up to ---------- */

/* Every adjustment kind, and what it does to each balance. */
const ADJUST_KINDS = {
  banked:   { label: "Cash banked",        long: "Cash banked (cash → bank)",        cash: -1, bank: +1 },
  drawn:    { label: "Money drawn",        long: "Money drawn (bank → cash)",        cash: +1, bank: -1 },
  cash_in:  { label: "Cash in",            long: "Cash in (opening float, correction)", cash: +1, bank: 0 },
  cash_out: { label: "Cash out",           long: "Cash out (money taken, correction)",  cash: -1, bank: 0 },
  bank_in:  { label: "Into the bank",      long: "Into the bank (correction)",       cash: 0,  bank: +1 },
  bank_out: { label: "Out of the bank",    long: "Out of the bank (correction)",     cash: 0,  bank: -1 }
};

function totals() {
  let cash = 0, bank = 0;

  // money actually received on sales
  db.sales.forEach((s) => {
    const received = Number(s.amount_received || 0);
    if (s.method === "eft") bank += received; else cash += received;
  });

  // money actually paid out on purchases
  db.purchases.forEach((p) => {
    if (p.status !== "paid") return;
    const amount = Number(p.amount || 0);
    if (p.method === "eft") bank -= amount; else cash -= amount;
  });

  // manual corrections and movements
  db.adjustments.forEach((a) => {
    const rule = ADJUST_KINDS[a.kind];
    if (!rule) return;
    const amount = Number(a.amount || 0);
    cash += rule.cash * amount;
    bank += rule.bank * amount;
  });

  const owedToUs = db.sales.reduce((sum, s) =>
    sum + Math.max(0, Number(s.amount || 0) - Number(s.amount_received || 0)), 0);

  const weOwe = db.purchases.reduce((sum, p) =>
    sum + (p.status === "unpaid" ? Number(p.amount || 0) : 0), 0);

  const month = filterRange("this");
  const monthSales = db.sales.filter((s) => inRange(s.date, month));
  const salesMonth  = monthSales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const costMonth   = monthSales.reduce((sum, s) =>
    sum + Number(s.unit_cost || 0) * Number(s.units || 0), 0);
  const unitsMonth  = monthSales.reduce((sum, s) => sum + Number(s.units || 0), 0);
  const purchasesMonth = db.purchases.filter((p) => inRange(p.date, month))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    cash: cash, bank: bank, owedToUs: owedToUs, weOwe: weOwe,
    salesMonth: salesMonth, costMonth: costMonth, unitsMonth: unitsMonth,
    profitMonth: salesMonth - costMonth,
    purchasesMonth: purchasesMonth,
    netMonth: salesMonth - purchasesMonth
  };
}

function thisMonthName() {
  const now = new Date();
  return MONTHS[now.getMonth()] + " " + now.getFullYear();
}


/* ---------- home ---------- */

function homeScreen() {
  if (!state.loaded) return '<div class="card"><div class="empty">Loading…</div></div>';
  const t = totals();

  const tile = (label, value, tone) =>
    '<div class="tile' + (tone ? " tile-" + tone : "") + '">' +
      '<div class="tile-label">' + escapeHTML(label) + "</div>" +
      '<div class="tile-value">' + money(value) + "</div>" +
    "</div>";

  let html =
    '<div class="tiles">' +
      tile("Cash on hand", t.cash) +
      tile("In the bank", t.bank) +
    "</div>" +
    '<div class="tiles">' +
      tile("Owed to us", t.owedToUs, t.owedToUs > 0 ? "warn" : null) +
      tile("We still owe", t.weOwe, t.weOwe > 0 ? "bad" : null) +
    "</div>" +
    '<div class="tile tile-wide' + (t.profitMonth < 0 ? " tile-bad" : " tile-good") + '">' +
      '<div class="tile-label">Profit · ' + thisMonthName() + "</div>" +
      '<div class="tile-value">' + money(t.profitMonth) + "</div>" +
      '<div class="tile-foot">' + tidyUnits(t.unitsMonth) + " units sold · " +
        money(t.salesMonth) + " taken in · " + money(t.costMonth) + " they cost you</div>" +
    "</div>" +
    '<button class="btn btn-block btn-primary" id="h-products" style="margin-top:16px">Products &amp; prices</button>' +
    '<button class="btn btn-block" id="h-adjust" style="margin-top:10px">Adjust cash or bank</button>' +
    '<button class="btn btn-block" id="h-export" style="margin-top:10px">Export for the bookkeeper</button>';

  const recent = recentEntries(6);
  html += '<div class="section-head"><span>Latest entries</span></div>';
  if (!recent.length) {
    html += emptyBox("Nothing captured yet. Use the + button on Sales, Purchases or Stock.");
    return html;
  }

  html += '<div class="card">';
  recent.forEach((e) => {
    html +=
      '<button class="row" data-entry="' + e.kind + ":" + e.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(e.title) + "</div>" +
          '<div class="row-sub">' + escapeHTML(e.sub) + "</div>" +
        "</div>" +
        '<div class="row-side"><div class="row-amt ' + (e.tone || "") + '">' + e.amountText + "</div></div>" +
      "</button>";
  });
  html += "</div>";
  return html;
}

/** The newest few entries across sales, purchases, stock and adjustments. */
function recentEntries(limit) {
  const list = [];

  db.sales.forEach((s) => list.push({
    kind: "sale", id: s.id, when: s.created_at || s.date,
    title: s.customer + " · " + tidyUnits(s.units) + " × " + s.product,
    sub: "Sale · " + shortDate(s.date) + " · " + (s.method === "eft" ? "EFT" : "Cash") +
         " · " + money(saleProfit(s)) + " profit",
    amountText: "+" + money(s.amount), tone: "amt-good"
  }));

  db.purchases.forEach((p) => list.push({
    kind: "purchase", id: p.id, when: p.created_at || p.date,
    title: p.item + (p.supplier ? " · " + p.supplier : ""),
    sub: "Purchase · " + shortDate(p.date) + " · " + (p.method === "eft" ? "EFT" : "Cash"),
    amountText: "-" + money(p.amount), tone: "amt-bad"
  }));

  db.stock.forEach((o) => list.push({
    kind: "stock", id: o.id, when: o.created_at || o.date_ordered,
    title: o.product + " · " + o.customer,
    sub: "Stock order · " + shortDate(o.date_ordered),
    amountText: tidyUnits(o.qty_delivered) + " / " + tidyUnits(o.qty_ordered)
  }));

  db.adjustments.forEach((a) => {
    const rule = ADJUST_KINDS[a.kind] || { label: a.kind };
    list.push({
      kind: "adjustment", id: a.id, when: a.created_at || a.date,
      title: rule.label,
      sub: "Adjustment · " + shortDate(a.date) + (a.note ? " · " + a.note : ""),
      amountText: money(a.amount)
    });
  });

  list.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  return list.slice(0, limit);
}

function wireHome() {
  const products = $("#h-products");
  if (products) products.addEventListener("click", () => go("products"));
  const adjust = $("#h-adjust");
  if (adjust) adjust.addEventListener("click", () => editAdjustment(null));
  const exportBtn = $("#h-export");
  if (exportBtn) exportBtn.addEventListener("click", openExport);

  $$("[data-entry]").forEach((row) => {
    row.addEventListener("click", () => {
      const [kind, id] = row.dataset.entry.split(":");
      if (kind === "sale")       editSale(db.sales.find((r) => r.id === id));
      if (kind === "purchase")   editPurchase(db.purchases.find((r) => r.id === id));
      if (kind === "stock")      editStock(db.stock.find((r) => r.id === id));
      if (kind === "adjustment") editAdjustment(db.adjustments.find((r) => r.id === id));
    });
  });
}


/* ---------- products and their prices ---------- */

function productsScreen() {
  if (!state.loaded) return '<div class="card"><div class="empty">Loading…</div></div>';

  let html = '<p class="field-hint" style="margin:0 2px 14px">What one unit costs you to make, ' +
             "and what you normally sell it for. The profit on every sale comes from these.</p>";

  if (!db.products.length) {
    html += emptyBox("No products yet. Tap + to add one.");
    return html;
  }

  html += '<div class="card">';
  db.products.forEach((p) => {
    const cost = Number(p.cost_price || 0);
    const sell = Number(p.sell_price || 0);
    const margin = sell - cost;
    const priced = cost > 0 || sell > 0;
    html +=
      '<button class="row" data-product="' + p.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(p.name) + "</div>" +
          '<div class="row-sub">' +
            (priced ? "Costs " + money(cost) + " · sells for " + money(sell)
                    : "No prices yet — tap to add them") + "</div>" +
        "</div>" +
        '<div class="row-side">' +
          (priced
            ? '<div class="row-amt ' + (margin > 0 ? "amt-good" : "amt-bad") + '">' + money(margin) +
              '</div><div class="row-sub">profit each</div>'
            : '<span class="pill pill-warn">Set prices</span>') +
        "</div>" +
      "</button>";
  });
  html += "</div>";
  return html;
}

function wireProducts() {
  $$("[data-product]").forEach((row) => {
    row.addEventListener("click", () =>
      editProduct(db.products.find((p) => p.id === row.dataset.product)));
  });
}

function editProduct(product) {
  const isNew = !product;
  const p = product || { name: "", cost_price: "", sell_price: "" };

  const body =
    field("Product name", textInput("f-name", p.name, "e.g. Green Chutney")) +
    field("What one unit costs you", amountInput("f-cost", p.cost_price)) +
    field("What you sell one for", amountInput("f-sell", p.sell_price)) +
    '<p id="f-margin" class="field-hint" style="text-align:center;font-size:15px"></p>' +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "New product" : "Edit product", body, async () => {
    const name = $("#f-name").value.trim();
    if (!name) { toast("Give the product a name."); return false; }
    const row = {
      name: name,
      cost_price: toNum($("#f-cost").value),
      sell_price: toNum($("#f-sell").value)
    };
    const ok = await save("products", row, isNew ? null : p.id);
    if (ok) toast(isNew ? "Product added." : "Prices updated.");
    return ok;
  });

  const showMargin = () => {
    const cost = toNum($("#f-cost").value);
    const sell = toNum($("#f-sell").value);
    $("#f-margin").innerHTML = (sell || cost)
      ? "You make <strong>" + money(sell - cost) + "</strong> on every unit sold"
      : "";
  };
  $("#f-cost").addEventListener("input", showMargin);
  $("#f-sell").addEventListener("input", showMargin);
  showMargin();

  if (!isNew) wireDelete("this product", () => remove("products", p.id));
}


/* ---------- cash and bank adjustments ---------- */

function editAdjustment(adjustment) {
  const isNew = !adjustment;
  const a = adjustment || { date: todayISO(), kind: "banked", amount: "", note: "" };
  const t = totals();

  const options = Object.keys(ADJUST_KINDS).map((key) =>
    '<option value="' + key + '"' + (key === a.kind ? " selected" : "") + ">" +
    escapeHTML(ADJUST_KINDS[key].long) + "</option>").join("");

  const body =
    '<p class="field-hint" style="text-align:center;margin-bottom:16px">Right now: cash <strong>' +
      money(t.cash) + "</strong> · bank <strong>" + money(t.bank) + "</strong></p>" +
    field("Date", '<input id="f-date" type="date" value="' + escapeHTML(a.date) + '">') +
    field("What happened", '<select id="f-kind">' + options + "</select>") +
    field("Amount", amountInput("f-amount", a.amount)) +
    field("Note", '<textarea id="f-note" placeholder="Why the figure is being changed">' +
                  escapeHTML(a.note || "") + "</textarea>") +
    '<p id="f-effect" class="field-hint" style="text-align:center;font-size:15px"></p>' +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "Adjust cash or bank" : "Edit adjustment", body, async () => {
    const amount = toNum($("#f-amount").value);
    if (amount <= 0) { toast("Enter an amount."); return false; }
    const row = {
      date: $("#f-date").value || todayISO(),
      kind: $("#f-kind").value,
      amount: amount,
      note: $("#f-note").value.trim() || null
    };
    const ok = await save("adjustments", row, isNew ? null : a.id);
    if (ok) toast(isNew ? "Adjustment saved." : "Adjustment updated.");
    return ok;
  });

  const showEffect = () => {
    const rule = ADJUST_KINDS[$("#f-kind").value];
    const amount = toNum($("#f-amount").value);
    const parts = [];
    if (rule.cash) parts.push("cash " + money(t.cash + rule.cash * amount));
    if (rule.bank) parts.push("bank " + money(t.bank + rule.bank * amount));
    $("#f-effect").innerHTML = "After saving: <strong>" + parts.join(" · ") + "</strong>";
  };
  $("#f-kind").addEventListener("change", showEffect);
  $("#f-amount").addEventListener("input", showEffect);
  showEffect();

  if (!isNew) wireDelete("this adjustment", () => remove("adjustments", a.id));
}


/* ---------- purchases ---------- */

function purchasesScreen() {
  if (!state.loaded) return '<div class="card"><div class="empty">Loading…</div></div>';

  const range = filterRange(state.filter.purchases);
  const rows = db.purchases.filter((p) => inRange(p.date, range));
  const total = rows.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const owing = rows.filter((p) => p.status === "unpaid")
                    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  let html = filterBar("purchases");
  html += '<div class="section-head"><span>' + rows.length + " purchase" + (rows.length === 1 ? "" : "s") +
          "</span><span>" + money(total) + "</span></div>";

  if (!rows.length) {
    html += emptyBox("No purchases yet. Tap + to add the first one.");
    return html;
  }

  html += '<div class="card">';
  rows.forEach((p) => {
    const paid = p.status === "paid";
    html +=
      '<button class="row" data-open="' + p.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(p.item) + "</div>" +
          '<div class="row-sub">' +
            (p.supplier ? escapeHTML(p.supplier) + " · " : "") + shortDate(p.date) +
            " · " + (p.method === "eft" ? "EFT" : "Cash") + "</div>" +
        "</div>" +
        '<div class="row-side">' +
          '<div class="row-amt">' + money(p.amount) + "</div>" +
          '<span class="pill ' + (paid ? "pill-good" : "pill-bad") + '">' +
            (paid ? "Paid" : "Not paid") + "</span>" +
        "</div>" +
      "</button>";
  });
  html += "</div>";

  if (owing > 0) {
    html += '<p class="field-hint" style="text-align:center">Still to pay in this period: <strong>' +
            money(owing) + "</strong></p>";
  }
  return html;
}

function editPurchase(purchase) {
  const isNew = !purchase;
  const p = purchase || {
    date: todayISO(), item: "", supplier: "", amount: "",
    status: "paid", method: "cash", note: ""
  };

  const suppliers = uniqueValues(db.purchases, "supplier");
  const items     = uniqueValues(db.purchases, "item");

  const body =
    field("Date", '<input id="f-date" type="date" value="' + escapeHTML(p.date) + '">') +
    field("Item", textInput("f-item", p.item, "What did you buy?", "list-items") + dataList("list-items", items)) +
    field("Supplier", textInput("f-supplier", p.supplier, "Who from?", "list-suppliers") + dataList("list-suppliers", suppliers)) +
    field("Amount", amountInput("f-amount", p.amount)) +
    field("Payment", choice("f-status", [["paid", "Paid"], ["unpaid", "Not paid"]], p.status)) +
    field("Method", choice("f-method", [["cash", "Cash"], ["eft", "EFT"]], p.method)) +
    field("Note (optional)", '<textarea id="f-note">' + escapeHTML(p.note || "") + "</textarea>") +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "New purchase" : "Edit purchase", body, async () => {
    const item = $("#f-item").value.trim();
    const amount = toNum($("#f-amount").value);
    if (!item) { toast("Enter what you bought."); return false; }
    if (amount <= 0) { toast("Enter an amount."); return false; }

    const row = {
      date: $("#f-date").value || todayISO(),
      item: item,
      supplier: $("#f-supplier").value.trim() || null,
      amount: amount,
      status: choiceValue("f-status"),
      method: choiceValue("f-method"),
      note: $("#f-note").value.trim() || null
    };
    const ok = await save("purchases", row, isNew ? null : p.id);
    if (ok) toast(isNew ? "Purchase saved." : "Purchase updated.");
    return ok;
  });

  if (!isNew) wireDelete("this purchase", () => remove("purchases", p.id));
}


/* ---------- stock orders ---------- */

function stockScreen() {
  if (!state.loaded) return '<div class="card"><div class="empty">Loading…</div></div>';

  const range = filterRange(state.filter.stock);
  const rows = db.stock.filter((o) => inRange(o.date_ordered, range));
  const openUnits = rows.filter((o) => !o.complete)
                        .reduce((sum, o) => sum + outstandingUnits(o), 0);

  let html = filterBar("stock");
  html += '<div class="section-head"><span>' + rows.length + " order" + (rows.length === 1 ? "" : "s") +
          "</span><span>" + tidyUnits(openUnits) + " still to deliver</span></div>";

  if (!rows.length) {
    html += emptyBox("No stock orders yet. Tap + to add the first one.");
    return html;
  }

  html += '<div class="card">';
  rows.forEach((o) => {
    const left = outstandingUnits(o);
    const done = o.complete || left <= 0;
    html +=
      '<button class="row" data-open="' + o.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(o.product) + "</div>" +
          '<div class="row-sub">' + escapeHTML(o.customer) + " · ordered " + shortDate(o.date_ordered) +
            (Number(o.unit_price) ? " · " + money(o.unit_price) + " each" : "") + "</div>" +
        "</div>" +
        '<div class="row-side">' +
          '<div class="row-amt">' + tidyUnits(o.qty_delivered) + " / " + tidyUnits(o.qty_ordered) + "</div>" +
          '<span class="pill ' + (done ? "pill-good" : "pill-warn") + '">' +
            (done ? "Complete" : tidyUnits(left) + " to go") + "</span>" +
        "</div>" +
      "</button>";
  });
  html += "</div>";
  return html;
}

function outstandingUnits(order) {
  return Math.max(0, Number(order.qty_ordered || 0) - Number(order.qty_delivered || 0));
}

/** 12 -> "12", 12.5 -> "12.5" — units are counted, not money. */
function tidyUnits(value) {
  const n = Number(value) || 0;
  return String(Math.round(n * 100) / 100);
}

function editStock(order) {
  const isNew = !order;
  const o = order || {
    product: "", customer: "", date_ordered: todayISO(), qty_ordered: "",
    unit_price: "", date_delivered: "", qty_delivered: "", complete: false, note: ""
  };

  const body =
    pickerField("Product", "f-product", db.products.map((p) => p.name), o.product, "product") +
    pickerField("Customer", "f-customer", db.customers.map((c) => c.name), o.customer, "customer") +
    '<div class="two">' +
      field("Date ordered", '<input id="f-ordered" type="date" value="' + escapeHTML(o.date_ordered || "") + '">') +
      field("Units ordered", numberInput("f-qty-ordered", o.qty_ordered, "0")) +
    "</div>" +
    field("Price per unit", amountInput("f-unit-price", o.unit_price)) +
    '<div class="two">' +
      field("Date delivered", '<input id="f-delivered" type="date" value="' + escapeHTML(o.date_delivered || "") + '">') +
      field("Units delivered", numberInput("f-qty-delivered", o.qty_delivered, "0")) +
    "</div>" +
    '<p id="f-outstanding" class="field-hint" style="text-align:center;font-size:15px"></p>' +
    field("Order complete?", choice("f-complete", [["no", "Not yet"], ["yes", "Complete"]],
                                   o.complete ? "yes" : "no")) +
    field("Note (optional)", '<textarea id="f-note">' + escapeHTML(o.note || "") + "</textarea>") +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "New stock order" : "Edit stock order", body, async () => {
    const product  = $("#f-product").value;
    const customer = $("#f-customer").value;
    const ordered  = toNum($("#f-qty-ordered").value);
    if (!product)  { toast("Choose a product."); return false; }
    if (!customer) { toast("Choose a customer."); return false; }
    if (ordered <= 0) { toast("Enter how many units were ordered."); return false; }

    const row = {
      product: product,
      customer: customer,
      date_ordered: $("#f-ordered").value || todayISO(),
      qty_ordered: ordered,
      unit_price: toNum($("#f-unit-price").value),
      date_delivered: $("#f-delivered").value || null,
      qty_delivered: toNum($("#f-qty-delivered").value),
      complete: choiceValue("f-complete") === "yes",
      note: $("#f-note").value.trim() || null
    };
    const ok = await save("stock_orders", row, isNew ? null : o.id);
    if (ok) toast(isNew ? "Order saved." : "Order updated.");
    return ok;
  });

  const showOutstanding = () => {
    const ordered   = toNum($("#f-qty-ordered").value);
    const delivered = toNum($("#f-qty-delivered").value);
    const left  = Math.max(0, ordered - delivered);
    const price = toNum($("#f-unit-price").value);
    $("#f-outstanding").innerHTML =
      "Outstanding: <strong>" + tidyUnits(left) + " unit" + (left === 1 ? "" : "s") + "</strong>" +
      (price ? " · " + money(left * price) : "");
  };
  ["f-qty-ordered", "f-qty-delivered", "f-unit-price"].forEach((id) => {
    $("#" + id).addEventListener("input", showOutstanding);
  });
  showOutstanding();

  // filling in a delivery date with nothing delivered yet is almost always a slip
  $("#f-qty-delivered").addEventListener("change", () => {
    if (toNum($("#f-qty-delivered").value) > 0 && !$("#f-delivered").value) {
      $("#f-delivered").value = todayISO();
    }
  });

  wirePickers();
  if (!isNew) wireDelete("this stock order", () => remove("stock_orders", o.id));
}


/* ---------- shared inputs ---------- */

function textInput(id, value, placeholder, listId) {
  return '<input id="' + id + '" type="text" autocapitalize="words" ' +
         (listId ? 'list="' + listId + '" ' : "") +
         'placeholder="' + escapeHTML(placeholder || "") + '" ' +
         'value="' + escapeHTML(value || "") + '">';
}

function dataList(id, values) {
  return '<datalist id="' + id + '">' +
         values.map((v) => '<option value="' + escapeHTML(v) + '"></option>').join("") +
         "</datalist>";
}

function uniqueValues(rows, key) {
  const seen = [];
  rows.forEach((r) => {
    const v = (r[key] || "").trim();
    if (v && !seen.includes(v)) seen.push(v);
  });
  return seen.sort();
}


/* ---------- form building blocks ---------- */

function field(label, inner) {
  return '<div class="field"><label>' + escapeHTML(label) + "</label>" + inner + "</div>";
}

function amountInput(id, value) {
  const v = (value === "" || value == null) ? "" : Number(value).toFixed(2);
  return '<input id="' + id + '" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" ' +
         'placeholder="0.00" value="' + escapeHTML(v) + '">';
}

function numberInput(id, value, placeholder) {
  const v = (value === "" || value == null) ? "" : String(Number(value));
  return '<input id="' + id + '" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" ' +
         'placeholder="' + escapeHTML(placeholder || "0") + '" value="' + escapeHTML(v) + '">';
}

/** dropdown plus a "＋ New" button that adds to customers/products */
function pickerField(label, id, names, current, kind) {
  const list = names.slice();
  if (current && !list.includes(current)) list.push(current);
  const options = ['<option value="">Choose…</option>'].concat(
    list.map((n) => '<option value="' + escapeHTML(n) + '"' +
                    (n === current ? " selected" : "") + ">" + escapeHTML(n) + "</option>")
  ).join("");
  return '<div class="field"><label>' + escapeHTML(label) + "</label>" +
         '<div class="with-add">' +
           '<select id="' + id + '">' + options + "</select>" +
           '<button type="button" class="btn" data-add="' + kind + '" data-target="' + id + '">＋ New</button>' +
         "</div></div>";
}

function wirePickers() {
  $$("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.add;             // "customer" | "product"
      const select = $("#" + btn.dataset.target);

      const addToSelect = (name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
        select.value = name;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        toast(name + " added.");
      };

      if (kind === "customer") {
        askForText("New customer", [{ id: "name", label: "Name" }], async (values) => {
          const name = values.name.trim();
          if (!name) return;
          const known = db.customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (!known && !(await save("customers", { name: name }, null))) return;
          addToSelect(name);
        });
        return;
      }

      askForText("New product", [
        { id: "name", label: "Name" },
        { id: "cost", label: "What one costs you", money: true },
        { id: "sell", label: "What you sell one for", money: true }
      ], async (values) => {
        const name = values.name.trim();
        if (!name) return;
        const known = db.products.find((r) => r.name.toLowerCase() === name.toLowerCase());
        if (!known && !(await save("products", {
          name: name, cost_price: toNum(values.cost), sell_price: toNum(values.sell)
        }, null))) return;
        addToSelect(name);
      });
    });
  });
}

function choice(id, pairs, current) {
  return '<div class="choice" data-choice="' + id + '">' +
    pairs.map(([value, label]) =>
      '<button type="button" data-value="' + value + '" aria-pressed="' +
      (value === current) + '">' + escapeHTML(label) + "</button>"
    ).join("") + "</div>";
}

function choiceValue(id) {
  const on = $('[data-choice="' + id + '"] button[aria-pressed="true"]');
  return on ? on.dataset.value : null;
}

function deleteButton() {
  return '<button type="button" id="f-delete" class="btn btn-danger btn-block sheet-delete">Delete</button>';
}

function wireDelete(what, doDelete) {
  $("#f-delete").addEventListener("click", () => {
    confirmAsk("Delete " + what + "? This cannot be undone.", async (yes) => {
      if (!yes) return;
      const ok = await doDelete();
      if (ok) { closeSheet(); toast("Deleted."); }
    });
  });
}

// choice buttons behave like radio buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".choice button");
  if (!btn) return;
  const group = btn.closest(".choice");
  $$("button", group).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  // fires after the new value is set, so listeners read the right one
  group.dispatchEvent(new CustomEvent("choicechange", { bubbles: true }));
});

function onChoice(id, handler) {
  const group = $('[data-choice="' + id + '"]');
  if (group) group.addEventListener("choicechange", handler);
}


/* ---------- sheet ---------- */

let onSave = null;

function openSheet(title, bodyHTML, handler) {
  $("#sheet-title").textContent = title;
  $("#sheet-body").innerHTML = bodyHTML;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
  onSave = handler;
}

function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-body").innerHTML = "";
  document.body.style.overflow = "";
  onSave = null;
}

document.addEventListener("DOMContentLoaded", () => {
  $("#sheet-save").addEventListener("click", async () => {
    if (!onSave) return;
    const btn = $("#sheet-save");
    btn.disabled = true;
    const ok = await onSave();
    btn.disabled = false;
    if (ok) closeSheet();
  });
});


/* ---------- confirm / prompt / toast ---------- */

let askHandler = null;

function confirmAsk(message, handler) {
  $("#ask-text").textContent = message;
  $("#ask-yes").textContent = "Delete";
  $("#ask").hidden = false;
  askHandler = handler;
}

function closeAsk(answer) {
  $("#ask").hidden = true;
  const handler = askHandler;
  askHandler = null;
  if (handler) handler(answer);
}

document.addEventListener("DOMContentLoaded", () => {
  $("#ask-yes").addEventListener("click", () => closeAsk(true));
});

/** Small dialog for adding a customer or a product without leaving the form. */
function askForText(title, fields, handler) {
  const wrap = document.createElement("div");
  wrap.className = "ask-wrap";
  wrap.innerHTML =
    '<div class="sheet-backdrop"></div>' +
    '<div class="ask ask-form" role="dialog" aria-modal="true">' +
      '<p class="ask-text">' + escapeHTML(title) + "</p>" +
      fields.map((f) =>
        '<div class="field"><label>' + escapeHTML(f.label) + "</label>" +
        '<input data-id="' + f.id + '" type="text" ' +
        (f.money ? 'inputmode="decimal" placeholder="0.00"' : 'autocapitalize="words"') +
        "></div>").join("") +
      '<div class="ask-btns">' +
        '<button class="btn btn-quiet" data-no>Cancel</button>' +
        '<button class="btn btn-primary" data-yes>Add</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(wrap);
  const inputs = $$("input", wrap);
  setTimeout(() => inputs[0].focus(), 60);

  const collect = () => {
    const values = {};
    inputs.forEach((i) => { values[i.dataset.id] = i.value; });
    return values;
  };
  const done = (values) => { wrap.remove(); if (values) handler(values); };
  $("[data-no]", wrap).addEventListener("click", () => done(null));
  $(".sheet-backdrop", wrap).addEventListener("click", () => done(null));
  $("[data-yes]", wrap).addEventListener("click", () => done(collect()));
  inputs.forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") done(collect()); }));
}

let toastTimer = null;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}


/* ---------- export ---------- */

const EXPORT_LABELS = { this: "this month", last: "last month", all: "all time" };

function openExport() {
  const body =
    '<p class="field-hint" style="margin-bottom:14px">Choose a period, then a format. ' +
    'The file is saved to this phone and can be emailed or shared from there.</p>' +
    field("Period", choice("f-period", [
      ["this", "This month"], ["last", "Last month"], ["all", "All"]
    ], "this")) +
    '<button type="button" class="btn btn-primary btn-block" id="x-excel" style="margin-bottom:10px">' +
      "Spreadsheet (Excel / CSV)</button>" +
    '<button type="button" class="btn btn-block" id="x-pdf" style="margin-bottom:10px">' +
      "Statement (PDF)</button>" +
    '<p class="field-hint">The spreadsheet downloads one file per list: sales, purchases, ' +
    'stock orders and cash adjustments. The PDF opens your phone’s print screen — ' +
    'choose <strong>Save as PDF</strong>.</p>';

  openSheet("Export", body, async () => true);
  $("#x-excel").addEventListener("click", () => exportSpreadsheets(choiceValue("f-period")));
  $("#x-pdf").addEventListener("click", () => exportStatement(choiceValue("f-period")));
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function csvFile(name, header, rows) {
  const lines = [header].concat(rows).map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens accented names and the R sign correctly
  download(name, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportData(period) {
  const range = filterRange(period);
  return {
    range: range,
    sales:       db.sales.filter((r) => inRange(r.date, range)),
    purchases:   db.purchases.filter((r) => inRange(r.date, range)),
    stock:       db.stock.filter((r) => inRange(r.date_ordered, range)),
    adjustments: db.adjustments.filter((r) => inRange(r.date, range))
  };
}

function exportSpreadsheets(period) {
  const data = exportData(period);
  const stamp = todayISO();
  const tag = period === "all" ? "all" : period + "-month";
  let files = 0;

  const later = (fn, delay) => setTimeout(fn, delay); // phones ignore rapid-fire downloads

  if (data.sales.length) {
    later(() => csvFile("nanies-sales-" + tag + "-" + stamp + ".csv",
      ["Date", "Customer", "Product", "Units", "Price each", "Cost each", "Amount",
       "Cost total", "Profit", "Status", "Received", "Outstanding", "Method", "Note"],
      data.sales.map((s) => [
        s.date, s.customer, s.product, tidyUnits(s.units),
        Number(s.unit_price || 0).toFixed(2), Number(s.unit_cost || 0).toFixed(2),
        Number(s.amount || 0).toFixed(2),
        (Number(s.unit_cost || 0) * Number(s.units || 0)).toFixed(2),
        saleProfit(s).toFixed(2),
        (SALE_STATUS[s.status] || {}).label || s.status,
        Number(s.amount_received || 0).toFixed(2),
        (Number(s.amount || 0) - Number(s.amount_received || 0)).toFixed(2),
        s.method === "eft" ? "EFT" : "Cash", s.note || ""
      ])), files++ * 350);
  }

  if (data.purchases.length) {
    later(() => csvFile("nanies-purchases-" + tag + "-" + stamp + ".csv",
      ["Date", "Item", "Supplier", "Amount", "Status", "Method", "Note"],
      data.purchases.map((p) => [
        p.date, p.item, p.supplier || "", Number(p.amount || 0).toFixed(2),
        p.status === "paid" ? "Paid" : "Not paid",
        p.method === "eft" ? "EFT" : "Cash", p.note || ""
      ])), files++ * 350);
  }

  if (data.stock.length) {
    later(() => csvFile("nanies-stock-orders-" + tag + "-" + stamp + ".csv",
      ["Date ordered", "Product", "Customer", "Units ordered", "Price per unit", "Value",
       "Date delivered", "Units delivered", "Units outstanding", "Complete", "Note"],
      data.stock.map((o) => [
        o.date_ordered, o.product, o.customer, tidyUnits(o.qty_ordered),
        Number(o.unit_price || 0).toFixed(2),
        (Number(o.qty_ordered || 0) * Number(o.unit_price || 0)).toFixed(2),
        o.date_delivered || "", tidyUnits(o.qty_delivered), tidyUnits(outstandingUnits(o)),
        o.complete ? "Yes" : "No", o.note || ""
      ])), files++ * 350);
  }

  if (data.adjustments.length) {
    later(() => csvFile("nanies-cash-adjustments-" + tag + "-" + stamp + ".csv",
      ["Date", "What happened", "Amount", "Effect on cash", "Effect on bank", "Note"],
      data.adjustments.map((a) => {
        const rule = ADJUST_KINDS[a.kind] || { label: a.kind, cash: 0, bank: 0 };
        const amount = Number(a.amount || 0);
        return [a.date, rule.label, amount.toFixed(2),
                (rule.cash * amount).toFixed(2), (rule.bank * amount).toFixed(2), a.note || ""];
      })), files++ * 350);
  }

  if (!files) { toast("Nothing to export for " + EXPORT_LABELS[period] + "."); return; }
  toast(files === 1 ? "Downloading 1 file…" : "Downloading " + files + " files…");
}

/** Builds a printable statement and opens the phone's print / Save as PDF screen. */
function exportStatement(period) {
  const data = exportData(period);
  const t = totals();
  const heading = data.range
    ? niceDate(data.range.from) + " to " + niceDate(data.range.to)
    : "All entries to date";

  // amounts and dates read better right-aligned and unwrapped on paper
  const cell = (text) => {
    const value = String(text == null ? "" : text);
    const numeric = /^-?R\s/.test(value) || /^[\d.]+$/.test(value);
    const dateLike = /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(value);
    const cls = numeric ? ' class="num"' : (dateLike ? ' class="nowrap"' : "");
    return "<td" + cls + ">" + escapeHTML(value) + "</td>";
  };

  const table = (title, header, rows) => {
    if (!rows.length) return "";
    return "<h2>" + escapeHTML(title) + "</h2><table><thead><tr>" +
      header.map((h) => "<th>" + escapeHTML(h) + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map(cell).join("") + "</tr>").join("") +
      "</tbody></table>";
  };

  const salesTotal = data.sales.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const profitTotal = data.sales.reduce((sum, r) => sum + saleProfit(r), 0);
  const unitsTotal = data.sales.reduce((sum, r) => sum + Number(r.units || 0), 0);
  const purchasesTotal = data.purchases.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  let html =
    "<h1>" + escapeHTML(CONFIG.BUSINESS_NAME) + "</h1>" +
    '<p class="sub">Statement · ' + escapeHTML(heading) + "<br>Printed " + niceDate(todayISO()) + "</p>" +
    "<h2>Where the money stands</h2>" +
    "<table><tbody>" +
      "<tr><td>Cash on hand</td><td class=\"num\">" + money(t.cash) + "</td></tr>" +
      "<tr><td>In the bank</td><td class=\"num\">" + money(t.bank) + "</td></tr>" +
      "<tr><td>Owed to us by customers</td><td class=\"num\">" + money(t.owedToUs) + "</td></tr>" +
      "<tr><td>Owed by us to suppliers</td><td class=\"num\">" + money(t.weOwe) + "</td></tr>" +
      "<tr><td>Units sold in this period</td><td class=\"num\">" + tidyUnits(unitsTotal) + "</td></tr>" +
      "<tr><td>Sales in this period</td><td class=\"num\">" + money(salesTotal) + "</td></tr>" +
      "<tr><td>What those sales cost to make</td><td class=\"num\">" +
        money(salesTotal - profitTotal) + "</td></tr>" +
      "<tr><td><strong>Profit on sales</strong></td><td class=\"num\"><strong>" +
        money(profitTotal) + "</strong></td></tr>" +
      "<tr><td>Purchases in this period</td><td class=\"num\">" + money(purchasesTotal) + "</td></tr>" +
      "<tr><td><strong>Sales less purchases</strong></td><td class=\"num\"><strong>" +
        money(salesTotal - purchasesTotal) + "</strong></td></tr>" +
    "</tbody></table>";

  html += table("Sales",
    ["Date", "Customer", "Product", "Units", "Each", "Amount", "Profit", "Received", "Status"],
    data.sales.map((s) => [niceDate(s.date), s.customer, s.product, tidyUnits(s.units),
      money(s.unit_price), money(s.amount), money(saleProfit(s)),
      money(s.amount_received), (SALE_STATUS[s.status] || {}).label || s.status]));

  html += table("Purchases", ["Date", "Item", "Supplier", "Amount", "Status"],
    data.purchases.map((p) => [niceDate(p.date), p.item, p.supplier || "", money(p.amount),
      p.status === "paid" ? "Paid" : "Not paid"]));

  html += table("Stock orders", ["Ordered", "Product", "Customer", "Units", "Delivered", "Outstanding"],
    data.stock.map((o) => [niceDate(o.date_ordered), o.product, o.customer,
      tidyUnits(o.qty_ordered), tidyUnits(o.qty_delivered), tidyUnits(outstandingUnits(o))]));

  html += table("Cash and bank adjustments", ["Date", "What happened", "Amount", "Note"],
    data.adjustments.map((a) => [niceDate(a.date),
      (ADJUST_KINDS[a.kind] || {}).label || a.kind, money(a.amount), a.note || ""]));

  if (!data.sales.length && !data.purchases.length && !data.stock.length && !data.adjustments.length) {
    html += "<p>No entries in this period.</p>";
  }

  let area = $("#print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  area.innerHTML = html;
  closeSheet();
  setTimeout(() => window.print(), 150);
}


/* ---------- overflow menu ---------- */

function openMenu() {
  const body =
    '<button type="button" class="btn btn-block" id="m-export" style="margin-bottom:10px">Export for the bookkeeper</button>' +
    '<button type="button" class="btn btn-block" id="m-refresh" style="margin-bottom:10px">Refresh from the database</button>' +
    '<button type="button" class="btn btn-block" id="m-lock" style="margin-bottom:12px">Lock this device</button>' +
    '<p class="field-hint">' + escapeHTML(CONFIG.BUSINESS_NAME) + " · all amounts in Rands. " +
    "The same data shows on every device that signs in with the passcode.</p>";
  openSheet("More", body, async () => true);
  $("#m-export").addEventListener("click", openExport);
  $("#m-refresh").addEventListener("click", async () => {
    await loadAll();
    closeSheet();
    toast("Up to date.");
  });
  $("#m-lock").addEventListener("click", lock);
}


/* ---------- go ---------- */

document.addEventListener("DOMContentLoaded", startGate);
