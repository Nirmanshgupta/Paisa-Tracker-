/* =========================================================
   server.js – backend for Paisa Tracker
   - Serves the frontend files from the /public folder
   - Provides a REST API under /api/... backed by SQLite
   No npm packages needed, only Node.js 22.13 or newer.
   ========================================================= */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./database");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// ---------- Small helpers ----------
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = "";
    req.on("data", function (chunk) {
      raw += chunk;
      if (raw.length > 1000000) { reject(new Error("Request is too large")); req.destroy(); }
    });
    req.on("end", function () {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

// Check one transaction coming from the browser and return a clean copy.
// Returns { error: "..." } if something is wrong.
function cleanTransaction(body) {
  if (!body || typeof body !== "object") return { error: "Invalid data" };

  const type = body.type;
  if (type !== "income" && type !== "expense") return { error: "Type must be income or expense" };

  const amount = Number(body.amount);
  if (!(amount > 0) || amount > 1000000000) return { error: "Amount must be greater than 0" };

  const category = String(body.category || "").trim();
  if (!category || category.length > 40) return { error: "Category is required" };

  const date = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date must look like 2026-10-14" };

  const note = String(body.note || "").trim().slice(0, 80);

  // Keep the id if the browser sent a safe one (used by "Undo"), else make a new one
  const id = /^[\w-]{1,40}$/.test(String(body.id || "")) ? String(body.id) : crypto.randomUUID();

  return { value: { id: id, type: type, amount: Math.round(amount * 100) / 100, category: category, date: date, note: note } };
}

// ---------- API routes ----------
async function handleApi(req, res, pathname) {
  const method = req.method;

  // /api/transactions
  if (pathname === "/api/transactions") {
    if (method === "GET") {
      return sendJson(res, 200, db.getAllTransactions());
    }
    if (method === "POST") {
      const body = await readBody(req);
      const items = Array.isArray(body) ? body : [body];   // one item or a list
      if (items.length === 0 || items.length > 500) return sendJson(res, 400, { error: "Send between 1 and 500 transactions" });

      const cleaned = [];
      for (const item of items) {
        const result = cleanTransaction(item);
        if (result.error) return sendJson(res, 400, { error: result.error });
        cleaned.push(result.value);
      }
      db.insertMany(cleaned);
      return sendJson(res, 201, Array.isArray(body) ? cleaned : cleaned[0]);
    }
    if (method === "DELETE") {
      db.deleteAllTransactions();
      return sendJson(res, 200, { deleted: true });
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  // /api/transactions/:id
  const match = pathname.match(/^\/api\/transactions\/([\w-]{1,40})$/);
  if (match) {
    const id = match[1];
    if (method === "PUT") {
      const result = cleanTransaction(await readBody(req));
      if (result.error) return sendJson(res, 400, { error: result.error });
      const t = result.value;
      if (!db.updateTransaction(id, t)) return sendJson(res, 404, { error: "Transaction not found" });
      t.id = id;
      return sendJson(res, 200, t);
    }
    if (method === "DELETE") {
      if (!db.deleteTransaction(id)) return sendJson(res, 404, { error: "Transaction not found" });
      return sendJson(res, 200, { deleted: true });
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  // /api/budget
  if (pathname === "/api/budget") {
    if (method === "GET") {
      return sendJson(res, 200, { budget: db.getBudget() });
    }
    if (method === "PUT") {
      const body = await readBody(req);
      const amount = Number(body.budget);
      if (!(amount >= 0) || amount > 1000000000) return sendJson(res, 400, { error: "Budget must be 0 or more" });
      db.setBudget(amount);
      return sendJson(res, 200, { budget: amount });
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  sendJson(res, 404, { error: "Not found" });
}

// ---------- Static files (the frontend) ----------
function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405); return res.end("Method not allowed");
  }
  let requested;
  try { requested = decodeURIComponent(pathname); }
  catch (e) { res.writeHead(400); return res.end("Bad request"); }

  if (requested === "/") requested = "/index.html";

  // Block attempts like /../server.js
  const filePath = path.join(PUBLIC_DIR, requested);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end("Forbidden");
  }

  fs.readFile(filePath, function (err, content) {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Page not found"); }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

// ---------- Start the server ----------
const server = http.createServer(async function (req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  try {
    if (pathname.startsWith("/api/")) await handleApi(req, res, pathname);
    else serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    const status = err.message === "Invalid JSON" || err.message === "Request is too large" ? 400 : 500;
    sendJson(res, status, { error: status === 400 ? err.message : "Server error" });
  }
});

server.listen(PORT, function () {
  console.log("Paisa Tracker is running at http://localhost:" + PORT);
  console.log("Press Ctrl+C to stop.");
});
