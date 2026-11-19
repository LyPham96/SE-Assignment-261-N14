// The keys identify the in-process collections; the values define SQL tables and columns.
export const definitions = {
  hubs: ['hub', {id:'text',name:'text',expectedDemand:'double precision',compatiblePrivateVehicles:'boolean',distances:'jsonb'}],
  users: ['app_user', {id:'text',role:'text',sessionHash:'text',sessionExpiresAt:'time'}],
  vehicles: ['vehicle', {id:'text',hubId:'text',status:'text',battery:'double precision',ownerId:'text',approved:'boolean',spotId:'text'}],
  spots: ['parking_spot', {id:'text',hubId:'text',status:'text',holder:'text',vehicleId:'text'}],
  points: ['charging_point', {id:'text',hubId:'text',status:'text',rate:'double precision'}],
  requests: ['charging_request', {id:'text',userId:'text',vehicleId:'text',hubId:'text',battery:'double precision',createdAt:'time',status:'text',reason:'text',khungGio:'jsonb',targetBattery:'double precision'}],
  sessions: ['charging_session', {id:'text',requestId:'text',pointId:'text',start:'time',end:'time'}],
  incidents: ['incident', {id:'text',reportedBy:'text',resourceType:'text',resourceId:'text',kind:'text',description:'text',location:'text',tripId:'text',attachment:'text',status:'text',technician:'text',reason:'text',repair:'text'}],
  alerts: ['overload_alert', {id:'text',hubId:'text',level:'text',ratio:'double precision',updatedAt:'time',closedAt:'time',closeReason:'text',resource:'text'}],
  notifications: ['notification', {id:'text',recipient:'text',type:'text',body:'text',createdAt:'time',reference:'text'}],
  orders: ['rebalancing_order', {id:'text',sourceHubId:'text',destHubId:'text',vehicleIds:'text[]',spotIds:'text[]',origin:'text',createdBy:'text',idempotencyKey:'text',createdAt:'time',status:'text',technicianId:'text',completedAt:'time',cancelReason:'text'}],
  scenarios: ['scenario', {id:'text',params:'jsonb',createdBy:'text',seed:'bigint',versionNo:'integer',parentId:'text',status:'text'}],
  snapshots: ['network_snapshot', {id:'text',capturedAt:'time',state:'jsonb'}],
  runs: ['simulation_run', {id:'text',scenarioId:'text',scenarioVersion:'integer',snapshotId:'text',startedAt:'time',status:'text',progressPct:'integer',stopReason:'text',finishedAt:'time',workerStartedAt:'time',metrics:'jsonb'}],
  recommendations: ['coordination_recommendation', {id:'text',runId:'text',type:'text',hubId:'text',otherHubId:'text',quantity:'integer',vehicleIds:'text[]',status:'text',reason:'text'}],
  metrics: ['hub_metric_record', {hubId:'text',timestamp:'time',parkingRatio:'double precision',availableVehicles:'integer',chargingQueue:'integer',requested:'integer',fulfilled:'integer',overloadMinutes:'integer',firstOverloadMinute:'integer',lowBattery:'integer'}],
  reservations: ['reservation', {id:'text',hubId:'text',userId:'text',active:'boolean'}],
  trips: ['trip', {id:'text',userId:'text',vehicleId:'text',hubId:'text',active:'boolean',endedAt:'time'}],
  telemetry: ['resource_telemetry', {maTaiNguyen:'text',loaiTaiNguyen:'text',trangThai:'text',mucPin:'double precision',thoiDiem:'time',nguon:'text',maHub:'text'}],
  audit: ['audit_log', {actor:'text',action:'text',timestamp:'time',data:'jsonb'}],
};
export const sqlIdentifier = value => '"' + value.replaceAll('"','""') + '"';
