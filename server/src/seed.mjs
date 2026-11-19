import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPool, transaction } from './db.mjs';
import { hashPassword } from './security.mjs';

export async function seed(pool) {
  const passwordHash = await hashPassword('PikePike2026!');
  await transaction(pool, async db => {
    for (const [username, name, role] of [
      ['student@pikepike.vn', 'Nguyễn Vũ Bách', 'STUDENT'],
      ['student2@pikepike.vn', 'Trần Minh An', 'STUDENT'],
      ['admin@pikepike.vn', 'Quản trị viên', 'ADMIN'],
      ['operations@pikepike.vn', 'Nhân viên vận hành', 'OPERATIONS'],
      ['technician@pikepike.vn', 'Nhân viên kỹ thuật', 'TECHNICIAN']
    ]) await db.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [randomUUID(), username, name, passwordHash, role]);
    for (const [id, name, x, y] of [['metro', 'Ga Metro ĐHQG', 0, 0], ['ktx', 'Ký túc xá khu A', 1200, 300], ['bk', 'ĐH Bách Khoa', 2000, 900]]) {
      await db.query('INSERT INTO hubs(id,name,x,y) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, name, x, y]);
      for (let i = 1; i <= 20; i++) await db.query("INSERT INTO spots(id,hub_id,status) VALUES($1,$2,'EMPTY') ON CONFLICT DO NOTHING", [`${id}-${i.toString().padStart(2, '0')}`, id]);
    }
    for (const [index, battery] of [68, 50, 25, 15].entries()) {
      const id = `PK-${index + 1}`;
      const inserted = await db.query('INSERT INTO vehicles(id,name,hub_id,battery,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id', [id, `Pike City 0${index + 1}`, 'metro', battery, battery < 20 ? 'PIN_YEU' : 'SAN_SANG']);
      if (inserted.rowCount) await db.query("UPDATE spots SET status='OCCUPIED', vehicle_id=$1 WHERE id=$2", [id, `metro-0${index + 1}`]);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  try { await seed(pool); } finally { await pool.end(); }
}
