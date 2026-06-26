// Storage layer. The whole app state lives in one in-memory object; every
// handler reads/writes it synchronously (unchanged from the original design).
// We just persist that object to durable storage:
//   - PostgreSQL when DATABASE_URL is set (production / Render) — survives redeploys
//   - a local JSON file otherwise (dev) — zero setup
//
// On the free single-instance plan, keeping state in memory + saving the whole
// blob is simple and correct. (For multi-instance scale you'd move to per-row
// SQL, but that isn't needed here.)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT = { users: [], conversations: [], messages: [] };

// The shared in-memory state. Handlers import this and mutate it directly.
const db = { ...DEFAULT };

let pool = null;
let usePg = false;

async function loadFromPg() {
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Managed Postgres (Render/Neon/etc.) requires SSL.
    ssl: { rejectUnauthorized: false },
  });
  await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSONB NOT NULL)');
  const res = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (res.rows.length) {
    Object.assign(db, DEFAULT, res.rows[0].data);
  } else {
    await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(DEFAULT)]);
    Object.assign(db, DEFAULT);
  }
}

function loadFromFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT, null, 2));
  Object.assign(db, DEFAULT, JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')));
}

// Must be awaited before the server starts handling requests.
export async function initDb() {
  if (process.env.DATABASE_URL) {
    try {
      await loadFromPg();
      usePg = true;
      console.log('  Storage: PostgreSQL (persistent)');
      return;
    } catch (e) {
      console.error('  Postgres init failed, falling back to local file:', e.message);
    }
  }
  loadFromFile();
  console.log('  Storage: local JSON file');
}

function persist() {
  if (usePg && pool) {
    pool
      .query('UPDATE app_state SET data = $1 WHERE id = 1', [JSON.stringify(db)])
      .catch((e) => console.error('  DB save failed:', e.message));
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

let saveTimer = null;
export function save() {
  // Debounce so a burst of messages coalesces into one write.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 300);
}

export function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  persist();
}

export default db;
