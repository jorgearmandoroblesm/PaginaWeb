function $(sel) { return document.querySelector(sel); }

function setAlert(kind, message, extra = "") {
  const el = $("#err");
  const out = $("#out");
  if (kind === "ok") {
    el.innerHTML = "";
    out.innerHTML = `<div class="alert alert-ok">${escapeHtml(message)}</div>`;
    return;
  }
  out.innerHTML = "";
  const hint = extra ? `<div class="alert-extra">${escapeHtml(extra)}</div>` : "";
  el.innerHTML = `<div class="alert alert-error"><div class="alert-title">${escapeHtml(message)}</div>${hint}</div>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handleError(e) {
  const status = e?.status;
  const msg = String(e?.message || "Error");

  if (status === 401) {
    setAlert("err", "No autorizado: ADMIN_KEY incorrecta.", "Revisa tu clave y que el servidor cargue server/.env. Luego reinicia el servidor.");
    return;
  }
  setAlert("err", msg);
}


async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const raw = await r.text();

  // Intentar JSON si aplica
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}

  if (!r.ok) {
    // Errores bonitos y útiles
    const msg =
      (data && (data.error || data.message)) ||
      (raw && raw.trim()) ||
      `Error ${r.status}`;

    const err = new Error(msg);
    err.status = r.status;
    err.data = data;
    throw err;
  }

  return data ?? {};
}

function fmtBytes(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const units = ["B","KB","MB","GB"];
  let i = 0, v = num;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDateTimeEs(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const pad2 = (n) => String(n).padStart(2, "0");
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  let h = d.getHours();
  const ampm = h >= 12 ? "p.m." : "a.m.";
  h = h % 12;
  if (h === 0) h = 12;

  const hh = pad2(h);
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());

  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaLarga = `${dd} de ${meses[d.getMonth()]} de ${yyyy}`;

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss} ${ampm} (${fechaLarga})`;
}

async function loadInbox() {
  const key = ($("#key").value || "").trim();
  if (!key) throw new Error("Ingresa la clave ADMIN_KEY (está en server/.env)");

  const res = await api("/api/admin/inbox", { headers: { "x-admin-key": key } });
  const files = res.files || [];

  const sel = $("#file");
  if (!files.length) {
    sel.innerHTML = `<option value="">(Sin archivos en server/inbox)</option>`;
    $("#info").style.display = "none";
    return;
  }

  sel.innerHTML = files.map(f => {
    const label = `${f.name} — ${fmtBytes(f.size)} — ${fmtDateTimeEs(f.mtime)}`;
    return `<option value="${f.name}">${label}</option>`;
  }).join("");

  $("#info").style.display = "block";
  $("#info").textContent = `Inbox: ${files.length} archivo(s) detectado(s).`;
}

async function importSelected() {
  const key = ($("#key").value || "").trim();
  if (!key) throw new Error("Ingresa la clave ADMIN_KEY (está en server/.env)");

  const file = $("#file").value;
  if (!file) throw new Error("No hay archivo seleccionado");

  return api(`/api/admin/import-from-folder?file=${encodeURIComponent(file)}`, {
    method: "POST",
    headers: { "x-admin-key": key }
  });
}

async function loadLastImport() {
  try {
    const info = await api("/api/app/info");
    const li = info.last_import;

    $("#li-file").textContent = li?.file || "—";
    $("#li-count").textContent = li?.imported != null ? String(li.imported) : "—";
    $("#li-at").textContent = li?.at ? fmtDateTimeEs(li.at) : "—";
  } catch {
    $("#li-file").textContent = "—";
    $("#li-count").textContent = "—";
    $("#li-at").textContent = "—";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("#out").innerHTML = "";
  $("#err").innerHTML = "";

  $("#reload").addEventListener("click", async () => {
    $("#out").innerHTML = "";
    $("#err").innerHTML = "";
    try { await loadInbox(); }
    catch (e) { handleError(e); }
  });

  $("#btn").addEventListener("click", async () => {
    $("#out").innerHTML = "";
    $("#err").innerHTML = "";
    try {
      const res = await importSelected();
      setAlert("ok", `Importación OK ✅  Registros: ${res.imported}  (Archivo: ${res.file})`);
      await loadLastImport();
      await loadInbox();
    } catch (e) {
      handleError(e);
    }
  });

  await loadLastImport();
});
