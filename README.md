# Paisa Tracker — Full-Stack Expense Tracker

A lightweight personal finance web app with a responsive HTML/CSS/JavaScript frontend, a Node.js REST API, and a persistent SQLite database. It runs locally and does not require a third-party database or npm runtime dependencies.

## Features

- Create, edit, delete, and undo deletion of income and expense transactions
- Monthly and all-time balance, income, and expense summaries
- Monthly spending budget with progress and over-budget indicators
- Spending-by-category donut chart and six-month income/expense chart
- Search, filter, and sort transactions
- Export transaction data as CSV text
- Light/dark theme
- Sample transactions for trying the UI
- Server-side input validation and SQLite persistence

## Requirements

- **Node.js 22.13 or newer** (uses Node's built-in `node:sqlite` module)
- Git (only needed to clone/push to GitHub)

Check your Node version:

```bash
node --version
```

Download Node.js from <https://nodejs.org/> if needed.

## Run in VS Code

1. Extract this folder, then open **File → Open Folder** in VS Code and choose `paisa-tracker-fullstack`.
2. Open **Terminal → New Terminal**.
3. Start the app:

   ```bash
   npm start
   ```

4. Open <http://localhost:3000> in your browser.
5. Keep the terminal running while using the app. Press `Ctrl+C` to stop it.

The first run creates `data/paisa.db` automatically. Your transactions and budget persist between restarts. The database is intentionally excluded from Git by `.gitignore` so personal financial data is not accidentally committed.

If port 3000 is busy:

- **Windows PowerShell:** `$env:PORT=4000; npm start`
- **macOS/Linux:** `PORT=4000 npm start`

## Project structure

```text
paisa-tracker-fullstack/
├── server.js          # Node HTTP server, REST API, static file serving
├── database.js        # SQLite schema and data-access functions
├── package.json       # Project metadata and scripts
├── .gitignore         # Excludes local database and dependencies
├── public/
│   ├── index.html     # Frontend markup
│   ├── style.css      # Responsive styling and themes
│   └── script.js      # UI behavior and API requests
└── data/              # Created on first run; ignored by Git
    └── paisa.db
```

## REST API

All request and response bodies use JSON.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/transactions` | List transactions |
| `POST` | `/api/transactions` | Create one transaction or a batch (up to 500) |
| `PUT` | `/api/transactions/:id` | Update a transaction |
| `DELETE` | `/api/transactions/:id` | Delete a transaction |
| `DELETE` | `/api/transactions` | Delete all transactions |
| `GET` | `/api/budget` | Read monthly budget |
| `PUT` | `/api/budget` | Save monthly budget, e.g. `{"budget":5000}` |

A transaction has `type` (`income` or `expense`), positive `amount`, `category`, `date` (`YYYY-MM-DD`), and optional `note`. The server creates an ID unless a valid ID is provided (used by the undo feature).

## Connect this project to your GitHub repository

If you already have the GitHub repository, clone it first (or open the existing local clone), copy these project files into that folder, and then commit and push:

```bash
git status
git add .
git commit -m "Build full-stack Paisa Tracker"
git push origin main
```

If Git reports that your branch is not named `main`, check `git branch --show-current` and push that branch instead. If Git reports unrelated histories or rejected updates, do not force-push; fetch/pull and resolve the existing history first.

## Privacy note

This is a local development app, not a production-hardened multi-user service. It has no authentication or user separation. Do not expose it publicly or use it to store sensitive financial information on a shared computer without adding authentication and appropriate security controls. Never commit `data/paisa.db`.
