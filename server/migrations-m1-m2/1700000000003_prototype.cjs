exports.up = pgm => pgm.sql(`
ALTER TABLE users ADD COLUMN student_code text;
ALTER TABLE spots ADD COLUMN retired boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{"theme":"light","language":"vi","fontSize":"medium"}';
ALTER TABLE hubs ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE hubs ADD COLUMN charging_count integer NOT NULL DEFAULT 2 CHECK(charging_count >= 0);
ALTER TABLE hubs ADD COLUMN charging_rate double precision NOT NULL DEFAULT 2 CHECK(charging_rate > 0);
CREATE TABLE private_parking (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), vehicle_id text NOT NULL REFERENCES private_vehicles(id),
 spot_id text NOT NULL REFERENCES spots(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'DA_XAC_NHAN'
 CHECK(status IN ('DA_XAC_NHAN','DA_HUY','HET_HAN')), CHECK(ends_at > starts_at)
);
CREATE UNIQUE INDEX one_private_parking_user ON private_parking(user_id) WHERE status='DA_XAC_NHAN';
CREATE UNIQUE INDEX one_private_parking_spot ON private_parking(spot_id) WHERE status='DA_XAC_NHAN';
`);
