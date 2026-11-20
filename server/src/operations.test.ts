import test from 'node:test';
import assert from 'node:assert/strict';
import {Database} from './Database.js';
import * as d from './domain.js';
import {ChargingService, DichVuCanhBao, IncidentService, ResourceService} from './m3.js';
import {RebalancingController, RecommendationController, ScenarioController, SimulationController, SimulationResultController} from './m4.js';

function fixture() {
  const now = 1_800_000_000_000;
  const state = new d.NetworkState();
  for (const id of ['H01','H02']) state.hubs.push({id,name:id,expectedDemand:id === 'H01' ? 0 : 5,compatiblePrivateVehicles:true});
  state.users.push({id:'OP',role:'OPERATOR'},{id:'TEC',role:'TECHNICIAN'},{id:'SV',role:'STUDENT'});
  for (let index = 1; index <= 5; index++) {
    state.vehicles.push({id:'EV' + index,hubId:'H01',status:'AVAILABLE',battery:100-index,spotId:'s' + index});
    state.spots.push({id:'s' + index,hubId:'H01',status:'OCCUPIED',vehicleId:'EV' + index});
    state.spots.push({id:'t' + index,hubId:'H02',status:'EMPTY'});
  }
  state.vehicles.push({id:'PV',hubId:'H02',status:'AVAILABLE',ownerId:'SV',approved:true,battery:25});
  state.points.push(new d.ChargingPoint('P','H02','RANH',5));
  return {state, now, db: (actor = 'OP', working?: Map<string,d.NetworkState>) => new Database(state,() => now,actor,working)};
}

test('UC-09 and UC-16 reject duplicate requests and isolate simulation writes', () => {
  const {state,now,db} = fixture();
  const service = new ChargingService(db());
  const result = service.dangKySac('SV',{maXe:'PV',maHub:'H02'});
  assert.throws(() => service.dangKySac('SV',{maXe:'PV',maHub:'H02'}), /DUPLICATE_REQUEST/);
  const snapshot = d.NetworkSnapshot.capture(state,now,'S');
  const working = snapshot.toWorkingCopy();
  const sim = new ChargingService(db('OP',new Map([['R',working]])));
  assert.equal(sim.lapLich('H02','MO_PHONG','R').allocations.length,1);
  assert.equal(working.requests[0].status,'DA_XEP_LICH');
  assert.equal(snapshot.state.requests[0].status,'CHO_XEP_LICH');
  assert.equal(state.requests[0].status,'CHO_XEP_LICH');
  assert.equal(state.notifications.length,0);
  const live = service.lapLich('H02','THAT');
  assert.equal(live.allocations[0].requestId,result.maYeuCauSac);
  assert.equal(state.notifications.length,1);
});

test('UC-13/18 enforce transitions and the assignee', () => {
  const {state,db} = fixture();
  const incident = new IncidentService(db());
  const {maSuCo} = incident.baoSuCo('SV','CONG_SAC','P','DEVICE_FAILURE','Broken cable','H02');
  assert.throws(() => incident.baoSuCo('SV','CONG_SAC','P','DEVICE_FAILURE','Broken cable','H02'), /DUPLICATE_REPORT/);
  incident.xacNhanVaPhanCong(maSuCo,'TEC');
  assert.equal(state.points[0].status,'BROKEN');
  assert.throws(() => incident.capNhatKetQuaKhacPhuc(maSuCo,'Repair complete'), /FORBIDDEN/);
  new IncidentService(db('TEC')).capNhatKetQuaKhacPhuc(maSuCo,'Repair complete');
  assert.equal(incident.ketLuanKiemTra(maSuCo,true).closed,true);
  assert.equal(state.incidents[0].status,'DA_DONG');
  assert.equal(state.points[0].status,'RANH');
});

test('UC-15/24 deduplicate telemetry and preserve the alert when data is stale', () => {
  const {state,now,db} = fixture();
  const service = new ResourceService(db(),false);
  const message = {maTaiNguyen:'EV1',loaiTaiNguyen:'XE',nguon:'MO_PHONG',trangThai:'SAN_SANG',mucPin:45,thoiDiem:now} as const;
  assert.equal(service.xuLyBanTin(message).ignored,false);
  assert.equal(service.xuLyBanTin({...message,thoiDiem:now-100,mucPin:1}).ignored,true);
  assert.equal(state.vehicles[0].battery,45);
  assert.equal(new DichVuCanhBao(db()).quetQuaTai()[0].level,'NGHIEM_TRONG');
  assert.equal(new DichVuCanhBao(new Database(state,() => now+360_000)).quetQuaTai().length,1);
});

test('UC-17 completes one idempotent order and moves the reserved spots', () => {
  const {state,db} = fixture();
  const service = new RebalancingController(db());
  assert.equal(service.proposeTransfer('H01','H02').n,3);
  const command = {sourceHubId:'H01',destHubId:'H02',vehicleIds:['EV1','EV2'],idempotencyKey:'abc',confirmed:true};
  const order = service.createOrder(command);
  assert.equal(service.createOrder(command).id,order.id);
  assert.equal(state.orders.length,1);
  assert.equal(state.spots.find(spot => spot.id === order.spotIds[0])?.status,'RESERVED');
  new RebalancingController(db('TEC')).completeOrder(order.id,'TEC');
  assert.equal(order.status,'COMPLETED');
  assert.equal(state.vehicles[0].hubId,'H02');
  assert.equal(state.spots[0].status,'EMPTY');
});

test('UC-20/21/22 version scenarios, reuse a snapshot and produce repeatable metrics', () => {
  const {state,db} = fixture();
  const scenarios = new ScenarioController(db());
  const params = {code:'X',eventType:'DEMAND_SURGE',hubIds:['H02'],intensity:20,durationMin:5} as const;
  const scenario = scenarios.createScenario({...params,hubIds:[...params.hubIds]}).scenario!;
  const runs = new SimulationController(db());
  const started = runs.runScenario(scenario.id,1);
  const run = state.runs[0];
  const snapshot = state.snapshots[0];
  const liveBefore = structuredClone(state.vehicles);
  const result = SimulationController.execute(scenario,snapshot,'R');
  assert.deepEqual(SimulationController.execute(scenario,snapshot,'R'),result);
  assert.deepEqual(state.vehicles,liveBefore);
  assert.equal(result.status,'COMPLETED');
  runs.cancelRun(started.runId);
  assert.equal(new SimulationResultController(db()).getRun(started.runId).applicable,false);
  const revised = scenarios.updateScenario(scenario.id,{...scenario.params,intensity:21},1);
  assert.equal(revised.scenario?.versionNo,2);
  assert.equal(run.scenarioVersion,1);
  assert.equal(state.scenarios.length,2);
  assert.equal(runs.runScenario(scenario.id,2,snapshot.id).success,true);
  assert.equal(state.snapshots.length,1);
});

test('UC-17 assigns a pending order only to an idle technician and only once',()=>{
  const {state,db}=fixture();
  const pending=new d.RebalancingOrder('P','H01','H02',['EV1'],['t1'],'MANUAL','OP','pending-key',Date.now());
  state.orders.push(pending);
  const service=new RebalancingController(db());
  assert.throws(()=>new RebalancingController(db('TEC')).assignPendingOrder('P','TEC'),/FORBIDDEN/);
  service.assignPendingOrder('P','TEC');
  assert.equal(pending.status,'ASSIGNED');
  assert.equal(pending.technicianId,'TEC');
  assert.throws(()=>service.assignPendingOrder('P','TEC'),/INVALID_STATE/);
});

test('UC-23 requires confirmation, recalculates capacity and rejects a duplicate package', () => {
  const {state,now,db} = fixture();
  const run = new d.SimulationRun('R','C',1,'S',now);
  run.complete([],now);
  const item = new d.CoordinationRecommendation('K','R','REBALANCE','H01','H02',5,['EV1','EV2','EV3','EV4','EV5']);
  state.runs.push(run);
  state.recommendations.push(item);
  const service = new RecommendationController(db());
  assert.equal(service.previewImpact('R',['K']).vehiclesToRebalance,5);
  assert.throws(() => service.applyRecommendations('R',['K'],false,'OP'), /NOT_CONFIRMED/);
  assert.equal(service.applyRecommendations('R',['K'],true,'OP').results[0].quantity,3);
  assert.equal(service.applyRecommendations('R',['K'],true,'OP').rejectedWholePackage,true);
  assert.equal(state.orders.length,1);
});
