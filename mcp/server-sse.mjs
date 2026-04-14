#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import http from "http";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");

const DB_PATH = join(process.cwd(), "bookings.db");
const PORT = parseInt(process.env.MCP_PORT || "3001");

let db = null;
let SQL = null;

async function getDb() {
  // Reload from disk every time to stay in sync with the web app
  if (!SQL) SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    save();
  }
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function toCET(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

function formatBooking(b) {
  return `${b.name}: ${toCET(b.start_time)} → ${toCET(b.end_time)} CET (id: ${b.id})`;
}

// All times are CET (Europe/Paris). We convert to UTC for storage/queries.
// CEST = UTC+2 (late March to late October), CET = UTC+1 (winter)
function getCETOffset(dateStr) {
  // Use JS to figure out the offset for a given date
  const d = new Date(dateStr + 'T12:00:00Z');
  const jan = new Date(d.getFullYear(), 0, 1);
  const jul = new Date(d.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  // For Europe/Paris: CET=+01:00, CEST=+02:00
  // Simple DST check: last Sunday of March to last Sunday of October
  const month = d.getUTCMonth();
  if (month > 2 && month < 9) return '+02:00'; // Apr-Sep: CEST
  if (month === 2) { // March: check if after last Sunday
    const lastSun = 31 - new Date(d.getUTCFullYear(), 2, 31).getUTCDay();
    return d.getUTCDate() >= lastSun ? '+02:00' : '+01:00';
  }
  if (month === 9) { // October: check if before last Sunday
    const lastSun = 31 - new Date(d.getUTCFullYear(), 9, 31).getUTCDay();
    return d.getUTCDate() < lastSun ? '+02:00' : '+01:00';
  }
  return '+01:00'; // Nov-Feb: CET
}

function toISO(input) {
  if (!input) return input;
  const s = input.trim();
  // Extract date part for offset calculation
  const dateMatch = s.match(/\d{4}-\d{2}-\d{2}/);
  const datePart = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
  const offset = getCETOffset(datePart);
  // Strip trailing Z or existing offset — treat the numeric part as CET
  const stripped = s.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  // Just a date
  if (/^\d{4}-\d{2}-\d{2}$/.test(stripped)) return new Date(stripped + 'T00:00:00' + offset).toISOString();
  // ISO-like with T
  if (stripped.includes('T')) return new Date(stripped + offset).toISOString();
  // Date + space + time
  if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(stripped)) return new Date(stripped.replace(' ', 'T') + ':00' + offset).toISOString();
  return s;
}

function createServer() {
  const server = new McpServer({ name: "phone-booth-booking", version: "1.0.0" });

  server.tool("list_bookings", "List bookings and check availability. All times are in CET (Central European Time). Without check_start/check_end, lists bookings for a date range (defaults to next 7 days). With check_start/check_end, also reports whether that specific slot is available.", {
    start_date: z.string().optional().describe("Start of date range. CET. e.g. '2026-04-07' or '2026-04-07T09:00'. Defaults to today."),
    end_date: z.string().optional().describe("End of date range. CET. Defaults to 7 days from start."),
    check_start: z.string().optional().describe("Check availability: slot start time in CET. e.g. '2026-04-07T10:00'"),
    check_end: z.string().optional().describe("Check availability: slot end time in CET. e.g. '2026-04-07T11:00'"),
  }, async ({ start_date, end_date, check_start, check_end }) => {
    await getDb();
    const now = new Date();
    const start = toISO(start_date) || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = toISO(end_date) || new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    check_start = toISO(check_start);
    check_end = toISO(check_end);
    const bookings = query("SELECT * FROM bookings WHERE start_time >= ? AND start_time < ? ORDER BY start_time", [start, end]);

    let text = bookings.length === 0
      ? "No bookings found for this date range."
      : `${bookings.length} booking(s):\n\n${bookings.map(formatBooking).join("\n")}`;

    if (check_start && check_end) {
      const overlaps = query("SELECT * FROM bookings WHERE start_time < ? AND end_time > ?", [check_end, check_start]);
      if (overlaps.length === 0) {
        text += `\n\nAvailability: ${check_start} → ${check_end} is AVAILABLE.`;
      } else {
        text += `\n\nAvailability: ${check_start} → ${check_end} is NOT available. Conflicts:\n${overlaps.map(formatBooking).join("\n")}`;
      }
    }

    return { content: [{ type: "text", text }] };
  });

  server.tool("create_booking", "Create a new phone booth booking. All times in CET. 15-minute increments. Max 4 hours.", {
    name: z.string().describe("Name of the person booking"),
    start_time: z.string().describe("Start time in CET (e.g. '2026-04-07T10:00')"),
    end_time: z.string().describe("End time in CET (e.g. '2026-04-07T11:00')"),
  }, async ({ name, start_time, end_time }) => {
    await getDb();
    start_time = toISO(start_time); end_time = toISO(end_time);
    const duration = new Date(end_time).getTime() - new Date(start_time).getTime();
    if (duration <= 0) return { content: [{ type: "text", text: "Error: end time must be after start time." }] };
    if (duration > 4 * 60 * 60 * 1000) return { content: [{ type: "text", text: "Error: bookings cannot exceed 4 hours." }] };
    const overlaps = query("SELECT * FROM bookings WHERE start_time < ? AND end_time > ?", [end_time, start_time]);
    if (overlaps.length > 0) return { content: [{ type: "text", text: `Cannot book — conflicts with:\n\n${overlaps.map(formatBooking).join("\n")}` }] };
    const id = randomUUID();
    db.run("INSERT INTO bookings (id, name, start_time, end_time) VALUES (?, ?, ?, ?)", [id, name, start_time, end_time]);
    save();
    return { content: [{ type: "text", text: `Booking created!\n\n${name}: ${toCET(start_time)} → ${toCET(end_time)} CET\nID: ${id}` }] };
  });

  server.tool("edit_booking", "Edit an existing booking. All times in CET.", {
    id: z.string().describe("The booking ID to edit"),
    name: z.string().optional().describe("New name (optional)"),
    start_time: z.string().optional().describe("New start time in CET (optional)"),
    end_time: z.string().optional().describe("New end time in CET (optional)"),
  }, async ({ id, name, start_time, end_time }) => {
    await getDb();
    start_time = toISO(start_time); end_time = toISO(end_time);
    const existing = query("SELECT * FROM bookings WHERE id = ?", [id]);
    if (existing.length === 0) return { content: [{ type: "text", text: `Error: no booking found with ID ${id}` }] };
    const newStart = start_time || existing[0].start_time;
    const newEnd = end_time || existing[0].end_time;
    const duration = new Date(newEnd).getTime() - new Date(newStart).getTime();
    if (duration <= 0) return { content: [{ type: "text", text: "Error: end time must be after start time." }] };
    if (duration > 4 * 60 * 60 * 1000) return { content: [{ type: "text", text: "Error: bookings cannot exceed 4 hours." }] };
    if (start_time || end_time) {
      const overlaps = query("SELECT * FROM bookings WHERE id != ? AND start_time < ? AND end_time > ?", [id, newEnd, newStart]);
      if (overlaps.length > 0) return { content: [{ type: "text", text: `Cannot reschedule — conflicts with:\n\n${overlaps.map(formatBooking).join("\n")}` }] };
    }
    const sets = [], values = [];
    if (name !== undefined) { sets.push("name = ?"); values.push(name); }
    if (start_time !== undefined) { sets.push("start_time = ?"); values.push(start_time); }
    if (end_time !== undefined) { sets.push("end_time = ?"); values.push(end_time); }
    if (sets.length === 0) return { content: [{ type: "text", text: "Nothing to update." }] };
    values.push(id);
    db.run(`UPDATE bookings SET ${sets.join(", ")} WHERE id = ?`, values);
    save();
    const updated = query("SELECT * FROM bookings WHERE id = ?", [id]);
    return { content: [{ type: "text", text: `Booking updated!\n\n${formatBooking(updated[0])}` }] };
  });

  server.tool("delete_booking", "Delete a booking by ID.", {
    id: z.string().describe("The booking ID to delete"),
  }, async ({ id }) => {
    await getDb();
    const existing = query("SELECT * FROM bookings WHERE id = ?", [id]);
    if (existing.length === 0) return { content: [{ type: "text", text: `Error: no booking found with ID ${id}` }] };
    db.run("DELETE FROM bookings WHERE id = ?", [id]);
    save();
    return { content: [{ type: "text", text: `Deleted booking: ${formatBooking(existing[0])}` }] };
  });

  return server;
}

// Streamable HTTP — new server+transport per session
const sessions = new Map();

const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/mcp") { res.writeHead(404); res.end("Not found"); return; }

  const sessionId = req.headers["mcp-session-id"];

  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId).transport.handleRequest(req, res);
    return;
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  const server = createServer();
  transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
  await server.connect(transport);
  await transport.handleRequest(req, res);
  if (transport.sessionId) sessions.set(transport.sessionId, { transport, server });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Feyphone MCP HTTP server running on http://0.0.0.0:${PORT}/mcp`);
});
