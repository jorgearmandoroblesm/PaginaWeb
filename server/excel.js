import xlsx from "xlsx";

function toISODate(val) {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    const d = xlsx.SSF.parse_date_code(val);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(val).trim();
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCurrency(s) {
  const txt = String(s || "").toUpperCase();
  if (txt.includes("PEN") || txt.includes("SOL")) return "PEN";
  if (txt.includes("USD") || txt.includes("DOLAR")) return "USD";
  if (txt.includes("EUR")) return "EUR";
  return "PEN";
}

function toNumber(val) {
  if (val == null || val === "") return null;
  const n = Number(String(val).replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function digitsOnly(s) {
  return String(s ?? "").replace(/[^\d]/g, "");
}

function formatSiaf(val) {
  const d = digitsOnly(val);
  if (!d) return "";
  return d.slice(-5).padStart(5, "0");
}

function formatOrderNumber(val) {
  const raw = String(val ?? "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  if (cleaned.includes(".")) {
    const [a, b] = cleaned.split(".", 2);
    const intPart = (a || "").replace(/[^\d]/g, "");
    const frac = (b || "").replace(/[^\d]/g, "");
    const padded = (intPart || "0").slice(-3).padStart(3, "0");
    return frac ? `${padded}.${frac}` : padded;
  }

  const d = cleaned.replace(/[^\d]/g, "");
  return d.slice(-3).padStart(3, "0");
}

export function parseOrdersFromExcel(filePath) {
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames.find(s => normalize(s).includes("reporte"));
  if (!sheetName) throw new Error('No se encontró hoja "REPORTE"');

  const ws = wb.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(ws, { range: 2, defval: "" });

  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const keys = Object.keys(r);

    const findKey = (needle) => keys.find(k => normalize(k).includes(normalize(needle)));
    const getVal = (name) => {
      const k = findKey(name);
      return k ? r[k] : "";
    };

    const exp_siaf = formatSiaf(getVal("siaf"));
    const order_type = String(getVal("tipo de orden")).trim();

    const order_number_raw =
      getVal("n°orden") || getVal("n° orden") || getVal("norden") || getVal("numero de orden");
    const order_number = formatOrderNumber(order_number_raw);

    const issue_date = toISODate(getVal("fecha"));

    const supplier = String(getVal("razon social")).trim();

    // ✅ RUC (busca “RUC”)
    const rucKey = keys.find(k => normalize(k) === "ruc" || normalize(k).includes(" ruc"));
    const supplier_ruc = String(rucKey ? r[rucKey] : getVal("ruc")).trim();

    // ✅ Solicitante (busca “solicitante”)
    const requesterKey = keys.find(k => normalize(k).includes("solicitante"));
    const requester = String(requesterKey ? r[requesterKey] : getVal("solicitante")).trim();

    // ✅ Oficina
    const area = String(getVal("oficina solicitante") || getVal("oficina")).trim();

    // ✅ Concepto DETALLADO
    const title = String(getVal("concepto detallado") || getVal("concepto corto")).trim();

    const status = String(getVal("estado")).trim();

    // ✅ TOTAL desde “PRECIO X ORDEN”
    const amount =
  		toNumber(getVal("precio x orden")) ??
  		toNumber(getVal("precio por orden")) ??
  		toNumber(getVal("precio x órden")) ??   // por si viene con tilde en el header
  		toNumber(getVal("precio total")) ??     // fallback viejo
  		toNumber(getVal("total"));
    const currency = parseCurrency(getVal("tipo de moneda") || getVal("moneda"));

    const scriptKey = keys.find(k => normalize(k).startsWith("script"));
    const file_url = scriptKey ? String(r[scriptKey] || "").trim() : "";

    const order_code = [
      exp_siaf ? `SIAF-${exp_siaf}` : "",
      order_type || "",
      order_number || ""
    ].filter(Boolean).join(" ").trim();

    if (!exp_siaf && !order_number && !supplier && !title) continue;

    rows.push({
      exp_siaf,
      order_type,
      order_number,
      order_code,
      supplier,
      supplier_ruc,
      requester,
      area,
      title,
      amount,
      currency,
      status,
      issue_date,
      file_url,
      notes: "",
      source_row: i + 3
    });
  }

  return rows;
}