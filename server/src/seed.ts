import {createHash, randomBytes} from 'node:crypto';
import pg from 'pg';
import {Database} from './Database.js';
import {ChargingPoint, HubMetricRecord, requireRule} from './domain.js';
requireRule(process.env.DATABASE_URL, 'DATABASE_URL_REQUIRED');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  const {rows:[schema]} = await pool.query("SELECT to_regclass('pikepike_shared_network') AS ready");
  const shared = Boolean(schema.ready);
  const studentId = shared ? (await pool.query("SELECT id FROM users WHERE username='student@pikepike.vn'")).rows[0]?.id : undefined;
  const credentials = await Database.transaction(pool,'SYSTEM', db => {
    if (shared) {
      requireRule(db.state.hubs.length,'SEED_M1_M2_FIRST');
      for (const hub of db.state.hubs) {
        if (!db.state.points.some(point=>point.hubId===hub.id)) db.state.points.push(new ChargingPoint(hub.id+'-P1',hub.id,'RANH',2));
      }
      const hub = db.state.hubs.find(item=>item.id==='metro');
      if (studentId && hub && !db.state.vehicles.some(vehicle=>vehicle.id==='PV01')) {
        db.state.vehicles.push({id:'PV01',hubId:hub.id,ownerId:studentId,approved:true,status:'AVAILABLE',battery:25});
      }
      return [];
    }
    const users = [{id:'SV01',role:'STUDENT'},{id:'OP01',role:'OPERATOR'},{id:'TECH01',role:'TECHNICIAN'}] as const;
    if (!db.state.hubs.length) for (let index = 1; index <= 6; index++) {
      const id = 'H0' + index;
      db.state.hubs.push({id, name:'Hub ' + index, expectedDemand:index === 1 ? 2 : 8, compatiblePrivateVehicles:true});
      for (let spot = 1; spot <= 12; spot++) db.state.spots.push({id:id + '-S' + spot, hubId:id,status:'EMPTY'});
      for (let point = 1; point <= 2; point++) db.state.points.push(new ChargingPoint(id + '-P' + point,id,'RANH',point === 1 ? 1 : 2));
      for (let i = 1; i <= (index === 1 ? 6 : 2); i++) {
        const spot = db.state.spots.find(item => item.id === id + '-S' + i)!;
        const vehicle = {id:id + '-EV' + i,hubId:id,status:'AVAILABLE' as const,battery:100 - i * 7,spotId:spot.id};
        db.state.vehicles.push(vehicle);
        Object.assign(spot,{status:'OCCUPIED',vehicleId:vehicle.id});
      }
      db.state.telemetry[id] = {maTaiNguyen:id + '-P1',loaiTaiNguyen:'CONG_SAC',trangThai:'RANH',nguon:'MO_PHONG',thoiDiem:db.now(),maHub:id};
      const metric = new HubMetricRecord(id,db.now(),db.state.parkingRatio(id));
      metric.availableVehicles = db.state.vehicles.filter(vehicle => vehicle.hubId === id && vehicle.status === 'AVAILABLE').length;
      db.state.metrics.push(metric);
    }
    if (!db.state.vehicles.some(item => item.id === 'PV01')) db.state.vehicles.push({id:'PV01',hubId:'H01',status:'AVAILABLE',battery:25,ownerId:'SV01',approved:true});
    return users.map(user => {
      const token = randomBytes(24).toString('hex');
      let row = db.state.users.find(item => item.id === user.id);
      if (!row) {row = {...user}; db.state.users.push(row);}
      row.sessionHash = createHash('sha256').update(token).digest('hex');
      row.sessionExpiresAt = db.now() + 24 * 60 * 60 * 1000;
      return {...user,token};
    });
  });
  console.table(credentials);
} finally {await pool.end();}
