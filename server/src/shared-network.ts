import type {PoolClient} from 'pg';
import type {NetworkState, Vehicle} from './domain.js';
const toDomain:Record<string,Vehicle['status']> = {SAN_SANG:'AVAILABLE',PIN_YEU:'AVAILABLE',DA_DAT:'RESERVED',DANG_DUNG:'IN_USE',HONG:'BROKEN',DANG_SAC:'CHARGING',DANG_DIEU_CHUYEN:'REBALANCING'};
const toSql:Record<Vehicle['status'],string> = {AVAILABLE:'SAN_SANG',RESERVED:'DA_DAT',IN_USE:'DANG_DUNG',BROKEN:'HONG',CHARGING:'DANG_SAC',REBALANCING:'DANG_DIEU_CHUYEN'};
export async function loadSharedNetwork(client:PoolClient,state:NetworkState) {
  const {rows:[schema]} = await client.query("SELECT to_regclass(format('%I.pikepike_shared_network',current_schema())) AS ready");
  if (!schema.ready) return;
  const hubs = (await client.query('SELECT h.*, count(v.id)::int AS fleet FROM hubs h LEFT JOIN vehicles v ON v.hub_id=h.id GROUP BY h.id ORDER BY h.id')).rows;
  const vehicles = (await client.query('SELECT v.*, s.id AS spot_id FROM vehicles v LEFT JOIN spots s ON s.vehicle_id=v.id ORDER BY v.id')).rows;
  const spots = (await client.query('SELECT * FROM spots ORDER BY id')).rows;
  const users = (await client.query('SELECT id, role FROM users WHERE active ORDER BY id')).rows;
  const reservations = (await client.query("SELECT r.id,r.user_id,COALESCE(s.hub_id,v.hub_id) AS hub_id FROM reservations r JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN spots s ON s.id=r.destination_spot_id WHERE r.status='DA_XAC_NHAN'")).rows;
  const merge = <T extends {id:string}>(existing:T[], incoming:T[]) => {
    const byId=new Map(existing.map(item=>[item.id,item]));
    for(const item of incoming) byId.set(item.id,item);
    return [...byId.values()];
  };
  state.hubs=merge(state.hubs,hubs.map(h=>({id:h.id,name:h.name,expectedDemand:state.hubs.find(item=>item.id===h.id)?.expectedDemand??h.fleet,compatiblePrivateVehicles:true,distances:Object.fromEntries(hubs.map(other=>[other.id,Math.hypot(other.x-h.x,other.y-h.y)]))})));
  state.vehicles=merge(state.vehicles,vehicles.map(v=>({id:v.id,hubId:v.hub_id,status:toDomain[v.status],battery:v.battery,spotId:v.spot_id??undefined})));
  const {rows:[expanded]}=await client.query("SELECT to_regclass('private_vehicles') AS ready");
  if(expanded.ready){
    const privateVehicles=(await client.query("SELECT * FROM private_vehicles WHERE status='APPROVED'")).rows;
    const byId=new Map(state.vehicles.map(vehicle=>[vehicle.id,vehicle]));
    state.vehicles=merge(state.vehicles,privateVehicles.map(v=>byId.get(v.id)??{id:v.id,hubId:v.hub_id,status:'AVAILABLE',battery:0,ownerId:v.owner_id,approved:true}));
    const trips=(await client.query('SELECT t.*,v.hub_id FROM shared_trips t JOIN vehicles v ON v.id=t.vehicle_id')).rows;
    state.trips=merge(state.trips,trips.map(t=>({id:t.id,userId:t.user_id,vehicleId:t.vehicle_id,hubId:t.hub_id,active:!t.ended_at,endedAt:t.ended_at?.getTime()})));
  }
  state.spots=merge(state.spots,spots.map(s=>({id:s.id,hubId:s.hub_id,status:s.status,vehicleId:s.vehicle_id??undefined,holder:s.rebalancing_holder??undefined})));
  state.users=users.filter(u=>['STUDENT','OPERATIONS','TECHNICIAN','ADMIN'].includes(u.role)).map(u=>({id:u.id,role:u.role==='OPERATIONS'?'OPERATOR':u.role}));
  state.reservations=reservations.map(r=>({id:r.id,userId:r.user_id,hubId:r.hub_id,active:true}));
  return async () => {
    for(const old of vehicles) {
      const v=state.vehicles.find(item=>item.id===old.id);
      if(!v)continue;
      if(v.hubId===old.hub_id&&v.status===toDomain[old.status]&&v.battery===old.battery)continue;
      const status=v.status==='AVAILABLE'&&v.battery<20?'PIN_YEU':toSql[v.status];
      await client.query('UPDATE vehicles SET hub_id=$2,status=$3,battery=$4 WHERE id=$1',[v.id,v.hubId,status,Math.round(v.battery)]);
    }
    const changes=spots.flatMap(old=>{
      const spot=state.spots.find(s=>s.id===old.id);
      if(!spot||spot.status===old.status&&(spot.vehicleId??null)===old.vehicle_id&&(spot.holder??null)===old.rebalancing_holder)return [];
      return [spot];
    });
    // Vacate source spots first because spots.vehicle_id is unique.
    for(const spot of changes.sort((a,b)=>Number(Boolean(a.vehicleId))-Number(Boolean(b.vehicleId)))) {
      await client.query('UPDATE spots SET status=$2,vehicle_id=$3,rebalancing_holder=$4 WHERE id=$1',[spot.id,spot.status,spot.vehicleId??null,spot.holder??null]);
    }
  };
}
