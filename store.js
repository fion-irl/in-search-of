// Persistence layer.
// - If DATABASE_URL is set (Replit's built-in Postgres, Neon, Supabase…), hunts live in Postgres.
// - Otherwise, a JSON file in ./data is used (fine for local dev; NOT durable on Replit deployments,
//   whose filesystem resets on redeploy — so always add a database before going live).
//
// Hunts are stored as JSON documents (matches embedded). Volume is low (a human reviews every
// match), so simplicity beats normalisation here. Images live in their own table/dir so list
// queries stay small.

const fs = require('fs');
const path = require('path');

function createFileStore(dir) {
  const dbFile = path.join(dir, 'db.json');
  const imgDir = path.join(dir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  let db = { hunts: {} };
  if (fs.existsSync(dbFile)) db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

  function flush() {
    const tmp = dbFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dbFile);
  }

  return {
    kind: 'file',
    async init() {},
    async listHunts() {
      return Object.values(db.hunts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getHunt(id) {
      return db.hunts[id] ? structuredClone(db.hunts[id]) : null;
    },
    async getHuntByToken(token) {
      const h = Object.values(db.hunts).find((x) => x.token === token);
      return h ? structuredClone(h) : null;
    },
    async saveHunt(hunt) {
      db.hunts[hunt.id] = structuredClone(hunt);
      flush();
      return hunt;
    },
    async saveImage(key, mime, buf) {
      fs.writeFileSync(path.join(imgDir, key), buf);
      fs.writeFileSync(path.join(imgDir, key + '.mime'), mime);
    },
    async getImage(key) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
      const p = path.join(imgDir, key);
      if (!fs.existsSync(p)) return null;
      return { mime: fs.readFileSync(p + '.mime', 'utf8'), data: fs.readFileSync(p) };
    },
  };
}

function createPgStore(url) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    max: 5,
  });

  return {
    kind: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS hunts (
          id TEXT PRIMARY KEY,
          token TEXT UNIQUE NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS images (
          key TEXT PRIMARY KEY,
          mime TEXT NOT NULL,
          data BYTEA NOT NULL
        );
      `);
    },
    async listHunts() {
      const r = await pool.query('SELECT data FROM hunts ORDER BY created_at DESC');
      return r.rows.map((x) => x.data);
    },
    async getHunt(id) {
      const r = await pool.query('SELECT data FROM hunts WHERE id = $1', [id]);
      return r.rows[0]?.data || null;
    },
    async getHuntByToken(token) {
      const r = await pool.query('SELECT data FROM hunts WHERE token = $1', [token]);
      return r.rows[0]?.data || null;
    },
    async saveHunt(hunt) {
      await pool.query(
        `INSERT INTO hunts (id, token, data, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [hunt.id, hunt.token, hunt, hunt.createdAt]
      );
      return hunt;
    },
    async saveImage(key, mime, buf) {
      await pool.query(
        'INSERT INTO images (key, mime, data) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [key, mime, buf]
      );
    },
    async getImage(key) {
      const r = await pool.query('SELECT mime, data FROM images WHERE key = $1', [key]);
      return r.rows[0] || null;
    },
  };
}

function createStore() {
  if (process.env.DATABASE_URL) return createPgStore(process.env.DATABASE_URL);
  return createFileStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
}

module.exports = { createStore };
