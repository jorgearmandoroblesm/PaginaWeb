let state = {
  page: 1,
  limit: 20,
  exp_siaf: "",
  order_type: "",
  order_number: "",
  supplier: "",
  status: "",
  q: "",
  from: "",
  to: ""
};

async function api(path) {
  const r = await fetch(path);
  const t = await r.text();
  if (!r.ok) throw new Error(t || "Error API");
  return JSON.parse(t);
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v != null) u.set(k, v);
  }
  return u.toString();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(n) {
  if (n == null || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Devuelve símbolo monetario para mostrar ANTES del monto */
function currencySymbol(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "PEN") return "S/";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  return c || "";
}

/* ============================
   TOTAL EN LETRAS (ES)
============================ */
function currencyName(code, amountInt) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "PEN") return amountInt === 1 ? "sol" : "soles";
  if (c === "USD") return amountInt === 1 ? "dólar" : "dólares";
  if (c === "EUR") return amountInt === 1 ? "euro" : "euros";
  return amountInt === 1 ? "unidad" : "unidades";
}

function capitalizeFirst(s) {
  s = String(s || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function toMasculineUn(words) {
  // "uno" -> "un" cuando va antes de moneda (sol/es, dólar/es...)
  return String(words || "")
    .replace(/veintiuno$/i, "veintiún")
    .replace(/ y uno$/i, " y un")
    .replace(/uno$/i, "un");
}

function numberToSpanishWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));

  const U = ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve"];
  const E = ["diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve"];
  const D = ["","", "veinte","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
  const C = ["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];

  function tensToWords(x) {
    if (x < 10) return U[x];
    if (x < 20) return E[x - 10];
    if (x < 30) {
      if (x === 20) return "veinte";
      const v = x - 20;
      if (v === 2) return "veintidós";
      if (v === 3) return "veintitrés";
      if (v === 6) return "veintiséis";
      return "veinti" + U[v];
    }
    const ten = Math.floor(x / 10);
    const unit = x % 10;
    if (unit === 0) return D[ten];
    return `${D[ten]} y ${U[unit]}`;
  }

  function hundredsToWords(x) {
    if (x === 0) return "";
    if (x === 100) return "cien";
    if (x < 100) return tensToWords(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    const head = C[h];
    if (r === 0) return head;
    return `${head} ${tensToWords(r)}`;
  }

  function chunkToWords(x) {
    return hundredsToWords(x).trim(); // 0..999
  }

  if (n === 0) return "cero";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1_000);
  const cientos = n % 1_000;

  const parts = [];

  if (millones > 0) {
    if (millones === 1) parts.push("un millón");
    else parts.push(`${toMasculineUn(numberToSpanishWords(millones))} millones`);
  }

  if (miles > 0) {
    if (miles === 1) parts.push("mil");
    else parts.push(`${toMasculineUn(chunkToWords(miles))} mil`);
  }

  if (cientos > 0) {
    parts.push(chunkToWords(cientos));
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function amountToCurrencyWords(amount, currencyCode) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return "—";

  const fixed = num.toFixed(2); // evita errores flotantes
  const [intStr, decStr] = fixed.split(".");
  const intVal = Math.abs(parseInt(intStr, 10)) || 0;
  const cents = decStr || "00";

  let words = numberToSpanishWords(intVal);
  words = toMasculineUn(words);

  const curName = currencyName(currencyCode, intVal);
  return `${capitalizeFirst(words)} con ${cents}/100 ${curName}`.toUpperCase();
}

// modal
function openModal(html) {
  const back = document.querySelector("#modalBack");
  document.querySelector("#modalBody").innerHTML = html;
  back.style.display = "flex";
}
function closeModal() {
  document.querySelector("#modalBack").style.display = "none";
}

async function loadMeta() {
  const meta = await api("/api/orders/meta");

  const sel = document.querySelector("#status");
  if (sel) {
    sel.innerHTML =
      `<option value="">Estado (todos)</option>` +
      meta.statuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }
}

function shortStatus(full) {
  const s = String(full || "").trim().toUpperCase();
  if (!s) return "—";
  if (s.startsWith("COMPROM")) return "C";
  if (s.startsWith("DEVENG")) return "D";
  if (s.startsWith("ANUL")) return "A";
  return s[0];
}

async function loadOrders() {
  const url = `/api/orders?${qs({
    page: state.page,
    limit: state.limit,
    exp_siaf: state.exp_siaf,
    order_type: state.order_type,
    order_number: state.order_number,
    supplier: state.supplier,
    status: state.status,
    q: state.q,
    from: state.from,
    to: state.to
  })}`;

  const tableWrap = document.querySelector(".orders-tablewrap");
  tableWrap?.classList.add("is-loading");

  try {
    const data = await api(url);
    const tbody = document.querySelector("#tbody");
    if (!tbody) return;

    tbody.innerHTML = data.rows.map(o => {
      const sym = currencySymbol(o.currency || "PEN");
      const totalTxt = `${sym} ${money(o.amount)}`;

      const supplierName = esc(o.supplier || "—");
      const supplierRuc = esc(o.supplier_ruc || "—");
      const supplierHtml = `
        <div class="data-stack" title="${supplierName} · RUC: ${supplierRuc}">
          <div class="data-primary clamp">${supplierName}</div>
          <div class="data-secondary clamp">RUC: ${supplierRuc}</div>
        </div>
      `;

      const requesterName = esc(o.requester || "—");
      const requesterArea = esc(o.area || "—");
      const officeHtml = `
        <div class="data-stack" title="${requesterName} · ${requesterArea}">
          <div class="data-primary clamp">${requesterName}</div>
          <div class="data-secondary clamp">${requesterArea}</div>
        </div>
      `;

      const openBtn = o.file_url
        ? `<a class="pill" href="/api/orders/${o.id}/open" target="_blank" rel="noopener">Ver PDF</a>`
        : `<span class="pill">Sin link</span>`;

      const statusFull = String(o.status || "—");
      const statusSmall = shortStatus(statusFull);

      return `
        <tr class="clickable" data-id="${o.id}">
          <td>${esc(o.exp_siaf || "")}</td>
          <td>${esc(o.order_type || "")}</td>
          <td>${esc(o.order_number || "")}</td>
          <td>${esc(o.issue_date || "")}</td>
          <td class="wrap">${supplierHtml}</td>
          <td class="wrap">${officeHtml}</td>
          <td>${totalTxt}</td>
          <td style="text-align:center; min-width:56px;">
            <span class="status" title="${esc(statusFull)}">${esc(statusSmall)}</span>
          </td>
          <td>${openBtn}</td>
        </tr>
      `;
    }).join("");

    // click fila -> detalle
    tbody.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", async (ev) => {
        if (ev.target && ev.target.closest("a")) return;

        const id = tr.getAttribute("data-id");
        const o = await api(`/api/orders/${id}`);
        const sym = currencySymbol(o.currency || "PEN");
        const totalLetras = amountToCurrencyWords(o.amount, o.currency || "PEN");

        openModal(`
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div style="font-weight:900; font-size:18px;">Detalle de orden</div>
              <div class="pill" style="margin-top:6px;">${esc(o.order_code || "—")}</div>
            </div>
            <button type="button" id="modalClose" class="btn-icon" title="Cerrar">✕</button>
          </div>

          <div style="height:16px"></div>

          <div class="row row-compact">

            <div class="kv">
              <div class="k">EXP SIAF</div>
              <div class="v mono">${esc(o.exp_siaf || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">N° ORDEN</div>
              <div class="v mono">${esc(o.order_number || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">TIPO</div>
              <div class="v mono">${esc(o.order_type || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">FECHA</div>
              <div class="v mono">${esc(o.issue_date || "—")}</div>
            </div>

            <div class="kv span-2">
              <div class="k">RAZÓN SOCIAL</div>
              <div class="v">${esc(o.supplier || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">RUC</div>
              <div class="v mono">${esc(o.supplier_ruc || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">ESTADO</div>
              <div class="v mono">${esc(o.status || "—")}</div>
            </div>

            <div class="kv span-2">
              <div class="k">SOLICITANTE</div>
              <div class="v">${esc(o.requester || "—")}</div>
            </div>

            <div class="kv span-2">
              <div class="k">OFICINA</div>
              <div class="v">${esc(o.area || "—")}</div>
            </div>

            <div class="kv span-4">
              <div class="k">CONCEPTO (DETALLADO)</div>
              <div class="v">${esc(o.title || "—")}</div>
            </div>

            <div class="kv">
              <div class="k">TOTAL</div>
              <div class="v mono">${sym} ${money(o.amount)}</div>
            </div>

            <div class="kv span-3">
              <div class="k">TOTAL EN LETRAS</div>
              <div class="v">${esc(totalLetras)}</div>
            </div>

          </div>

          <div style="height:16px"></div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${o.file_url ? `<a class="pill" href="/api/orders/${o.id}/open" target="_blank" rel="noopener">Ver PDF</a>` : `<span class="pill">Sin link</span>`}
          </div>
        `);

        document.querySelector("#modalClose")?.addEventListener("click", closeModal);
      });
    });

    const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

    // Page info (abajo + arriba)
    const pageinfo = document.querySelector("#pageinfo");
    const pageinfoTop = document.querySelector("#pageinfoTop");
    const infoTxt = `Página ${data.page} / ${totalPages} • Registros: ${data.total}`;
    if (pageinfo) pageinfo.textContent = infoTxt;
    if (pageinfoTop) pageinfoTop.textContent = infoTxt;

    // Total filtrado
    const sumInfo = document.querySelector("#suminfo");
    const cur = (data.rows?.[0]?.currency) || "PEN";
    if (sumInfo) sumInfo.textContent = `Total: ${currencySymbol(cur)} ${money(data.sum_amount)}`;

    // Botones prev/next (abajo + arriba)
    const prev = document.querySelector("#prev");
    const next = document.querySelector("#next");
    const prevTop = document.querySelector("#prevTop");
    const nextTop = document.querySelector("#nextTop");

    const disablePrev = data.page <= 1;
    const disableNext = data.page >= totalPages;

    if (prev) prev.disabled = disablePrev;
    if (next) next.disabled = disableNext;
    if (prevTop) prevTop.disabled = disablePrev;
    if (nextTop) nextTop.disabled = disableNext;

    state.page = data.page;

    // goto (abajo + arriba)
    const goto = document.querySelector("#goto");
    const gotoTop = document.querySelector("#gotoTop");

    if (goto) {
      goto.value = String(data.page);
      goto.max = String(totalPages);
    }
    if (gotoTop) {
      gotoTop.value = String(data.page);
      gotoTop.max = String(totalPages);
    }

    if (tableWrap) tableWrap.scrollTop = 0;
  } finally {
    tableWrap?.classList.remove("is-loading");
  }
}

function showErr(e) {
  const box = document.querySelector("#error");
  if (!box) return;
  box.textContent = String(e?.message || e);
  box.style.display = "block";
}

function applyFilters() {
  const $ = (id) => document.querySelector(id);
  state.exp_siaf = $("#exp_siaf").value.trim();
  state.order_type = $("#order_type").value.trim();
  state.order_number = $("#order_number").value.trim();
  state.supplier = $("#supplier").value.trim();
  state.status = $("#status").value;
  state.q = $("#q").value.trim();
  state.from = $("#from").value;
  state.to = $("#to").value;
  state.limit = Number($("#limit").value || 20);
  state.page = 1;
  loadOrders().catch(showErr);
}

function bind() {
  const $ = (id) => document.querySelector(id);

  const applyFilters = () => {
    state.exp_siaf = $("#exp_siaf")?.value?.trim() || "";
    state.order_type = $("#order_type")?.value?.trim() || "";
    state.order_number = $("#order_number")?.value?.trim() || "";
    state.supplier = $("#supplier")?.value?.trim() || "";
    state.status = $("#status")?.value || "";
    state.q = $("#q")?.value?.trim() || "";
    state.from = $("#from")?.value || "";
    state.to = $("#to")?.value || "";
    state.limit = Number($("#limit")?.value || 20);
    state.page = 1;
    loadOrders().catch(showErr);
  };

  $("#buscar")?.addEventListener("click", applyFilters);

  $("#limpiar")?.addEventListener("click", () => {
    if ($("#exp_siaf")) $("#exp_siaf").value = "";
    if ($("#order_type")) $("#order_type").value = "";
    if ($("#order_number")) $("#order_number").value = "";
    if ($("#supplier")) $("#supplier").value = "";
    if ($("#status")) $("#status").value = "";
    if ($("#q")) $("#q").value = "";
    if ($("#from")) $("#from").value = "";
    if ($("#to")) $("#to").value = "";
    if ($("#limit")) $("#limit").value = "20";

    state = { page: 1, limit: 20, exp_siaf:"", order_type:"", order_number:"", supplier:"", status:"", q:"", from:"", to:"" };
    loadOrders().catch(showErr);
  });

  // Pager abajo
  $("#prev")?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadOrders().catch(showErr);
  });

  $("#next")?.addEventListener("click", () => {
    state.page += 1;
    loadOrders().catch(showErr);
  });

  $("#gotoBtn")?.addEventListener("click", () => {
    const max = Number($("#goto")?.max || 1);
    const n = Math.max(1, Math.min(max || 1, Number($("#goto")?.value || 1)));
    state.page = n;
    loadOrders().catch(showErr);
  });

  $("#goto")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#gotoBtn")?.click();
    }
  });

  // Pager arriba
  $("#prevTop")?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadOrders().catch(showErr);
  });

  $("#nextTop")?.addEventListener("click", () => {
    state.page += 1;
    loadOrders().catch(showErr);
  });

  $("#gotoBtnTop")?.addEventListener("click", () => {
    const max = Number($("#gotoTop")?.max || 1);
    const n = Math.max(1, Math.min(max || 1, Number($("#gotoTop")?.value || 1)));
    state.page = n;
    loadOrders().catch(showErr);
  });

  $("#gotoTop")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#gotoBtnTop")?.click();
    }
  });

  $("#export")?.addEventListener("click", () => {
    const url = `/api/orders/export?${qs({
      exp_siaf: state.exp_siaf,
      order_type: state.order_type,
      order_number: state.order_number,
      supplier: state.supplier,
      status: state.status,
      q: state.q,
      from: state.from,
      to: state.to
    })}`;
    window.open(url, "_blank", "noopener");
  });

  // ENTER = aplicar filtros
  const applyOnEnter = (el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("#buscar")?.click();
      }
    });
  };

  ["#exp_siaf", "#order_type", "#order_number", "#supplier", "#status", "#q", "#from", "#to", "#limit"]
    .forEach(sel => applyOnEnter(document.querySelector(sel)));

  // cerrar modal
  document.querySelector("#modalBack")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "modalBack") closeModal();
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // Enter aplica filtros en cualquier input/select del panel
  document.querySelectorAll(".controls input, .controls select").forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFilters();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bind();
  try { await loadMeta(); } catch {}
  try { await loadOrders(); } catch (e) { showErr(e); }
});
