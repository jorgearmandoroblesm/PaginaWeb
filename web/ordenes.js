// Órdenes: filtros + ordenamiento + paginación + export + detalle (PRO)
(function () {
  const COLS = [
    { key: "exp_siaf", label: "Exp. SIAF", sort: "exp_siaf", minWidth: 90 },
    { key: "order_type", label: "Tipo", sort: "order_type", minWidth: 70 },
    { key: "order_number", label: "N° Orden", sort: "order_number", minWidth: 95 },
    { key: "issue_date", label: "Fecha", sort: "issue_date", minWidth: 105 },
    { key: "supplier", label: "Razón Social", sort: "supplier", minWidth: 260 },
    { key: "area", label: "Oficina", sort: "area", minWidth: 240 },
    { key: "amount", label: "Total", sort: "amount", minWidth: 120, align: "right" },
    { key: "status", label: "Estado", sort: "status", minWidth: 90, align: "center" },
    { key: "file", label: "Archivo", sort: null, minWidth: 110, align: "center" },
  ];

  const state = {
    page: 1,
    limit: 20,
    sort: "issue_date",
    dir: "desc",
  };

  const $ = (sel) => document.querySelector(sel);

  async function apiJSON(path) {
    const r = await fetch(path, { cache: "no-cache" });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt || "Error API");
    return JSON.parse(txt);
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function money(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDateEs(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function setError(msg) {
    const el = $("#error");
    if (!el) return;
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent = msg;
  }

  function getFilters() {
    return {
      exp_siaf: $("#exp_siaf")?.value?.trim() || "",
      order_type: $("#order_type")?.value?.trim() || "",
      order_number: $("#order_number")?.value?.trim() || "",
      supplier: $("#supplier")?.value?.trim() || "",
      status: $("#status")?.value?.trim() || "",
      q: $("#q")?.value?.trim() || "",
      from: $("#from")?.value?.trim() || "",
      to: $("#to")?.value?.trim() || "",
      limit: Number($("#limit")?.value || state.limit),
    };
  }

  function buildQuery() {
    const f = getFilters();
    state.limit = f.limit || state.limit;

    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v !== "" && v != null && k !== "limit") p.set(k, v);
    }
    p.set("page", String(state.page));
    p.set("limit", String(state.limit));
    p.set("sort", state.sort);
    p.set("dir", state.dir);
    return p.toString();
  }

  function renderHead() {
    const tr = $("#theadRow");
    if (!tr) return;
    tr.innerHTML = "";

    for (const c of COLS) {
      const th = document.createElement("th");
      if (c.minWidth) th.style.minWidth = `${c.minWidth}px`;
      if (c.align) th.style.textAlign = c.align;

      const clickable = !!c.sort;
      const isActive = clickable && state.sort === c.sort;
      const arrow = isActive ? (state.dir === "asc" ? "↑" : "↓") : "↕";

      th.innerHTML = `<span class="th-label">${esc(c.label)}</span>${clickable ? `<span class="th-arrow">${arrow}</span>` : ""}`;

      if (clickable) {
        th.classList.add("th-sort");
        th.title = "Ordenar";
        th.addEventListener("click", () => {
          if (state.sort === c.sort) state.dir = state.dir === "asc" ? "desc" : "asc";
          else { state.sort = c.sort; state.dir = "asc"; }
          state.page = 1;
          renderHead();
          load();
        });
      }
      tr.appendChild(th);
    }
  }

  function hasAnyLink(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "—" || s === "-" || s === "0") return false;
    // si viene fórmula o texto, igual intentamos abrir vía /open
    if (/https?:\/\//i.test(s) || /\bwww\./i.test(s)) return true;
    if (/HYPERLINK\(|CONCATENATE\(|&/i.test(s)) return true;
    return s.length >= 6;
  }

  
  function fitTablewrap() {
    const wrap = document.querySelector(".orders-tablewrap");
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pad = 22; // margen inferior visual
    const h = Math.max(260, Math.floor(window.innerHeight - rect.top - pad));
    wrap.style.height = h + "px";
    wrap.style.maxHeight = h + "px";
  }

function renderRows(rows) {
    const tb = $("#tbody");
    if (!tb) return;
    tb.innerHTML = "";

    for (const r of rows) {
      const tr = document.createElement("tr");

      for (const c of COLS) {
        const td = document.createElement("td");
        if (c.align) td.style.textAlign = c.align;

        if (c.key === "issue_date") {
          td.textContent = fmtDateEs(r.issue_date);
        } else if (c.key === "amount") {
          td.textContent = money(r.amount);
        } else if (c.key === "supplier") {
          const name = String(r.supplier ?? "").trim() || "—";
          const ruc = String(r.supplier_ruc ?? "").trim();
          td.innerHTML = `
            <div class="data-stack">
              <div class="data-primary clamp" title="${esc(name)}">${esc(name)}</div>
              <div class="data-secondary clamp" title="${esc(ruc ? `RUC: ${ruc}` : "")}">${esc(ruc ? `RUC: ${ruc}` : "")}</div>
            </div>
          `;
        } else if (c.key === "area") {
          const requester = String(r.requester ?? "").trim();
          const area = String(r.area ?? "").trim() || "—";
          td.innerHTML = `
            <div class="data-stack">
              <div class="data-primary clamp" title="${esc(requester || "")}">${esc(requester || "")}</div>
              <div class="data-secondary clamp" title="${esc(area)}">${esc(area)}</div>
            </div>
          `;
        } else if (c.key === "status") {
          const full = String(r.status ?? "").trim();
          const short = full ? full[0].toUpperCase() : "—";
          td.textContent = short;
          td.classList.add("status-cell");
          td.title = full || "—";
        } else if (c.key === "file") {
          const raw = r.file ?? r.file_url ?? "";
          if (hasAnyLink(raw)) {
            const href = `/api/orders/${encodeURIComponent(r.id)}/open`;
            td.innerHTML = `<a class="pill" href="${esc(href)}" target="_blank" rel="noopener">Ver PDF</a>`;
            const a = td.querySelector("a");
            if (a) a.addEventListener("click", (ev) => ev.stopPropagation());
          } else {
            td.textContent = "—";
          }
        } else {
          const v = r[c.key];
          td.textContent = v == null || v === "" ? "—" : String(v);
        }

        tr.appendChild(td);
      }

      tr.addEventListener("click", async () => {
        try {
          const j = await apiJSON(`/api/orders/${encodeURIComponent(r.id)}`);
          openModal(j);
        } catch (e) {
          setError(String(e?.message || e));
        }
      });

      tb.appendChild(tr);
    }
  }

  function setTotals(sum_amount) {
    const val = Number.isFinite(Number(sum_amount)) ? `S/ ${money(sum_amount)}` : "—";

    const top = $("#suminfo");
    if (top) top.textContent = `Total: ${val === "—" ? "—" : val}`;

    // Sidebar principal (inyectado por layout.js)
    const side = $("#sidebarTotal");
    if (side && val !== "—") side.textContent = val;
  }

  function setPager(total, page, limit) {
    const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
    const infoTop = $("#pageinfoTop");
    if (infoTop) infoTop.textContent = `Página ${page} / ${pages}`;

    const prevTop = $("#prevTop"), nextTop = $("#nextTop");
    const disPrev = page <= 1;
    const disNext = page >= pages;

    if (prevTop) prevTop.disabled = disPrev;
    if (nextTop) nextTop.disabled = disNext;
  }

  function openModal(order) {
    const back = $("#modalBack");
    const body = $("#modalBody");
    if (!back || !body) return;

    const typeCode = String(order.order_type || "").trim().toUpperCase();
    const typeLong =
      typeCode === "O/C" || typeCode === "OC" ? "Orden de Compra" :
      typeCode === "O/S" || typeCode === "OS" ? "Orden de Servicio" :
      (typeCode || "—");

    const status = String(order.status || "—").trim();
    const statusSlug = status
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const exp = order.exp_siaf ?? "—";
    const nro = order.order_number ?? "—";
    const fecha = fmtDateEs(order.issue_date);

    const dateObj = order.issue_date ? new Date(order.issue_date) : null;
    const year = dateObj && !isNaN(dateObj.getTime()) ? String(dateObj.getFullYear()) : "—";

    // formatea el N° a 3 dígitos si es numérico
    const nro3 = (() => {
      const n = String(nro ?? "").trim();
      const num = Number(n);
      if (Number.isFinite(num)) return String(num).padStart(3, "0");
      return n || "—";
    })();

    const supplier = order.supplier ?? "—";
    const ruc = order.supplier_ruc ?? "—";
    const requester = order.requester ?? "—";
    const area = order.area ?? "—";
    const concept = order.title ?? "—";
    const notes = order.notes ?? "—";

    const totalTxt = `S/ ${money(order.amount)}`;

    const hasId = Number.isFinite(Number(order.id));
    const pdfHref = hasId ? `/api/orders/${Number(order.id)}/open` : "";
    const fileBtn = hasId
      ? `<a class="pill pill-strong" href="${esc(pdfHref)}" target="_blank" rel="noopener">Ver PDF</a>`
      : `<span class="pill">—</span>`;

    const copyBtn = (val, label) => {
      const v = (val == null ? "" : String(val)).trim();
      if (!v || v === "—" || v === "-") return "";
      return `<button class="copy-btn" type="button" data-copy="${encodeURIComponent(v)}" title="Copiar ${esc(label)}">⧉ Copiar</button>`;
    };

    const updatedAt = order.updated_at ? new Date(order.updated_at) : null;
    const updatedTxt = updatedAt && !isNaN(updatedAt.getTime())
      ? updatedAt.toLocaleString("es-PE", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:true })
      : "—";

    body.innerHTML = `
      <div class="modal-head">
        <div>
          <h2 class="modal-title">${esc(typeLong.toUpperCase())} N° ${esc(nro3)} - ${esc(year)}</h2>
          <div class="modal-meta">
            <span class="chip">Exp. SIAF: <b>${esc(exp)}</b></span>
            <span class="chip">Tipo: <b>${esc(typeLong)}</b> <span style="color:var(--muted)">(${esc(typeCode || "—")})</span></span>
            <span class="chip">Fecha: <b>${esc(fecha)}</b></span>
            <span class="chip chip-status status-${esc(statusSlug)}">Estado: <b>${esc(status)}</b></span>
            <span class="chip">Total: <b>${esc(totalTxt)}</b></span>
          </div>
        </div>
        <button class="btn btn-ghost" id="closeModalBtn" type="button">Cerrar</button>
      </div>

      <div class="modal-grid">
        <div class="row">
          <div class="kv">
            <div class="kv-head">
              <div class="k">Razón Social</div>
              ${copyBtn(supplier, "Razón Social")}
            </div>
            <div class="v">${esc(supplier)}</div>
            <div class="kv-split"></div>
            <div class="kv-head">
              <div class="k">RUC</div>
              ${copyBtn(ruc, "RUC")}
            </div>
            <div class="v">${esc(ruc)}</div>
          </div>

          <div class="kv">
            <div class="kv-head">
              <div class="k">Solicitante</div>
              ${copyBtn(requester, "Solicitante")}
            </div>
            <div class="v">${esc(requester)}</div>
            <div class="kv-split"></div>
            <div class="kv-head">
              <div class="k">Oficina solicitante</div>
              ${copyBtn(area, "Oficina")}
            </div>
            <div class="v">${esc(area)}</div>
          </div>
        </div>

        <div class="kv">
          <div class="kv-head">
            <div class="k">Concepto (detallado)</div>
            ${copyBtn(concept, "Concepto")}
          </div>
          <div class="v">${esc(concept)}</div>
        </div>

        <div class="kv">
          <div class="kv-head">
            <div class="k">Observaciones</div>
            ${copyBtn(notes, "Observaciones")}
          </div>
          <div class="v">${esc(notes)}</div>
        </div>

        <div class="row">
          <div class="kv">
            <div class="k">Estado</div>
            <div class="v">${esc(status)}</div>
            <div class="kv-split"></div>
            <div class="k">Actualizado</div>
            <div class="v">${esc(updatedTxt)}</div>
          </div>

          <div class="kv">
            <div class="k">Total</div>
            <div class="v big">${esc(totalTxt)}</div>
            <div class="kv-split"></div>
            <div class="k">Archivo</div>
            <div class="v">${fileBtn}</div>
          </div>
        </div>

        <details class="modal-more">
          <summary>Más información</summary>
          <div class="more-grid">
            <div class="kv">
              <div class="k">ID</div>
              <div class="v">${esc(order.id ?? "—")}</div>
            </div>
            <div class="kv">
              <div class="k">Código</div>
              <div class="v">${esc(order.order_code ?? "—")}</div>
            </div>
            <div class="kv">
              <div class="k">Moneda</div>
              <div class="v">${esc(order.currency ?? "—")}</div>
            </div>
            <div class="kv">
              <div class="k">Fila</div>
              <div class="v">${esc(order.source_row ?? "—")}</div>
            </div>
          </div>
        </details>
      </div>
    `;

    // copiar (delegación)
    body.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const raw = btn.getAttribute("data-copy") || "";
        const val = decodeURIComponent(raw);
        try {
          await navigator.clipboard.writeText(val);
          btn.textContent = "✓ Copiado";
          setTimeout(() => (btn.textContent = "⧉ Copiar"), 900);
        } catch {
          // fallback
          window.prompt("Copia:", val);
        }
      });
    });

    back.style.display = "flex";
    $("#closeModalBtn")?.addEventListener("click", closeModal);
    back.addEventListener("click", (ev) => { if (ev.target === back) closeModal(); }, { once: true });
  }

  function closeModal() {
    const back = $("#modalBack");
    if (back) back.style.display = "none";
  }

  async function load() {
    try {
      setError("");
      renderHead();

      const q = buildQuery();
      const j = await apiJSON(`/api/orders?${q}`);

      renderRows(j.rows || []);
      setTotals(j.sum_amount);
      setPager(j.total || 0, j.page || state.page, j.limit || state.limit);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  function hookUI() {
    $("#buscar")?.addEventListener("click", () => { state.page = 1; load(); });

    $("#limpiar")?.addEventListener("click", () => {
      ["#exp_siaf","#order_type","#order_number","#supplier","#status","#q","#from","#to"].forEach(id => {
        const el = $(id); if (el) el.value = "";
      });
      state.page = 1;
      load();
    });

    $("#export")?.addEventListener("click", () => {
      const q = buildQuery();
      window.location.href = `/api/orders/export?${q}`;
    });

    $("#prevTop")?.addEventListener("click", () => { if (state.page > 1) { state.page--; load(); } });
    $("#nextTop")?.addEventListener("click", () => { state.page++; load(); });

    $("#gotoBtnTop")?.addEventListener("click", () => {
      const n = Number($("#gotoTop")?.value || "");
      if (Number.isFinite(n) && n >= 1) { state.page = n; load(); }
    });

    // Enter para buscar
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT")) {
        state.page = 1;
        load();
      }
    });

    // Auto-aplicar con pausa (siempre activo, sin checkbox)
    const debounceApply = (() => {
      let t = null;
      return () => {
        clearTimeout(t);
        t = setTimeout(() => { state.page = 1; load(); }, 450);
      };
    })();

    ["#exp_siaf","#order_type","#order_number","#supplier","#status","#q","#from","#to","#limit"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", debounceApply);
      el.addEventListener("change", debounceApply);
    });
  }

  async function loadMeta() {
    try {
      const j = await apiJSON("/api/orders/meta");
      const sel = $("#status");
      if (sel) {
        sel.innerHTML = `<option value="">Estado (todos)</option>` +
          (j.statuses || []).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
      }
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadMeta();
    hookUI();
    fitTablewrap();
    window.addEventListener("resize", fitTablewrap);
    load();
  });
})();
