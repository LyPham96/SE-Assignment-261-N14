import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {createServer} from './index.js';
import {Database} from './Database.js';
import {ChargingPoint} from './domain.js';
import {up} from '../migrations/001_network.js';

const url = process.env.TEST_DATABASE_URL;
test('PostgreSQL commits one concurrent charging request and rejects overlap atomically', {skip: !url}, async () => {
  const schema = 'm3m4_' + randomBytes(8).toString('hex');
  const admin = new pg.Pool({connectionString:url});
  const pool = new pg.Pool({connectionString:url,options:'-c search_path=' + schema + ',public',max:4});
  let app: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    const statements: string[] = [];
    up({sql: (statement: string) => { statements.push(statement); }});
    for (const statement of statements) await pool.query(statement);
    const token = randomBytes(24).toString('hex');
    const sessionHash = createHash('sha256').update(token).digest('hex');
    await Database.transaction(pool,'SYSTEM',db => {
      db.state.users.push({id:'SV',role:'STUDENT',sessionHash,sessionExpiresAt:db.now()+100_000});
      db.state.hubs.push({id:'H',name:'Hub',expectedDemand:0,compatiblePrivateVehicles:true});
      db.state.vehicles.push({id:'PV',hubId:'H',ownerId:'SV',approved:true,status:'AVAILABLE',battery:60});
      db.state.points.push(new ChargingPoint('P','H','RANH',2));
    });
    app = await createServer(pool);
    const send = () => app!.inject({method:'POST',url:'/api/v1/charging/requests',headers:{authorization:'Bearer ' + token},payload:{maXe:'PV',maHub:'H'}});
    const replies = await Promise.all([send(),send()]);
    assert.deepEqual(replies.map(reply => reply.statusCode).sort(),[201,409]);
    const saved = await pool.query('SELECT id FROM charging_request');
    assert.equal(saved.rowCount,1);
    const id = saved.rows[0].id;
    const time = new Date();
    const end = new Date(time.getTime()+60_000);
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const session of ['SA','SB']) {
          await client.query('INSERT INTO charging_session(entity_key,position,id,"requestId","pointId","start","end") VALUES ($1,0,$1,$2,$3,$4,$5)',[session,id,'P',time,end]);
        }
        await assert.rejects(client.query('COMMIT'), {code:'23P01'});
      } finally {client.release();}
    } finally {
      assert.equal((await pool.query('SELECT id FROM charging_session')).rowCount,0);
    }
  } finally {
    await app?.close();
    await pool.end();
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await admin.end();
  }
});
