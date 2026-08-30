/* ============================================================
   CONFIG — PASTE YOUR OWN VALUES HERE
   ------------------------------------------------------------
   1. SUPABASE_URL   Supabase → Project Settings → API → Project URL
   2. SUPABASE_ANON_KEY   the "anon public" key on the same page
      (never the service_role key)
   3. PASSCODE       whatever you and your partner will type in
   ============================================================ */
const CONFIG = {
  SUPABASE_URL:      "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  PASSCODE:          "1234",
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
  });
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
  if (/row-level security/i.test(msg)) return "The database is refusing writes — re-run schema.sql.";
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

const TITLES = { home: "Home", sales: "Sales", purchases: "Purchases", stock: "Stock orders" };

function go(screen) {
  state.screen = screen;
  $("#title").textContent = TITLES[screen];
  $$(".tab").forEach((t) => {
    if (t.dataset.nav === screen) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  $("#fab").hidden = (screen === "home");
  window.scrollTo(0, 0);
  render();
}

function render() {
  const screen = $("#screen");
  if (state.screen === "sales")     { screen.innerHTML = salesScreen(); wireList("sales"); return; }
  if (state.screen === "purchases") { screen.innerHTML = soonScreen("Purchases"); return; }
  if (state.screen === "stock")     { screen.innerHTML = soonScreen("Stock orders"); return; }
  screen.innerHTML = soonScreen("Home");
}

function soonScreen(name) {
  return '<div class="card"><div class="empty"><span class="empty-big">🛠</span>' +
         escapeHTML(name) + " is being built next.</div></div>";
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

  const total = rows.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const owed  = rows.reduce((sum, s) => sum + (Number(s.amount || 0) - Number(s.amount_received || 0)), 0);

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
    const outstanding = Number(s.amount || 0) - Number(s.amount_received || 0);
    const pillText = meta.label;
    html +=
      '<button class="row" data-open="' + s.id + '">' +
        '<div class="row-main">' +
          '<div class="row-title">' + escapeHTML(s.customer) + "</div>" +
          '<div class="row-sub">' + escapeHTML(s.product) + " · " + niceDate(s.date) +
            " · " + (s.method === "eft" ? "EFT" : "Cash") +
            (s.status === "part" ? " · " + money(outstanding) + " due" : "") + "</div>" +
        "</div>" +
        '<div class="row-side">' +
          '<div class="row-amt">' + money(s.amount) + "</div>" +
          '<span class="pill ' + meta.pill + '">' + pillText + "</span>" +
        "</div>" +
      "</button>";
  });
  html += "</div>";

  if (owed > 0) {
    html += '<p class="field-hint" style="text-align:center">Still owed to us in this period: <strong>' +
            money(owed) + "</strong></p>";
  }
  return html;
}

function editSale(sale) {
  const isNew = !sale;
  const s = sale || {
    date: todayISO(), customer: "", product: "",
    amount: "", status: "unpaid", amount_received: "", method: "cash", note: ""
  };

  const body =
    field("Date", '<input id="f-date" type="date" value="' + escapeHTML(s.date) + '">') +
    pickerField("Customer", "f-customer", db.customers.map((c) => c.name), s.customer, "customer") +
    pickerField("Product", "f-product", db.products.map((p) => p.name), s.product, "product") +
    field("Amount", amountInput("f-amount", s.amount)) +
    field("Payment", choice("f-status", [
      ["paid", "Paid"], ["part", "Part paid"], ["unpaid", "Not paid"]
    ], s.status)) +
    '<div id="wrap-received">' +
      field("Received so far", amountInput("f-received", s.amount_received)) +
    "</div>" +
    field("Method", choice("f-method", [["cash", "Cash"], ["eft", "EFT"]], s.method)) +
    field("Note (optional)", '<textarea id="f-note">' + escapeHTML(s.note || "") + "</textarea>") +
    (isNew ? "" : deleteButton());

  openSheet(isNew ? "New sale" : "Edit sale", body, async () => {
    const amount = toNum($("#f-amount").value);
    const status = choiceValue("f-status");
    let received = toNum($("#f-received").value);
    if (status === "paid") received = amount;
    if (status === "unpaid") received = 0;
    if (received > amount) received = amount;

    const customer = $("#f-customer").value;
    const product  = $("#f-product").value;
    if (!customer) { toast("Choose a customer."); return false; }
    if (!product)  { toast("Choose a product."); return false; }
    if (amount <= 0) { toast("Enter an amount."); return false; }

    const row = {
      date: $("#f-date").value || todayISO(),
      customer: customer,
      product: product,
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

  const syncReceived = () => {
    const status = choiceValue("f-status");
    const amount = toNum($("#f-amount").value);
    const wrap = $("#wrap-received");
    wrap.hidden = (status !== "part");
    if (status === "paid") $("#f-received").value = amount ? amount.toFixed(2) : "";
    if (status === "unpaid") $("#f-received").value = "";
  };
  onChoice("f-status", syncReceived);
  $("#f-amount").addEventListener("input", syncReceived);
  syncReceived();

  wirePickers();
  if (!isNew) wireDelete("this sale", () => remove("sales", s.id));
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
      askForText(kind === "customer" ? "New customer" : "New product", async (name) => {
        const clean = name.trim();
        if (!clean) return;
        const table = kind === "customer" ? "customers" : "products";
        const existing = (kind === "customer" ? db.customers : db.products)
          .find((r) => r.name.toLowerCase() === clean.toLowerCase());
        if (!existing) {
          const ok = await save(table, { name: clean }, null);
          if (!ok) return;
        }
        const option = document.createElement("option");
        option.value = clean;
        option.textContent = clean;
        select.appendChild(option);
        select.value = clean;
        toast(clean + " added.");
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

/** Simple one-line text prompt, used for new customers and products. */
function askForText(title, handler) {
  const wrap = document.createElement("div");
  wrap.className = "ask-wrap";
  wrap.innerHTML =
    '<div class="sheet-backdrop"></div>' +
    '<div class="ask" role="dialog" aria-modal="true">' +
      '<p class="ask-text">' + escapeHTML(title) + "</p>" +
      '<div class="field"><input type="text" autocapitalize="words" placeholder="Name"></div>' +
      '<div class="ask-btns">' +
        '<button class="btn btn-quiet" data-no>Cancel</button>' +
        '<button class="btn btn-primary" data-yes>Add</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(wrap);
  const input = $("input", wrap);
  setTimeout(() => input.focus(), 60);

  const done = (value) => { wrap.remove(); if (value != null) handler(value); };
  $("[data-no]", wrap).addEventListener("click", () => done(null));
  $(".sheet-backdrop", wrap).addEventListener("click", () => done(null));
  $("[data-yes]", wrap).addEventListener("click", () => done(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); });
}

let toastTimer = null;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}


/* ---------- overflow menu ---------- */

function openMenu() {
  const body =
    '<button type="button" class="btn btn-block" id="m-lock" style="margin-bottom:12px">Lock this device</button>' +
    '<p class="field-hint">' + escapeHTML(CONFIG.BUSINESS_NAME) + " · all amounts in Rands.</p>";
  openSheet("More", body, async () => true);
  $("#m-lock").addEventListener("click", lock);
}


/* ---------- go ---------- */

document.addEventListener("DOMContentLoaded", startGate);
