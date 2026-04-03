#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js/dist/sql-asm.js");

// DB path — same file as the web app
const DB_PATH = join(process.cwd(), "bookings.db");

let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
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

function formatBooking(b) {
  return `${b.name}: ${b.start_time} → ${b.end_time} (id: ${b.id})`;
}

// --- MCP Server ---

const server = new McpServer({
  name: "phone-booth-booking",
  version: "1.0.0",
});

// List bookings
server.tool(
  "list_bookings",
  "List all bookings for a date range. If no dates given, shows the next 7 days.",
  {
    start_date: z.string().optional().describe("Start date in ISO format (e.g. 2026-04-03T00:00:00.000Z). Defaults to today."),
    end_date: z.string().optional().describe("End date in ISO format. Defaults to 7 days from start."),
  },
  async ({ start_date, end_date }) => {
    await getDb();
    const now = new Date();
    const start = start_date || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = end_date || new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const bookings = query(
      "SELECT * FROM bookings WHERE start_time >= ? AND start_time < ? ORDER BY start_time",
      [start, end]
    );

    if (bookings.length === 0) {
      return { content: [{ type: "text", text: "No bookings found for this date range." }] };
    }

    const text = bookings.map(formatBooking).join("\n");
    return { content: [{ type: "text", text: `${bookings.length} booking(s):\n\n${text}` }] };
  }
);

// Check availability
server.tool(
  "check_availability",
  "Check if a specific time slot is available for booking.",
  {
    start_time: z.string().describe("Start time in ISO format (e.g. 2026-04-03T10:00:00.000Z)"),
    end_time: z.string().describe("End time in ISO format"),
  },
  async ({ start_time, end_time }) => {
    await getDb();
    const overlaps = query(
      "SELECT * FROM bookings WHERE start_time < ? AND end_time > ?",
      [end_time, start_time]
    );

    if (overlaps.length === 0) {
      return { content: [{ type: "text", text: `The slot ${start_time} → ${end_time} is available.` }] };
    }

    const conflicts = overlaps.map(formatBooking).join("\n");
    return { content: [{ type: "text", text: `The slot is NOT available. Conflicts:\n\n${conflicts}` }] };
  }
);

// Create booking
server.tool(
  "create_booking",
  "Create a new phone booth booking. Times must be in 15-minute increments. Max duration is 4 hours.",
  {
    name: z.string().describe("Name of the person booking"),
    start_time: z.string().describe("Start time in ISO format (e.g. 2026-04-03T10:00:00.000Z)"),
    end_time: z.string().describe("End time in ISO format"),
  },
  async ({ name, start_time, end_time }) => {
    await getDb();

    // Validate duration
    const duration = new Date(end_time).getTime() - new Date(start_time).getTime();
    if (duration <= 0) {
      return { content: [{ type: "text", text: "Error: end time must be after start time." }] };
    }
    if (duration > 4 * 60 * 60 * 1000) {
      return { content: [{ type: "text", text: "Error: bookings cannot exceed 4 hours." }] };
    }

    // Check overlap
    const overlaps = query(
      "SELECT * FROM bookings WHERE start_time < ? AND end_time > ?",
      [end_time, start_time]
    );
    if (overlaps.length > 0) {
      const conflicts = overlaps.map(formatBooking).join("\n");
      return { content: [{ type: "text", text: `Cannot book — conflicts with:\n\n${conflicts}` }] };
    }

    const id = randomUUID();
    db.run(
      "INSERT INTO bookings (id, name, start_time, end_time) VALUES (?, ?, ?, ?)",
      [id, name, start_time, end_time]
    );
    save();

    return { content: [{ type: "text", text: `Booking created!\n\n${name}: ${start_time} → ${end_time}\nID: ${id}` }] };
  }
);

// Edit booking
server.tool(
  "edit_booking",
  "Edit an existing booking. You can change the name, start time, end time, or all of them.",
  {
    id: z.string().describe("The booking ID to edit"),
    name: z.string().optional().describe("New name (optional)"),
    start_time: z.string().optional().describe("New start time in ISO format (optional)"),
    end_time: z.string().optional().describe("New end time in ISO format (optional)"),
  },
  async ({ id, name, start_time, end_time }) => {
    await getDb();

    // Check booking exists
    const existing = query("SELECT * FROM bookings WHERE id = ?", [id]);
    if (existing.length === 0) {
      return { content: [{ type: "text", text: `Error: no booking found with ID ${id}` }] };
    }

    const newStart = start_time || existing[0].start_time;
    const newEnd = end_time || existing[0].end_time;

    // Validate duration
    const duration = new Date(newEnd).getTime() - new Date(newStart).getTime();
    if (duration <= 0) {
      return { content: [{ type: "text", text: "Error: end time must be after start time." }] };
    }
    if (duration > 4 * 60 * 60 * 1000) {
      return { content: [{ type: "text", text: "Error: bookings cannot exceed 4 hours." }] };
    }

    // Check overlap (excluding self)
    if (start_time || end_time) {
      const overlaps = query(
        "SELECT * FROM bookings WHERE id != ? AND start_time < ? AND end_time > ?",
        [id, newEnd, newStart]
      );
      if (overlaps.length > 0) {
        const conflicts = overlaps.map(formatBooking).join("\n");
        return { content: [{ type: "text", text: `Cannot reschedule — conflicts with:\n\n${conflicts}` }] };
      }
    }

    const sets = [];
    const values = [];
    if (name !== undefined) { sets.push("name = ?"); values.push(name); }
    if (start_time !== undefined) { sets.push("start_time = ?"); values.push(start_time); }
    if (end_time !== undefined) { sets.push("end_time = ?"); values.push(end_time); }

    if (sets.length === 0) {
      return { content: [{ type: "text", text: "Nothing to update — no fields provided." }] };
    }

    values.push(id);
    db.run(`UPDATE bookings SET ${sets.join(", ")} WHERE id = ?`, values);
    save();

    const updated = query("SELECT * FROM bookings WHERE id = ?", [id]);
    return { content: [{ type: "text", text: `Booking updated!\n\n${formatBooking(updated[0])}` }] };
  }
);

// Delete booking
server.tool(
  "delete_booking",
  "Delete a booking by ID.",
  {
    id: z.string().describe("The booking ID to delete"),
  },
  async ({ id }) => {
    await getDb();

    const existing = query("SELECT * FROM bookings WHERE id = ?", [id]);
    if (existing.length === 0) {
      return { content: [{ type: "text", text: `Error: no booking found with ID ${id}` }] };
    }

    db.run("DELETE FROM bookings WHERE id = ?", [id]);
    save();

    return { content: [{ type: "text", text: `Deleted booking: ${formatBooking(existing[0])}` }] };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
