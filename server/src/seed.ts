import {createHash, randomBytes} from 'node:crypto';
import pg from 'pg';
import {Database} from './Database.js';
import {ChargingPoint, HubMetricRecord, requireRule} from './domain.js';
requireRule(process.env.DATABASE_URL, 'DATABASE_URL_REQUIRED');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  const credentials = await Database.transaction(pool,'SYSTEM', db => {
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
