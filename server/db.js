import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

function ensureColumn(db, table, colName, colDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(colName)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`);
}

export function initDb() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "app.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exp_siaf TEXT,
      order_type TEXT,
      order_number TEXT,
      order_code TEXT,

      supplier TEXT,
      supplier_ruc TEXT,

      requester TEXT,
      area TEXT,

      title TEXT,

      amount REAL,
      currency TEXT,

      status TEXT,
      issue_date TEXT,
      file_url TEXT,
      notes TEXT,
      source_row INTEGER,
      updated_at TEXT
    );
  `);

  // Migración ligera
  ensureColumn(db, "orders", "exp_siaf", "TEXT");
  ensureColumn(db, "orders", "order_type", "TEXT");
  ensureColumn(db, "orders", "order_number", "TEXT");
  ensureColumn(db, "orders", "supplier_ruc", "TEXT");
  ensureColumn(db, "orders", "requester", "TEXT");
  ensureColumn(db, "orders", "amount", "REAL");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
    CREATE INDEX IF NOT EXISTS idx_orders_issue_date ON orders(issue_date);
    CREATE INDEX IF NOT EXISTS idx_orders_exp_siaf ON orders(exp_siaf);
    CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier);
    CREATE INDEX IF NOT EXISTS idx_orders_supplier_ruc ON orders(supplier_ruc);
    CREATE INDEX IF NOT EXISTS idx_orders_requester ON orders(requester);
  `);

  return db;
}

export function replaceOrders(db, rows) {
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM orders").run();

    const stmt = db.prepare(`
      INSERT INTO orders (
        exp_siaf, order_type, order_number, order_code,
        supplier, supplier_ruc,
        requester, area,
        title,
        amount, currency,
        status, issue_date, file_url, notes, source_row, updated_at
      ) VALUES (
        @exp_siaf, @order_type, @order_number, @order_code,
        @supplier, @supplier_ruc,
        @requester, @area,
        @title,
        @amount, @currency,
        @status, @issue_date, @file_url, @notes, @source_row, @updated_at
      )
    `);

    for (const r of rows) {
      stmt.run({
        exp_siaf: r.exp_siaf ?? "",
        order_type: r.order_type ?? "",
        order_number: r.order_number ?? "",
        order_code: r.order_code ?? "",

        supplier: r.supplier ?? "",
        supplier_ruc: r.supplier_ruc ?? "",

        requester: r.requester ?? "",
        area: r.area ?? "",

        title: r.title ?? "",

        amount: Number.isFinite(r.amount) ? r.amount : null,
        currency: r.currency ?? "PEN",

        status: r.status ?? "",
        issue_date: r.issue_date ?? "",
        file_url: r.file_url ?? "",
        notes: r.notes ?? "",
        source_row: r.source_row ?? null,
        updated_at: now
      });
    }
  });

  tx();
}

export function queryOrders(db, f) {
  const { exp_siaf, order_type, order_number, supplier, q, status, from, to, limit, offset } = f;

  const where = [];
  const params = {};

  if (exp_siaf) { where.push(`exp_siaf LIKE @exp_siaf`); params.exp_siaf = `%${exp_siaf}%`; }
  if (order_type) { where.push(`order_type LIKE @order_type`); params.order_type = `%${order_type}%`; }
  if (order_number) { where.push(`order_number LIKE @order_number`); params.order_number = `%${order_number}%`; }
  if (supplier) { where.push(`supplier LIKE @supplier OR supplier_ruc LIKE @supplier`); params.supplier = `%${supplier}%`; }

  if (q) {
    where.push(`(
      order_code LIKE @q OR
      title LIKE @q OR
      area LIKE @q OR
      requester LIKE @q OR
      supplier LIKE @q OR
      supplier_ruc LIKE @q OR
      exp_siaf LIKE @q OR
      order_type LIKE @q OR
      order_number LIKE @q
    )`);
    params.q = `%${q}%`;
  }

  if (status) { where.push(`status = @status`); params.status = status; }
  if (from) { where.push(`issue_date >= @from`); params.from = from; }
  if (to) { where.push(`issue_date <= @to`); params.to = to; }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const stats = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS sum_amount FROM orders ${whereSql}`).get(params);

  const total = stats.c;
  const sum_amount = stats.sum_amount;

  const rows = db.prepare(`
    SELECT * FROM orders
    ${whereSql}
    ORDER BY (issue_date IS NULL OR issue_date = ''), issue_date DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  return { total, sum_amount, rows };
}

export function distinctStatuses(db) {
  return db.prepare(`
    SELECT DISTINCT status FROM orders
    WHERE status IS NOT NULL AND TRIM(status) <> ''
    ORDER BY status ASC
  `).all().map(r => r.status);
}

export function getOrderById(db, id) {
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
}