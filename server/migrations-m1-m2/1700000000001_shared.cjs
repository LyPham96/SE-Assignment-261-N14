exports.up = pgm => pgm.sql(`
  ALTER TABLE vehicles DROP CONSTRAINT vehicles_status_check;
  ALTER TABLE vehicles ADD CHECK (status IN ('SAN_SANG','DA_DAT','DANG_DUNG','PIN_YEU','HONG','DANG_SAC','DANG_DIEU_CHUYEN'));
  ALTER TABLE spots ADD COLUMN rebalancing_holder text;
  CREATE TABLE pikepike_shared_network (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton));
`);
exports.down = pgm => pgm.sql(`
  DROP TABLE pikepike_shared_network;
  ALTER TABLE spots DROP COLUMN rebalancing_holder;
  UPDATE vehicles SET status='SAN_SANG' WHERE status IN ('DANG_SAC','DANG_DIEU_CHUYEN');
  ALTER TABLE vehicles DROP CONSTRAINT vehicles_status_check;
  ALTER TABLE vehicles ADD CHECK (status IN ('SAN_SANG','DA_DAT','DANG_DUNG','PIN_YEU','HONG'));
`);
