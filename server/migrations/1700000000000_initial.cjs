exports.up = pgm => pgm.sql(`
  CREATE TABLE users (
    id uuid PRIMARY KEY,
    username text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('STUDENT', 'ADMIN', 'OPERATIONS', 'TECHNICIAN')),
    active boolean NOT NULL DEFAULT true,
    failed_logins integer NOT NULL DEFAULT 0,
    login_locked_until timestamptz,
    booking_locked_until timestamptz,
    version integer NOT NULL DEFAULT 1
  );
  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES users(id),
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE hubs (
    id text PRIMARY KEY,
    name text NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL
  );
  CREATE TABLE vehicles (
    id text PRIMARY KEY,
    name text NOT NULL,
    hub_id text NOT NULL REFERENCES hubs(id),
    battery integer NOT NULL CHECK (battery BETWEEN 0 AND 100),
    status text NOT NULL CHECK (status IN ('SAN_SANG', 'DA_DAT', 'DANG_DUNG', 'PIN_YEU', 'HONG'))
  );
  CREATE TABLE spots (
    id text PRIMARY KEY,
    hub_id text NOT NULL REFERENCES hubs(id),
    status text NOT NULL CHECK (status IN ('EMPTY', 'OCCUPIED', 'RESERVED')),
    vehicle_id text UNIQUE REFERENCES vehicles(id),
    CHECK ((status = 'OCCUPIED' AND vehicle_id IS NOT NULL) OR (status <> 'OCCUPIED' AND vehicle_id IS NULL))
  );
  CREATE TABLE reservations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    vehicle_id text NOT NULL REFERENCES vehicles(id),
    destination_spot_id text REFERENCES spots(id),
    status text NOT NULL CHECK (status IN ('DA_XAC_NHAN', 'DA_HUY', 'HET_HAN')),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
  );
  CREATE UNIQUE INDEX one_active_user ON reservations(user_id) WHERE status = 'DA_XAC_NHAN';
  CREATE UNIQUE INDEX one_active_vehicle ON reservations(vehicle_id) WHERE status = 'DA_XAC_NHAN';
  CREATE UNIQUE INDEX one_active_destination ON reservations(destination_spot_id) WHERE status = 'DA_XAC_NHAN';
  CREATE INDEX reservation_expiry ON reservations(expires_at) WHERE status = 'DA_XAC_NHAN';
  CREATE TABLE no_shows (
    reservation_id uuid PRIMARY KEY REFERENCES reservations(id),
    user_id uuid NOT NULL REFERENCES users(id),
    occurred_at timestamptz NOT NULL
  );
  CREATE TABLE audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid REFERENCES users(id),
    action text NOT NULL,
    entity_id text,
    created_at timestamptz NOT NULL
  );
`);
exports.down = pgm => pgm.sql('DROP TABLE audit_logs, no_shows, reservations, spots, vehicles, hubs, sessions, users;');
