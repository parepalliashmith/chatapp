// Tiny zero-dependency JSON file "database".
// Holds users, conversations and messages. Synchronous reads/writes are fine
// for a demo-scale app and avoid any native build steps on Windows.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR can point at a persistent disk in production (e.g. Render mount).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT = { users: [], conversations: [], messages: [] };

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT, null, 2));
}

ensure();

let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
// Make sure all collections exist even if the file is older.
db = { ...DEFAULT, ...db };

let saveTimer = null;
export function save() {
  // Debounce writes so a burst of messages doesn't hammer the disk.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 50);
}

export function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export default db;
