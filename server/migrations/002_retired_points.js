export function up(pgm) {
  pgm.sql('ALTER TABLE charging_point ADD COLUMN IF NOT EXISTS retired boolean DEFAULT false');
}
export function down(pgm) {
  pgm.sql('ALTER TABLE charging_point DROP COLUMN retired');
}
