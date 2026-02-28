import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { fileURLToPath } from "url";

import {
  initDb,
  replaceOrders,
  queryOrders,
  distinctStatuses,
  getOrderById
} from "./db.js";
import { parseOrdersFromExcel } from "./excel.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = initDb();

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "CAMBIAME";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();

let lastImport = null;

// Inbox dentro de /server/inbox
const inboxDir = path.join(__dirname, "inbox");
if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(CORS_ORIGIN ? cors({ origin: CORS_ORIGIN }) : cors());
app.use(express.json({ limit: "2mb" }));

/**
 * ✅ FRONTEND estático desde la RAÍZ del repo (ya no /web)
 * Estructura esperada en la raíz:
 * /assets
 * /config
 * index.html, ordenes.html, recursos.html, admin.html, *.js, styles.css
 * /server (este backend)
 */
const publicDir = path.resolve(__dirname, ".."); // raíz del repo
app.use(express.static(publicDir, { etag: true, maxAge: "1h", index: false }));

// ✅ "/" siempre devuelve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Info pública
app.get("/api/app/info", (req, res) => {
  res.json({
    ok: true,
    last_import: lastImport,
    server_time: new Date().toISOString()
  });
});

// Meta
app.get("/api/orders/meta", (req, res) => {
  res.json({ statuses: distinctStatuses(db) });
});

// Listado
app.get("/api/orders", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const status = (req.query.status || "").toString().trim();
  const from = (req.query.from || "").toString().trim();
  const to = (req.query.to || "").toString().trim();

  const exp_siaf = (req.query.exp_siaf || "").toString().trim();
  const order_type = (req.query.order_type || "").toString().trim();
  const order_number = (req.query.order_number || "").toString().trim();
  const supplier = (req.query.supplier || "").toString().trim();

  const limit = Math.min(200, Math.max(5, Number(req.query.limit || 20)));
  const page = Math.max(1, Number(req.query.page || 1));
  const offset = (page - 1) * limit;

  const result = queryOrders(db, {
    q, status, from, to,
    exp_siaf, order_type, order_number, supplier,
    limit, offset
  });

  res.json({ ...result, page, limit });
});

// Export
app.get("/api/orders/export", (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const status = (req.query.status || "").toString().trim();
    const from = (req.query.from || "").toString().trim();
    const to = (req.query.to || "").toString().trim();

    const exp_siaf = (req.query.exp_siaf || "").toString().trim();
    const order_type = (req.query.order_type || "").toString().trim();
    const order_number = (req.query.order_number || "").toString().trim();
    const supplier = (req.query.supplier || "").toString().trim();

    const result = queryOrders(db, {
      q, status, from, to,
      exp_siaf, order_type, order_number, supplier,
      limit: 20000,
      offset: 0
    });

    const rows = result.rows.map(r => ({
      "EXP SIAF": r.exp_siaf,
      "TIPO": r.order_type,
      "N° ORDEN": r.order_number,
      "FECHA": r.issue_date,
      "RAZÓN SOCIAL": r.supplier,
      "RUC": r.supplier_ruc,
      "SOLICITANTE": r.requester,
      "OFICINA": r.area,
      "CONCEPTO (DETALLADO)": r.title,
      "TOTAL": r.amount,
      "MONEDA": r.currency,
      "ESTADO": r.status,
      "LINK": r.file_url
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, "ORDENES");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ordenes_filtrado_${stamp}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(400).json({ error: e.message || "Error exportando" });
  }
});

// Detalle
app.get("/api/orders/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = getOrderById(db, id);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

// Abrir link
app.get("/api/orders/:id/open", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT file_url FROM orders WHERE id = ?").get(id);
  if (!row || !row.file_url) return res.status(404).send("Sin enlace");

  const url = row.file_url.trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).send("URL inválida (solo http/https)");
  res.redirect(url);
});

// Admin: inbox lista
app.get("/api/admin/inbox", (req, res) => {
  const key = (req.headers["x-admin-key"] || "").toString();
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "No autorizado" });

  const files = fs.readdirSync(inboxDir)
    .filter(f => f.toLowerCase().endsWith(".xlsx") || f.toLowerCase().endsWith(".xlsm"))
    .map(f => {
      const st = fs.statSync(path.join(inboxDir, f));
      return { name: f, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));

  res.json({ files });
});

function latestExcelInInbox() {
  const files = fs.readdirSync(inboxDir)
    .filter(f => f.toLowerCase().endsWith(".xlsx") || f.toLowerCase().endsWith(".xlsm"))
    .map(f => ({
      name: f,
      full: path.join(inboxDir, f),
      mtime: fs.statSync(path.join(inboxDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files[0] || null;
}

// Admin: importar desde carpeta inbox
app.post("/api/admin/import-from-folder", (req, res) => {
  try {
    const key = (req.headers["x-admin-key"] || "").toString();
    if (key !== ADMIN_KEY) return res.status(401).json({ error: "No autorizado" });

    const requested = (req.query.file || "").toString().trim();
    const file = requested
      ? { name: requested, full: path.join(inboxDir, requested) }
      : latestExcelInInbox();

    if (requested) {
      const okExt = requested.toLowerCase().endsWith(".xlsx") || requested.toLowerCase().endsWith(".xlsm");
      if (!okExt || !fs.existsSync(file.full)) return res.status(400).json({ error: "Archivo inválido en inbox" });
    }
    if (!file) return res.status(400).json({ error: "No hay Excel en server/inbox" });

    const rows = parseOrdersFromExcel(file.full);
    replaceOrders(db, rows);
    lastImport = { file: file.name, imported: rows.length, at: new Date().toISOString() };

    res.json({ ok: true, imported: rows.length, file: file.name, at: lastImport.at });
  } catch (e) {
    res.status(400).json({ error: e.message || "Error importando Excel" });
  }
});

// ✅ ÚNICO listen (Render)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor listo en puerto ${PORT}`);
  console.log(`Sirviendo frontend desde: ${publicDir}`);
  console.log(`Inbox: ${inboxDir}`);
});
