// Boot-time database migration — the SAME trick skyCommand uses (MIGRATE_ON_BOOT).
// Only the running app can reach the private database, so the app sets up its own
// tables on startup, BEFORE serving traffic. Safe to run many times (idempotent).
import pg from "pg";

const { Pool } = pg;

export async function runMigrations() {
  if (process.env.MIGRATE_ON_BOOT !== "true") {
    return { ran: false, reason: "MIGRATE_ON_BOOT is not 'true'" };
  }
  if (!process.env.DATABASE_URL) {
    return { ran: false, reason: "no DATABASE_URL set" };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon (and most free Postgres) require SSL.
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 1. Create the table that stores our KPIs (like skyCommand's 350+ KPIs, tiny version).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpis (
        id     SERIAL PRIMARY KEY,
        name   TEXT NOT NULL UNIQUE,
        value  NUMERIC NOT NULL,
        unit   TEXT,
        month  TEXT
      );
    `);

    // 2. Seed a few sample numbers if the table is empty.
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM kpis;");
    if (rows[0].c === 0) {
      await pool.query(`
        INSERT INTO kpis (name, value, unit, month) VALUES
          ('Patients Seen',        1240, 'count',   '2026-06'),
          ('Readmission Rate',      8.4, 'percent', '2026-06'),
          ('Avg Length of Stay',    3.7, 'days',    '2026-06'),
          ('Revenue',            485000, 'usd',     '2026-06');
      `);
    }

    return { ran: true, reason: "migrations applied" };
  } finally {
    await pool.end();
  }
}

// Allow running standalone: `npm run migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then((r) => {
      console.log("[migrate]", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[migrate] FAILED", e);
      process.exit(1);
    });
}
