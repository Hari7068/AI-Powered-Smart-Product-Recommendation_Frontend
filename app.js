/* PriceSage frontend: talks to the REST API in /backend */
const API = window.API_BASE || "http://localhost:3000";
const $ = (id) => document.getElementById(id);
const inr = (n) => "₹" + n.toLocaleString("en-IN");
const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

let STORES = [];
let P = []; // products from the API
const state = { ai: null, cat: "All", sort: "ai", max: 150000, savedOnly: false, cmp: [], saved: [] };
try { state.saved = JSON.parse(localStorage.getItem("ps-saved") || "[]"); } catch (e) {}
const persist = () => { try { localStorage.setItem("ps-saved", JSON.stringify(state.saved)); } catch (e) {} };

async function api(path, options) {
  const res = await fetch(API + path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showError(msg) { $("notice").innerHTML = msg ? `<div class="notice">${msg}</div>` : ""; }

/* ---------- recommendations (calls POST /api/recommend) ---------- */
async function runAI() {
  const q = $("q").value.trim();
  if (!q) { state.ai = null; $("insight").style.display = "none"; state.sort = "ai"; return render(); }
  try {
    const { intent, results } = await api("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    showError("");
    results.forEach((r) => { const p = P.find((x) => x.id === r.id); if (p) p.ai = r; });
    state.ai = intent;
    state.sort = "ai"; $("sort").value = "ai";
    if (intent.cats.length === 1) { state.cat = intent.cats[0]; $("cat").value = state.cat; }
    else { state.cat = "All"; $("cat").value = "All"; }
    if (intent.budget) { state.max = Math.min(150000, Math.round(intent.budget / 1000) * 1000); $("max").value = state.max; }

    const bits = [];
    if (intent.cats.length) bits.push("category: " + intent.cats.join(", "));
    if (intent.budget) bits.push("budget: " + inr(intent.budget));
    if (intent.feats.length) bits.push("priorities: " + intent.feats.join(", "));
    const box = $("insight");
    box.style.display = "block";
    box.innerHTML = bits.length
      ? "<b>Here's what I understood</b><br>" + bits.join(" · ") + ". Ranked below by match score."
      : "<b>I couldn't pick out a category, budget or feature.</b><br>Try adding something like \"laptop\", \"under 50000\" or \"good battery\".";
    render();
  } catch (e) {
    showError("Could not get recommendations: " + e.message);
  }
}

/* ---------- list + filters ---------- */
function visible() {
  const L = P.filter((p) => (state.cat === "All" || p.c === state.cat) && p.best.v <= state.max && (!state.savedOnly || state.saved.includes(p.id)));
  const s = state.sort;
  L.sort((a, b) =>
    s === "low" ? a.best.v - b.best.v :
    s === "high" ? b.best.v - a.best.v :
    s === "rate" ? b.r - a.r :
    s === "save" ? (b.high - b.best.v) - (a.high - a.best.v) :
    state.ai ? b.ai.pct - a.ai.pct : b.r - a.r);
  return L;
}

function render() {
  $("maxv").textContent = state.max >= 150000 ? "No limit" : inr(state.max);
  const L = visible();
  $("grid").innerHTML = L.length ? L.map((p, i) => `
  <article class="card ${state.ai && i === 0 && state.sort === "ai" ? "top" : ""}">
    <div class="row"><div><div class="cat">${p.c}</div><h3>${p.n}</h3></div>
    ${state.ai ? `<div class="ring" style="--p:${p.ai.pct}" title="Match score"><b>${p.ai.pct}%</b></div>` : ""}</div>
    <div class="stars">${stars(p.r)} <span>${p.r} (${p.rv.toLocaleString("en-IN")})</span></div>
    <div class="cat">${p.s}</div>
    <div><div class="price">${inr(p.best.v)}</div><div class="store">Lowest at ${p.best.s} · saves ${inr(p.high - p.best.v)} vs highest</div></div>
    <div class="tags">${p.t.slice(0, 4).map((t) => `<span>${t}</span>`).join("")}</div>
    ${state.ai ? `<div class="why">${p.ai.why}</div>` : ""}
    <div class="acts"><button class="primary" data-d="${p.id}">Compare prices</button>
    <button data-c="${p.id}" class="${state.cmp.includes(p.id) ? "on" : ""}">${state.cmp.includes(p.id) ? "Added" : "+ Compare"}</button>
    <button data-s="${p.id}" class="${state.saved.includes(p.id) ? "on" : ""}" aria-label="Save">${state.saved.includes(p.id) ? "Saved" : "Save"}</button></div>
  </article>`).join("") : `<div class="empty">No products match these filters. Raise your budget or pick another category.</div>`;
  renderCmp();
}

/* ---------- side-by-side compare (calls GET /api/compare) ---------- */
async function renderCmp() {
  const box = $("cmp");
  if (state.cmp.length === 0) { box.hidden = true; return; }
  box.hidden = false;
  if (state.cmp.length < 2) { $("cmpbody").innerHTML = "<p>Add one more product to compare side by side.</p>"; return; }
  let items;
  try { items = (await api("/api/compare?ids=" + state.cmp.join(","))).items; }
  catch (e) { $("cmpbody").innerHTML = `<div class="notice">${e.message}</div>`; return; }
  items.sort((a, b) => state.cmp.indexOf(a.id) - state.cmp.indexOf(b.id));
  const minBest = Math.min(...items.map((p) => p.best.v)), maxR = Math.max(...items.map((p) => p.r));
  let h = "<table><tr><th></th>" + items.map((p) => `<th>${p.n}</th>`).join("") + "</tr>";
  h += "<tr><th>Lowest price</th>" + items.map((p) => `<td class="${p.best.v === minBest ? "best" : ""}">${inr(p.best.v)} (${p.best.s})</td>`).join("") + "</tr>";
  h += "<tr><th>Rating</th>" + items.map((p) => `<td class="${p.r === maxR ? "best" : ""}">${p.r} / 5</td>`).join("") + "</tr>";
  h += "<tr><th>Key specs</th>" + items.map((p) => `<td>${p.s}</td>`).join("") + "</tr>";
  STORES.forEach((s, i) => {
    const row = items.map((p) => p.prices[i]); const m = Math.min(...row.map((x) => x.v));
    h += `<tr><th>${s}</th>` + row.map((x) => `<td class="${x.v === m ? "best" : ""}">${inr(x.v)}</td>`).join("") + "</tr>";
  });
  h += "</table><p style='color:var(--muted);font-size:14px'>Highlighted cells mark the best value in each row.</p>";
  $("cmpbody").innerHTML = h;
}

/* ---------- product detail (calls GET /api/products/:id) ---------- */
async function detail(id) {
  let p;
  try { p = await api("/api/products/" + id); } catch (e) { return showError(e.message); }
  const sorted = [...p.prices].sort((a, b) => a.v - b.v);
  const lo = Math.min(...p.hist), hi = Math.max(...p.hist), W = 300, H = 80;
  const pts = p.hist.map((v, i) => `${i * (W / 5)},${H - 6 - ((v - lo) / ((hi - lo) || 1)) * (H - 14)}`).join(" ");
  const above = Math.round((p.best.v / lo - 1) * 100);
  const buy = above <= 3;
  $("dlgbody").innerHTML = `
  <div class="row"><div><div class="cat">${p.c}</div><h2>${p.n}</h2><div class="cat">${p.s}</div></div><button class="ghost" id="x">Close</button></div>
  <h3 style="margin:16px 0 8px;font-size:17px">Price by store</h3>
  ${sorted.map((x, i) => `<div style="margin:8px 0"><div class="row"><span>${x.s}${i === 0 ? " <b style='color:var(--good)'>· lowest</b>" : ""}</span><span><b>${inr(x.v)}</b> <small class="cat">delivery ${x.d} days</small></span></div><div class="bar"><i style="width:${(sorted[0].v / x.v) * 100}%"></i></div></div>`).join("")}
  <h3 style="margin:16px 0 4px;font-size:17px">Last 6 months (lowest price)</h3>
  <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Price trend"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/><circle cx="${W}" cy="${pts.split(" ").pop().split(",")[1]}" r="4" fill="var(--gold)"/></svg>
  <div class="row cat"><span>6 months ago: ${inr(p.hist[0])}</span><span>Low: ${inr(lo)}</span><span>Now: ${inr(p.best.v)}</span></div>
  <div class="verdict ${buy ? "buy" : "wait"}">${buy ? "Good time to buy: today's best price is at or near the 6-month low." : `Consider waiting: today's best price is ${above}% above the 6-month low of ${inr(lo)}.`}</div>`;
  $("dlg").showModal();
  $("x").onclick = () => $("dlg").close();
}

/* ---------- events ---------- */
$("grid").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.d) detail(+b.dataset.d);
  if (b.dataset.c) {
    const id = +b.dataset.c, i = state.cmp.indexOf(id);
    if (i > -1) state.cmp.splice(i, 1); else { if (state.cmp.length >= 3) state.cmp.shift(); state.cmp.push(id); }
    render();
  }
  if (b.dataset.s) {
    const id = +b.dataset.s, i = state.saved.indexOf(id);
    i > -1 ? state.saved.splice(i, 1) : state.saved.push(id);
    persist(); render();
  }
});
$("dlg").addEventListener("click", (e) => { if (e.target === $("dlg")) $("dlg").close(); });
$("go").onclick = runAI;
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") runAI(); });
$("cat").onchange = (e) => { state.cat = e.target.value; render(); };
$("sort").onchange = (e) => { state.sort = e.target.value; render(); };
$("max").oninput = (e) => { state.max = +e.target.value; render(); };
$("saved").onchange = (e) => { state.savedOnly = e.target.checked; render(); };
$("theme").onclick = () => {
  const r = document.documentElement;
  const dark = getComputedStyle(r).getPropertyValue("--bg").trim() === "#0e1a18";
  r.dataset.theme = dark ? "light" : "dark";
};
$("chips").innerHTML = ["Gaming laptop under 100k", "Phone with great camera under 45000", "Noise cancelling headphones for travel", "Budget smartwatch for fitness", "Light laptop for student"]
  .map((t) => `<button class="chip">${t}</button>`).join("");
$("chips").onclick = (e) => { if (e.target.classList.contains("chip")) { $("q").value = e.target.textContent; runAI(); } };

/* ---------- boot: load catalog from API ---------- */
(async function init() {
  try {
    const data = await api("/api/products");
    P = data.products; STORES = data.stores;
    $("cat").innerHTML = ["All", ...data.categories].map((c) => `<option>${c}</option>`).join("");
    render();
  } catch (e) {
    showError("Can't reach the backend at " + API + ". Start it with <code>node server.js</code> in the backend folder, then reload.");
  }
})();
