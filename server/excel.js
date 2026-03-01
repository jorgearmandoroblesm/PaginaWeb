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

function extractHttpUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s"'<>\\)]+/i);
  return m ? m[0] : "";
}

function cellText(ws, addr) {
  const cell = ws[addr];
  if (!cell) return "";
  // Prefer hyperlink target if exists
  if (cell.l && cell.l.Target) return String(cell.l.Target).trim();
  // Prefer computed value
  if (cell.v != null && cell.v !== "") return String(cell.v).trim();
  // Formatted text
  if (cell.w != null && cell.w !== "") return String(cell.w).trim();
  return "";
}

// Evaluador ligero para fórmulas típicas:
// - HYPERLINK("url","Ver PDF")
// - HYPERLINK(CONCATENATE("a",B4),"Ver PDF")
// - CONCATENATE("a","b",C4)
// - "a"&B4&"c"
// Nota: si Excel guardó el resultado calculado, usaremos cell.v y no entramos aquí.
function evalFormula(expr, ws) {
  let s = String(expr || "").trim();
  if (!s) return "";
  if (s.startsWith("=")) s = s.slice(1);

  const decodeStr = (t) => {
    const m = t.match(/^"(.*)"$/s);
    return m ? m[1].replace(/""/g, '"') : null;
  };

  const getRef = (t) => {
    const m = t.match(/^\$?([A-Z]{1,3})\$?(\d+)$/i);
    if (!m) return "";
    const addr = `${m[1].toUpperCase()}${m[2]}`;
    return cellText(ws, addr);
  };

  const splitTopLevel = (inside) => {
    const out = [];
    let cur = "";
    let depth = 0;
    let inQ = false;
    for (let i = 0; i < inside.length; i++) {
      const ch = inside[i];
      if (ch === '"' && inside[i - 1] !== "\\") inQ = !inQ;
      if (!inQ) {
        if (ch === "(") depth++;
        if (ch === ")") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) {
          out.push(cur.trim());
          cur = "";
          continue;
        }
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  const evalTerm = (t) => {
    t = String(t || "").trim();
    const lit = decodeStr(t);
    if (lit != null) return lit;
    const ref = getRef(t);
    if (ref) return ref;

    // CONCATENATE(...)
    const cm = t.match(/^CONCATENATE\(([\s\S]*)\)$/i);
    if (cm) {
      const args = splitTopLevel(cm[1]);
      return args.map(evalTerm).join("");
    }

    // si viene algo con & (concatenación)
    if (t.includes("&")) {
      // split por & a nivel simple (sin parser completo)
      const parts = [];
      let cur = "";
      let inQ2 = false;
      let depth2 = 0;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (ch === '"' && t[i - 1] !== "\\") inQ2 = !inQ2;
        if (!inQ2) {
          if (ch === "(") depth2++;
          if (ch === ")") depth2 = Math.max(0, depth2 - 1);
          if (ch === "&" && depth2 === 0) {
            parts.push(cur.trim());
            cur = "";
            continue;
          }
        }
        cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());
      return parts.map(evalTerm).join("");
    }

    // Último intento: extraer URL dentro del término
    return extractHttpUrl(t) || "";
  };

  // HYPERLINK(url, texto)
  const hm = s.match(/^HYPERLINK\(([\s\S]*)\)$/i);
  if (hm) {
    const args = splitTopLevel(hm[1]);
    const urlExpr = args[0] || "";
    const v = evalTerm(urlExpr);
    return v || "";
  }

  // CONCATENATE(...)
  const cm = s.match(/^CONCATENATE\(([\s\S]*)\)$/i);
  if (cm) {
    const args = splitTopLevel(cm[1]);
    return args.map(evalTerm).join("");
  }

  // fallback: intenta extraer http(s)
  return extractHttpUrl(s) || "";
}

export function parseOrdersFromExcel(filePath) {
  const wb = xlsx.readFile(filePath, { cellDates: true, cellText: true });
  const sheetName = wb.SheetNames.find(s => normalize(s).includes("reporte"));
  if (!sheetName) throw new Error('No se encontró hoja "REPORTE"');

  const ws = wb.Sheets[sheetName];
  const HEADER_ROW = 3;      // 1-based
  const DATA_START = 4;      // 1-based

  // Detecta columna “SCRIPT / LINK / ARCHIVO” en la fila de encabezados
  const range = xlsx.utils.decode_range(ws["!ref"]);
  let scriptCol = null;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = xlsx.utils.encode_cell({ c, r: HEADER_ROW - 1 });
    const v = cellText(ws, addr);
    const n = normalize(v);
    if (n.startsWith("script") || n.includes("archivo") || n.includes("link")) {
      scriptCol = c;
      break;
    }
  }

  const data = xlsx.utils.sheet_to_json(ws, { range: 2, defval: "", blankrows: true });

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

    // RUC
    const rucKey = keys.find(k => normalize(k) === "ruc" || normalize(k).includes(" ruc"));
    const supplier_ruc = String(rucKey ? r[rucKey] : getVal("ruc")).trim();

    // Solicitante
    const requesterKey = keys.find(k => normalize(k).includes("solicitante"));
    const requester = String(requesterKey ? r[requesterKey] : getVal("solicitante")).trim();

    // Oficina
    const area = String(getVal("oficina solicitante") || getVal("oficina")).trim();

    // Concepto
    const title = String(getVal("concepto detallado") || getVal("concepto corto")).trim();

    const status = String(getVal("estado")).trim();

    // TOTAL desde “PRECIO X ORDEN”
    const amount =
      toNumber(getVal("precio x orden")) ??
      toNumber(getVal("precio por orden")) ??
      toNumber(getVal("precio x órden")) ??
      toNumber(getVal("precio total")) ??
      toNumber(getVal("total"));
    const currency = parseCurrency(getVal("tipo de moneda") || getVal("moneda"));

    // Archivo/link (desde la columna SCRIPT/LINK/ARCHIVO detectada, preserva hipervínculo)
    let file_url = "";
    if (scriptCol != null) {
      const rowNum = DATA_START + i; // 1-based
      const addr = xlsx.utils.encode_cell({ c: scriptCol, r: rowNum - 1 });
      const cell = ws[addr];
      if (cell) {
        if (cell.l && cell.l.Target) file_url = String(cell.l.Target).trim();
        else if (typeof cell.v === "string" && cell.v.trim() && !cell.v.trim().startsWith("=")) file_url = cell.v.trim();
        else if (cell.v != null && typeof cell.v !== "string") file_url = String(cell.v).trim();
        else if (cell.f) {
          file_url = evalFormula(cell.f, ws).trim();
        } else if (cell.w) {
          const maybe = extractHttpUrl(cell.w) || cell.w;
          file_url = String(maybe || "").trim();
        }
      }
    }

    // Fallback final: si lo leído no es URL, intenta extraer http(s)
    if (file_url && !/^https?:\/\//i.test(file_url)) {
      const found = extractHttpUrl(file_url);
      if (found) file_url = found;
      else if (/^www\./i.test(file_url)) file_url = "https://" + file_url;
    }

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
      source_row: DATA_START + i,
    });
  }

  return rows;
}
