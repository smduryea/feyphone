/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const initSqlJs = require("sql.js/dist/sql-asm.js");
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "bookings.db");

let db: any = null;
let SQL: any = null;

async function getDb() {
  // Reload from disk every time to stay in sync with MCP server
  if (!SQL) SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    save();
  }
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export async function getBookings(weekStart: string, weekEnd: string) {
  const db = await getDb();
  const stmt = db.prepare(
    "SELECT * FROM bookings WHERE start_time >= ? AND start_time < ? ORDER BY start_time"
  );
  stmt.bind([weekStart, weekEnd]);
  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export async function createBooking(id: string, name: string, start_time: string, end_time: string) {
  const db = await getDb();

  const overlap = db.prepare(
    "SELECT id FROM bookings WHERE start_time < ? AND end_time > ? LIMIT 1"
  );
  overlap.bind([end_time, start_time]);
  const hasOverlap = overlap.step();
  overlap.free();

  if (hasOverlap) {
    throw new Error("OVERLAP");
  }

  db.run(
    "INSERT INTO bookings (id, name, start_time, end_time) VALUES (?, ?, ?, ?)",
    [id, name, start_time, end_time]
  );
  save();

  const stmt = db.prepare("SELECT * FROM bookings WHERE id = ?");
  stmt.bind([id]);
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result;
}

export async function deleteBooking(id: string) {
  const db = await getDb();
  db.run("DELETE FROM bookings WHERE id = ?", [id]);
  save();
}

export async function updateBooking(id: string, fields: { name?: string; start_time?: string; end_time?: string }) {
  const db = await getDb();

  if (fields.start_time && fields.end_time) {
    const overlap = db.prepare(
      "SELECT id FROM bookings WHERE id != ? AND start_time < ? AND end_time > ? LIMIT 1"
    );
    overlap.bind([id, fields.end_time, fields.start_time]);
    const hasOverlap = overlap.step();
    overlap.free();

    if (hasOverlap) {
      throw new Error("OVERLAP");
    }
  }

  const sets: string[] = [];
  const values: string[] = [];

  if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name); }
  if (fields.start_time !== undefined) { sets.push("start_time = ?"); values.push(fields.start_time); }
  if (fields.end_time !== undefined) { sets.push("end_time = ?"); values.push(fields.end_time); }

  if (sets.length === 0) return;

  values.push(id);
  db.run(`UPDATE bookings SET ${sets.join(", ")} WHERE id = ?`, values);
  save();
}
