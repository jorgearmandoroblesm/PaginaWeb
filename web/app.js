async function api(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error("Error API");
  return r.json();
}

function safeText(id, val) {
  const el = document.querySelector(id);
  if (el) el.textContent = val;
}

function fmtDateTimeEs(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const pad2 = (n) => String(n).padStart(2, "0");
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  // Hora 12h con a.m./p.m.
  let h = d.getHours();
  const ampm = h >= 12 ? "p.m." : "a.m.";
  h = h % 12;
  if (h === 0) h = 12;

  const hh = pad2(h);
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());

  // Fecha larga: "27 de Febrero del 2026"
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const mes = meses[d.getMonth()];
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);

  const fechaLarga = `${Number(dd)} de ${mesCap} del ${yyyy}`;
  const fechaCorta = `${dd}/${mm}/${yyyy}`;
  const hora = `${hh}:${mi}:${ss} ${ampm}`;

  // Formato final pedido:
  // "27 de Febrero del 2026 - 27/02/2026 - 03:37:44 a.m."
  return `${fechaLarga} - ${hora}`;
}

async function loadHome() {
  try {
    const [meta, orders, info] = await Promise.all([
      api("/api/orders/meta"),
      api("/api/orders?limit=1&page=1"),
      api("/api/app/info")
    ]);

    safeText("#kpi-status", String(meta.statuses?.length ?? "—"));
    safeText("#kpi-total", String(orders.total ?? "—"));

    safeText("#serverTime", fmtDateTimeEs(info.server_time));

    const li = info.last_import;
    safeText("#li-file", li?.file || "—");
    safeText("#li-count", li?.imported != null ? String(li.imported) : "—");
    safeText("#li-at", li?.at ? fmtDateTimeEs(li.at) : "—");
  } catch {
    safeText("#kpi-status", "—");
    safeText("#kpi-total", "—");
    safeText("#serverTime", "—");
    safeText("#li-file", "—");
    safeText("#li-count", "—");
    safeText("#li-at", "—");
  }
}

document.addEventListener("DOMContentLoaded", loadHome);
