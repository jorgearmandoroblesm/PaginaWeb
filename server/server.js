import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import xlsx from "xlsx";

import { initDb, replaceOrders, queryOrders, distinctStatuses, getOrderById } from "./db.js";
import { parseOrdersFromExcel } from "./excel.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || "CAMBIAME";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();

const app = express();
const db = initDb();

let lastImport = null;

const inboxDir = path.join(process.cwd(), "inbox");
if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));

if (CORS_ORIGIN) app.use(cors({ origin: CORS_ORIGIN }));
else app.use(cors());

app.use(express.json({ limit: "1mb" }));

// Frontend estático
const webDir = path.resolve(process.cwd(), "../web");
app.use("/", express.static(webDir, { etag: true, maxAge: "1h" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Info pública (sin datos sensibles)
app.get("/api/app/info", (req, res) => {
  res.json({
    ok: true,
    last_import: lastImport,
    server_time: new Date().toISOString()
  });
});

app.get("/api/orders/meta", (req, res) => {
  res.json({ statuses: distinctStatuses(db) });
});

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


app.get("/api/orders/export", (req, res) => {
  try {
    // mismos filtros que /api/orders (sin paginación)
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
      "Tipo": r.order_type,
      "N° Orden": r.order_number,
      "Fecha": r.issue_date,
      "Razón Social": r.supplier,
      "RUC": r.supplier_ruc,
      "Solicitante": r.requester,
      "Oficina": r.area,
      "Concepto (detallado)": r.title,
      "Total": r.amount,
      "Moneda": r.currency,
      "Estado": r.status,
      "Link": r.file_url
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, "ORDENES");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    const stamp = new Date().toISOString().slice(0,10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ordenes_filtrado_${stamp}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(400).json({ error: e.message || "Error exportando" });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = getOrderById(db, id);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

// Abrir/descargar: redirige al link (SCRIPT) del Excel
app.get("/api/orders/:id/open", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT file_url FROM orders WHERE id = ?").get(id);
  if (!row || !row.file_url) return res.status(404).send("Sin enlace");

  const url = row.file_url.trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).send("URL inválida (solo http/https)");
  res.redirect(url);
});


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

// ✅ Admin: importar desde carpeta (NO subir)
app.post("/api/admin/import-from-folder", (req, res) => {
  try {
    const key = (req.headers["x-admin-key"] || "").toString();
    if (key !== ADMIN_KEY) return res.status(401).json({ error: "No autorizado" });

    const requested = (req.query.file || "").toString().trim();
    const file = requested ? { name: requested, full: path.join(inboxDir, requested) } : latestExcelInInbox();
    if (requested && (!fs.existsSync(file.full) || (!requested.toLowerCase().endsWith(".xlsx") && !requested.toLowerCase().endsWith(".xlsm")))) {
      return res.status(400).json({ error: "Archivo inválido en inbox" });
    }
    if (!file) return res.status(400).json({ error: "No hay Excel en server/inbox (xlsx/xlsm)" });

    const rows = parseOrdersFromExcel(file.full);
    replaceOrders(db, rows);
    lastImport = { file: file.name, imported: rows.length, at: new Date().toISOString() };

    res.json({ ok: true, imported: rows.length, file: file.name, at: lastImport.at });
  } catch (e) {
    res.status(400).json({ error: e.message || "Error importando Excel" });
  }
});

// ✅ Para ver desde otras PCs en la red
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  console.log(`Inbox: ${inboxDir}`);
});
