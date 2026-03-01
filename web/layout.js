(function () {
  // Evita doble ejecución si por error layout.js se carga 2 veces
  if (window.__layoutBooted) return;
  window.__layoutBooted = true;

  const KEY = "sidebar_collapsed";
  const FILTERS_KEY = "filters_collapsed";

  function setCollapsed(c) {
    document.documentElement.classList.toggle("sidebar-collapsed", c);
    localStorage.setItem(KEY, c ? "1" : "0");
  }

  function setFiltersCollapsed(c) {
    document.documentElement.classList.toggle("filters-collapsed", c);
    localStorage.setItem(FILTERS_KEY, c ? "1" : "0");
  }

  function ensureSidebarMetrics() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return null;

    // Si ya existe el footer manual, NO inyectes otro (evita duplicados)
    const legacy = sidebar.querySelector(".sidebar-footer");
    if (legacy) {
      if (!legacy.querySelector("#sidebarTime")) {
        const strong = document.createElement("strong");
        strong.id = "sidebarTime";
        strong.textContent = "—";
        legacy.appendChild(strong);
      }
      if (!legacy.querySelector("#sidebarTotal")) {
        const strong = document.createElement("strong");
        strong.id = "sidebarTotal";
        strong.textContent = "—";
        legacy.appendChild(strong);
      }
      return legacy;
    }

    // Si ya existe el bloque inyectado, reutilízalo
    let box = sidebar.querySelector(".sidebar-metrics");
    if (box) return box;

    // Inyecta el bloque único (IDs consistentes)
    box = document.createElement("div");
    box.className = "sidebar-metrics";
    box.innerHTML = `
      <div class="metric-card">
        <div class="metric-k">Fecha/Hora</div>
        <div class="metric-v" id="sidebarTime">—</div>
      </div>
      <div class="metric-card">
        <div class="metric-k">Monto total</div>
        <div class="metric-v" id="sidebarTotal">—</div>
      </div>
    `;
    sidebar.appendChild(box);
    return box;
  }

  function fmtDateTimeEs(d) {
    try {
      return d.toLocaleString("es-PE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } catch {
      return "—";
    }
  }

  function money(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setTableStickyOffset() {
    const topbar = document.querySelector(".topbar");
    const h = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--table-sticky-top", `${Math.max(0, h)}px`);
  }

  async function bootSidebarClockAndTotals() {
    ensureSidebarMetrics();

    let offsetMs = 0;

    const tick = () => {
      const el = document.querySelector("#sidebarTime");
      if (el) el.textContent = fmtDateTimeEs(new Date(Date.now() + offsetMs));

      const top = document.querySelector("#serverTime");
      if (top) top.textContent = fmtDateTimeEs(new Date(Date.now() + offsetMs));
    };

    const refresh = async () => {
      try {
        const r = await fetch("/api/app/info", { cache: "no-cache" });
        const j = await r.json();

        const serverTime = j?.server_time ? new Date(j.server_time).getTime() : NaN;
        if (Number.isFinite(serverTime)) offsetMs = serverTime - Date.now();

        const totalEl = document.querySelector("#sidebarTotal");
        if (totalEl && j?.total_amount != null) {
          totalEl.textContent = `S/ ${money(j.total_amount)}`;
        }
      } catch {
        offsetMs = 0;
      }
    };

    await refresh();
    tick();
    setInterval(tick, 1000);
    setInterval(refresh, 60000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setCollapsed(localStorage.getItem(KEY) === "1");
    setFiltersCollapsed(localStorage.getItem(FILTERS_KEY) === "1");

    const btn = document.querySelector("[data-sidebar-toggle]");
    if (btn) btn.addEventListener("click", () => {
      setCollapsed(!document.documentElement.classList.contains("sidebar-collapsed"));
    });

    const toggleFilters = () =>
      setFiltersCollapsed(!document.documentElement.classList.contains("filters-collapsed"));

    const fbtn = document.querySelector("[data-filters-toggle]");
    const fbtn2 = document.querySelector("#filtersToggle");
    if (fbtn) fbtn.addEventListener("click", toggleFilters);
    if (fbtn2) fbtn2.addEventListener("click", toggleFilters);

    const logoEl = document.querySelector(".logo");
    if (logoEl && !logoEl.querySelector("img")) {
      const img = document.createElement("img");
      img.src = "assets/logo.png";
      img.alt = "Logo";
      img.onerror = () => { logoEl.textContent = "✓"; };
      logoEl.appendChild(img);
    }

    setTableStickyOffset();
    window.addEventListener("resize", setTableStickyOffset);

    bootSidebarClockAndTotals();
  });
})();
