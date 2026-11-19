exports.up = pgm => pgm.sql(`
CREATE TABLE student_profiles (user_id uuid PRIMARY KEY REFERENCES users(id), contact text NOT NULL);
CREATE TABLE private_vehicles (id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), plate text NOT NULL UNIQUE, model text NOT NULL, hub_id text NOT NULL REFERENCES hubs(id), status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')), version integer NOT NULL DEFAULT 1, reason text);
ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
ALTER TABLE reservations ADD CHECK(status IN ('DA_XAC_NHAN','DA_HUY','HET_HAN','DA_NHAN'));
ALTER TABLE reservations ADD COLUMN unlock_failed_until timestamptz;
ALTER TABLE reservations ADD COLUMN failed_unlock_count integer NOT NULL DEFAULT 0;
CREATE TABLE shared_trips (id uuid PRIMARY KEY, reservation_id uuid NOT NULL UNIQUE REFERENCES reservations(id), user_id uuid NOT NULL REFERENCES users(id), vehicle_id text NOT NULL REFERENCES vehicles(id), started_at timestamptz NOT NULL, started_battery integer NOT NULL, ended_at timestamptz, ended_battery integer, fee bigint, distance_km numeric, spot_id text REFERENCES spots(id));
CREATE UNIQUE INDEX shared_trip_active_user ON shared_trips(user_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX shared_trip_active_vehicle ON shared_trips(vehicle_id) WHERE ended_at IS NULL;
CREATE TABLE trip_device_events (event_id text PRIMARY KEY, subject_id uuid NOT NULL, vehicle_id text NOT NULL REFERENCES vehicles(id), kind text NOT NULL CHECK(kind IN ('UNPLUGGED','PLUGGED')), spot_id text REFERENCES spots(id), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), distance_km numeric CHECK(distance_km >= 0), consumed_at timestamptz);
CREATE TABLE trip_unlock_commands (reservation_id uuid PRIMARY KEY REFERENCES reservations(id), vehicle_id text NOT NULL REFERENCES vehicles(id), requested_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE trip_recovery_tasks (trip_id uuid PRIMARY KEY REFERENCES shared_trips(id), incident_id text NOT NULL UNIQUE, location text NOT NULL, status text NOT NULL DEFAULT 'PENDING');
`);
