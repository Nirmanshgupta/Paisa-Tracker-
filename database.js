/* =========================================================
   database.js – SQLite database for Paisa Tracker
   Uses Node's built-in "node:sqlite" (no npm install needed).
   The database file is created automatically at data/paisa.db
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (err) {
  console.error("\nThis project needs Node.js 22.13 or newer (it uses the built-in SQLite).");
  console.error("You are running Node.js " + process.versions.node + ".");
  console.error("Download the latest LTS version from https://nodejs.org and try again.\n");
  process.exit(1);
}

// Make sure the data folder exists, then open (or create) the database file
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "paisa.db"));

// Create tables the first time the app runs
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id       TEXT PRIMARY KEY,
    type     TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount   REAL NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    date     TEXT NOT NULL,
    note     TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---------- Transactions ----------
function getAllTransactions() {
  return db.prepare("SELECT id, type, amount, category, date, note FROM transactions ORDER BY date DESC").all();
}

function insertTransaction(t) {
  db.prepare(
    "INSERT OR REPLACE INTO transactions (id, type, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(t.id, t.type, t.amount, t.category, t.date, t.note);
}

// Insert many rows at once; if one fails, none are saved
function insertMany(list) {
  db.exec("BEGIN");
  try {
    list.forEach(insertTransaction);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function updateTransaction(id, t) {
  const result = db.prepare(
    "UPDATE transactions SET type = ?, amount = ?, category = ?, date = ?, note = ? WHERE id = ?"
  ).run(t.type, t.amount, t.category, t.date, t.note, id);
  return result.changes > 0;
}

function deleteTransaction(id) {
  return db.prepare("DELETE FROM transactions WHERE id = ?").run(id).changes > 0;
}

function deleteAllTransactions() {
  db.exec("DELETE FROM transactions");
}

// ---------- Budget (stored in the settings table) ----------
function getBudget() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'budget'").get();
  return row ? Number(row.value) : 0;
}

function setBudget(amount) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('budget', ?)").run(String(amount));
}

module.exports = {
  getAllTransactions,
  insertTransaction,
  insertMany,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  getBudget,
  setBudget
};
