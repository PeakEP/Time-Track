// Postgres access for the Vendor Orders module.
// Connection string: DATABASE_URL, or NETLIFY_DATABASE_URL when using Netlify DB.
import postgres from "postgres";
import COST_SEED from "../../../vendor-orders/seed/cost_codes.json" with { type: "json" };

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || "";
}

let sql = null;
export function getSql() {
  if (!sql) {
    sql = postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } },
    });
  }
  return sql;
}

export const DEFAULT_CUTOFFS = [
  { order_day: "tue", label: "Tuesday", weekday: 2, cutoff_time: "10:00" },
  { order_day: "thu", label: "Thursday", weekday: 4, cutoff_time: "10:00" },
];

// Seeded only into an empty vendors table so renames/deactivations stick.
// Cabinets (Oppein/Aline/Divine/Canada Kitchens) and Prosol are deliberately excluded.
const DEFAULT_VENDORS = [
  ["Avide Flooring", "tue", "Flooring"],
  ["Richmond Flooring", "tue", "Flooring"],
  ["MSI", "tue", "Tile / Stone"],
  ["Sarana Tile", "tue", "Tile"],
  ["Tosca", "tue", "Fixtures"],
  ["Agua", "thu", "Kitchen & Bath"],
  ["Maxxmar", "thu", "Window coverings"],
  ["Dainolite", "thu", "Lighting"],
  ["Marathon", "thu", "Hardware"],
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'sales_rep' CHECK (role IN ('sales_rep','purchaser')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- One account per name, case-insensitive. PIN is a salted scrypt hash.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_name ON app_users (lower(display_name));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS failed_attempts int NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions (user_id);
CREATE TABLE IF NOT EXISTS vendors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  order_day  text NOT NULL CHECK (order_day IN ('tue','thu')),
  category   text,
  active     boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cutoffs (
  order_day    text PRIMARY KEY CHECK (order_day IN ('tue','thu')),
  label        text NOT NULL,
  weekday      int  NOT NULL,
  cutoff_time  text NOT NULL,
  timezone     text NOT NULL DEFAULT 'America/Halifax',
  updated_by   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cost_codes (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  phase       text NOT NULL,
  phase_name  text NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_group_id  uuid NOT NULL,
  vendor          text NOT NULL REFERENCES vendors(name) ON UPDATE CASCADE,
  order_day       text NOT NULL CHECK (order_day IN ('tue','thu')),
  po              text NOT NULL,
  job_code        text,
  client          text,
  product_name    text NOT NULL,
  sku             text,
  description     text,
  coa             text REFERENCES cost_codes(code),
  qty             numeric(12,3) NOT NULL CHECK (qty > 0),
  unit            text,
  unit_cost       numeric(12,2) NOT NULL DEFAULT 0,
  needed_by       date,
  notes           text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ready','ordered','received','backordered')),
  approved        boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ordered_by      uuid REFERENCES app_users(id) ON DELETE SET NULL,
  confirmation    text,
  eta             date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ordered_at      timestamptz,
  received_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_status ON orders (vendor, status);
CREATE INDEX IF NOT EXISTS idx_orders_group         ON orders (order_group_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders (created_at DESC);
-- Audit trail. No FK to orders so history survives deletes.
CREATE TABLE IF NOT EXISTS order_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid,
  event       text NOT NULL,
  actor       uuid REFERENCES app_users(id) ON DELETE SET NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id);
`;

let ready = null;
// Idempotent: creates tables and seeds reference data on first use per instance.
export function ensureSchema() {
  if (!ready) {
    ready = migrate().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function migrate() {
  const sql = getSql();
  await sql.unsafe(SCHEMA);

  const codes = Object.entries(COST_SEED.codes).map(([code, c]) => ({
    code,
    name: c.name,
    phase: c.phase,
    phase_name: COST_SEED.phases[c.phase]?.name || "",
  }));
  await sql`
    INSERT INTO cost_codes ${sql(codes, "code", "name", "phase", "phase_name")}
    ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, phase = EXCLUDED.phase, phase_name = EXCLUDED.phase_name`;

  await sql`
    INSERT INTO cutoffs ${sql(DEFAULT_CUTOFFS, "order_day", "label", "weekday", "cutoff_time")}
    ON CONFLICT (order_day) DO NOTHING`;

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM vendors`;
  if (n === 0) {
    const rows = DEFAULT_VENDORS.map(([name, order_day, category], i) => ({
      name,
      order_day,
      category,
      sort_order: i + 1,
    }));
    await sql`INSERT INTO vendors ${sql(rows, "name", "order_day", "category", "sort_order")}
              ON CONFLICT (name) DO NOTHING`;
  }
}
