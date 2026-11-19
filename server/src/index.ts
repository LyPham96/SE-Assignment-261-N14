import {createHash, timingSafeEqual} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import Fastify, {type FastifyError, type FastifyRequest} from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import pg from 'pg';
import {Database, type DuLieuKiemTraSac} from './Database.js';
import {DomainError, requireRule, type BanTinTrangThai, type LoaiTaiNguyen, type ScenarioParams, HubMetricRecord} from './domain.js';
import {ChargingService, IncidentService, MonitoringService, DichVuCanhBao, IoTGateway, ResourceService} from './m3.js';
import {RebalancingController, ReportController, ScenarioController, SimulationController, SimulationResultController, RecommendationController, type CreateOrderCommand, type ReportFilter} from './m4.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const string = {type: 'string', minLength: 1};
const number = {type: 'number'};
const integer = {type: 'integer'};
const boolean = {type: 'boolean'};
const strings = {type: 'array', items: string, uniqueItems: true};
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({type: 'object', properties, required, additionalProperties: false});
const choice = (...values: string[]) => ({type: 'string', enum: values});
const scenarioProps = {code: string, hubIds: strings, eventType: string, intensity: integer, durationMin: integer, seed: integer};
const scenarioRequired = Object.keys(scenarioProps).filter(key => key !== 'seed');
const scenarioSchema = object(scenarioProps, scenarioRequired);
const report = object({hubIds: strings, window: object({start: number, end: number})}, ['window']);

type Endpoint = (db: Database, input: Record<string, any>, params: Record<string, string>) => unknown;
export async function createServer(pool: pg.Pool) {
  const app = Fastify({logger: true});
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
  await app.register(cors, {origin: origins});
  await app.register(swagger, {openapi: {info: {title: 'PikePike M3 / M4', version: '1.0.0'}, components: {securitySchemes: {bearer: {type: 'http', scheme: 'bearer'}, device: {type: 'apiKey', name: 'X-IoT-Key', in: 'header'}}}}});
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      const code = error.code;
      const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'DATA_NOT_STABLE' ? 503
        : /TAKEN|DUPLICATE|VERSION|STATE|APPLIED|ALREADY_IN_ORDER|NOTHING_TO_TRANSFER|DEST_HUB_FULL|SOURCE_BELOW_MIN/.test(code) ? 409 : 400;
      return reply.status(status).send({code, message: code});
    }
    const validation = (error as FastifyError).validation;
    if (validation) return reply.status(400).send({code: 'INVALID_DATA', message: 'Invalid request', fieldErrors: validation.map(item => ({path: item.instancePath, message: item.message}))});
    app.log.error(error);
    return reply.status(500).send({code: 'SAVE_FAILED', message: 'Unexpected server error'});
  });
  function actor(request: FastifyRequest, db: Database) {
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    requireRule(token, 'UNAUTHENTICATED');
    const user = db.state.users.find(item => item.sessionHash === digest(token) && (item.sessionExpiresAt ?? 0) > db.now());
    requireRule(user, 'UNAUTHENTICATED');
    return user.id;
  }
  function route(method: 'GET' | 'POST' | 'PUT', path: string, schema: ReturnType<typeof object> | undefined, handler: Endpoint, options: {device?: boolean; status?: number} = {}) {
    const parameters = Object.fromEntries([...path.matchAll(/:(\w+)/g)].map(match => [match[1], string]));
    app.route({
      method, url: '/api/v1' + path,
      schema: {...(schema ? {[method === 'GET' ? 'querystring' : 'body']: schema} : {}), ...(Object.keys(parameters).length ? {params: object(parameters)} : {}), security: options.device ? [{device: []}] : [{bearer: []}]},
      async handler(request, reply) {
        if (options.device) {
          const configured = process.env.IOT_KEY;
          const supplied = request.headers['x-iot-key'];
          requireRule(configured && typeof supplied === 'string' && timingSafeEqual(Buffer.from(digest(configured)), Buffer.from(digest(supplied))), 'UNAUTHENTICATED');
        }
        const result = await Database.transaction(pool, '', db => {
          const identity = options.device ? 'SYSTEM' : actor(request, db);
          const scoped = new Database(db.state, db.now, identity);
          return handler(scoped, (method === 'GET' ? request.query : request.body) as Record<string, any> ?? {}, request.params as Record<string, string> ?? {});
        });
        if (result === undefined) return reply.status(204).send();
        const failed = result && typeof result === 'object' && 'success' in result && result.success === false;
        return reply.status(failed ? 422 : options.status ?? 200).send(result);
      },
    });
  }
  app.get('/healthz', async () => { await pool.query('SELECT 1 FROM hub LIMIT 1'); return {ok: true}; });
  app.get('/api/v1/openapi.json', () => app.swagger());

  route('GET','/charging/info',object({maXe:string,maHub:string}), (db,input) => {
    db.authorize('STUDENT');
    requireRule(db.state.vehicles.some(vehicle => vehicle.id === input.maXe && vehicle.ownerId === db.actor), 'FORBIDDEN');
    return new ChargingService(db).layThongTinSac(input.maXe,input.maHub);
  });
  route('POST','/charging/requests',object({maXe:string,maHub:string,khungGio:object({start:number,end:number}),targetBattery:number},['maXe','maHub']), (db,input) => {
    db.authorize('STUDENT');
    return new ChargingService(db).dangKySac(db.actor,input as DuLieuKiemTraSac);
  }, {status:201});
  route('POST','/charging/schedules',object({maHub:string}), (db,input) => {
    db.authorize('OPERATOR');
    return new ChargingService(db).lapLich(input.maHub,'THAT');
  });
  route('POST','/incidents',object({loaiTaiNguyen:choice('XE','CONG_SAC'),maTaiNguyen:string,loaiSuCo:string,moTa:string,viTri:string,anhDinhKem:{type:'string',maxLength:700000,pattern:'^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$'},maChuyenDi:string},['loaiTaiNguyen','maTaiNguyen','loaiSuCo','moTa','viTri']), (db,input) => {
    db.authorize('STUDENT','OPERATOR','TECHNICIAN');
    const tripId = input.maChuyenDi ?? (db.state.users.find(user => user.id === db.actor)?.role === 'STUDENT' && input.loaiTaiNguyen === 'XE' ? db.state.trips.find(trip => trip.userId === db.actor && trip.active && trip.vehicleId === input.maTaiNguyen)?.id : undefined);
    if (input.loaiTaiNguyen === 'XE' && db.state.users.find(user => user.id === db.actor)?.role === 'STUDENT') requireRule(tripId, 'INVALID_TRIP');
    return new IncidentService(db).baoSuCo(db.actor,input.loaiTaiNguyen as LoaiTaiNguyen,input.maTaiNguyen,input.loaiSuCo,input.moTa,input.viTri,input.anhDinhKem,tripId);
  }, {status:201});
  route('GET','/incidents',undefined, db => {
    db.authorize('OPERATOR','TECHNICIAN');
    return db.state.incidents.filter(item => db.state.users.some(user => user.id === db.actor && user.role === 'OPERATOR') || item.technician === db.actor);
  });
  route('GET','/incidents/:id',undefined,(db,_i,p) => new IncidentService(db).layChiTietSuCo(p.id));
  route('POST','/incidents/:id/reject',object({lyDo:string}),(db,i,p) => new IncidentService(db).tuChoiBaoCao(p.id,i.lyDo));
  route('POST','/incidents/:id/assign',object({maNVKyThuat:string}),(db,i,p) => new IncidentService(db).xacNhanVaPhanCong(p.id,i.maNVKyThuat));
  route('GET','/incidents/:id/repair',undefined,(db,_i,p) => ({ketQua: new IncidentService(db).layKetQuaKhacPhuc(p.id)}));
  route('PUT','/incidents/:id/repair',object({ketQua:string}),(db,i,p) => new IncidentService(db).capNhatKetQuaKhacPhuc(p.id,i.ketQua));
  route('POST','/incidents/:id/conclude',object({dat:boolean}),(db,i,p) => new IncidentService(db).ketLuanKiemTra(p.id,i.dat));
  route('GET','/dashboard',object({hubIds:strings},[]),(db,i) => {db.authorize('OPERATOR','TECHNICIAN');return new MonitoringService(db).layTongQuanMangLuoi(i);});
  route('GET','/alerts',undefined,db => {db.authorize('OPERATOR');return db.state.alerts;});
  route('POST','/iot/messages',object({maTaiNguyen:string,loaiTaiNguyen:choice('XE','CONG_SAC'),trangThai:string,mucPin:number,thoiDiem:number,nguon:choice('IOT_THAT','MO_PHONG')},['maTaiNguyen','loaiTaiNguyen','trangThai','thoiDiem','nguon']), (db,i) => new IoTGateway(new ResourceService(db)).nhanBanTin(i as BanTinTrangThai), {device:true});

  route('GET','/rebalancing/proposal',object({sourceHubId:string,destHubId:string}), (db,i) => {db.authorize('OPERATOR'); return new RebalancingController(db).proposeTransfer(i.sourceHubId,i.destHubId);});
  route('GET','/rebalancing/orders',undefined, db => {db.authorize('OPERATOR','TECHNICIAN'); return db.state.orders.filter(item => db.state.users.some(user => user.id === db.actor && user.role === 'OPERATOR') || item.technicianId === db.actor);});
  route('POST','/rebalancing/orders',object({sourceHubId:string,destHubId:string,vehicleIds:strings,idempotencyKey:string,confirmed:boolean}),(db,i) => new RebalancingController(db).createOrder(i as CreateOrderCommand),{status:201});
  route('POST','/rebalancing/orders/:id/vehicle-broken',object({vehicleId:string,description:string,location:string}),(db,i,p) => new RebalancingController(db).onVehicleBroken(p.id,i.vehicleId,db.actor,i.description,i.location));
  route('POST','/rebalancing/orders/:id/complete',undefined,(db,_i,p) => new RebalancingController(db).completeOrder(p.id,db.actor));
  route('POST','/reports',report,(db,i) => new ReportController(db).getOperationsReport(i as ReportFilter));
  route('POST','/reports/refresh',report,(db,i) => new ReportController(db).refreshReport(i as ReportFilter));
  route('GET','/scenarios/templates',undefined,db => {db.authorize('OPERATOR');return new ScenarioController(db).listTemplates();});
  route('GET','/scenarios',undefined,db => {db.authorize('OPERATOR');return [...new Set(db.state.scenarios.map(item => item.id))].map(id => db.findScenario(id));});
  route('POST','/scenarios',scenarioSchema,(db,i) => new ScenarioController(db).createScenario(i as ScenarioParams),{status:201});
  route('PUT','/scenarios/:id',object({params:scenarioSchema,expectedVersion:integer}),(db,i,p) => new ScenarioController(db).updateScenario(p.id,i.params,i.expectedVersion));
  route('POST','/scenarios/:id/clone',object({newCode:string}),(db,i,p) => new ScenarioController(db).cloneScenario(p.id,i.newCode),{status:201});
  route('POST','/scenarios/:id/run',object({expectedVersion:integer,sharedSnapshotId:string},['expectedVersion']),(db,i,p) => new SimulationController(db).runScenario(p.id,i.expectedVersion,i.sharedSnapshotId),{status:202});
  route('POST','/runs/compare',object({runIds:strings}),(db,i) => new SimulationResultController(db).compareRuns(i.runIds));
  route('GET','/runs',object({scenarioId:string},[]),(db,i) => new SimulationResultController(db).listRuns(i.scenarioId));
  route('GET','/runs/:id',undefined,(db,_i,p) => new SimulationResultController(db).getRun(p.id));
  route('GET','/runs/:id/progress',undefined,(db,_i,p) => {db.authorize('OPERATOR');return {progressPct:new SimulationController(db).getProgress(p.id)};});
  route('POST','/runs/:id/cancel',undefined,(db,_i,p) => new SimulationController(db).cancelRun(p.id));
  route('POST','/runs/:id/preview',object({recommendationIds:strings}),(db,i,p) => new RecommendationController(db).previewImpact(p.id,i.recommendationIds));
  route('POST','/runs/:id/apply',object({recommendationIds:strings,confirmed:boolean}),(db,i,p) => new RecommendationController(db).applyRecommendations(p.id,i.recommendationIds,i.confirmed,db.actor));
  route('GET','/notifications',undefined,db => db.state.notifications.filter(item => item.recipient === db.actor));
  return app;
}

async function start() {
  requireRule(process.env.DATABASE_URL, 'DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 8});
  const app = await createServer(pool);
  await Database.transaction(pool,'SYSTEM',db => {
    for (const run of db.state.runs) {
      if (run.status !== 'RUNNING' || !run.workerStartedAt) continue;
      run.cancel(db.now(),'SERVICE_RESTARTED');
      const scenario = db.findScenario(run.scenarioId);
      if (scenario) scenario.status = 'READY';
    }
  });
  let working = false;
  let active: Worker | undefined;
  async function runNext() {
    if (working) return;
    working = true;
    try {
      const job = await Database.transaction(pool,'SYSTEM',db => {
        const run = db.state.runs.find(item => item.status === 'RUNNING' && !item.workerStartedAt);
        if (!run) return;
        const scenario = db.state.scenarios.find(item => item.id === run.scenarioId && item.versionNo === run.scenarioVersion);
        const snapshot = db.findSnapshot(run.snapshotId);
        if (!scenario || !snapshot) {run.cancel(db.now(),'MISSING_INPUT'); if (scenario) scenario.status = 'READY'; return;}
        run.workerStartedAt = db.now();
        return {runId:run.id,scenario,snapshot};
      });
      if (!job) return;
      const control = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const workerOptions = {workerData: {...job,control}};
      const worker = active = import.meta.url.endsWith('.ts')
        ? new Worker("import('tsx/esm/api').then(({tsImport}) => tsImport(" + JSON.stringify(new URL('./worker.ts',import.meta.url).href) + ", " + JSON.stringify(import.meta.url) + "));", {...workerOptions,eval:true})
        : new Worker(new URL('./worker.js', import.meta.url), workerOptions);
      type Result = ReturnType<typeof SimulationController.execute>;
      let latestProgress: {progress: number; metrics: HubMetricRecord[]} | undefined;
      let flushing = false;
      worker.on('message',message => {if ('progress' in message) latestProgress = message;});
      const check = setInterval(() => {
        if (flushing) return;
        flushing = true;
        void Database.transaction(pool,'SYSTEM',db => {
          const run = db.findRun(job.runId);
          if (!run || run.status !== 'RUNNING') Atomics.store(new Int32Array(control),0,1);
          else if (latestProgress) {run.progressPct = latestProgress.progress; run.metrics = latestProgress.metrics;}
        }).catch(error => app.log.error(error)).finally(() => {flushing = false;});
      },250);
      let result: Result | undefined;
      let reason = 'WORKER_EXITED';
      try {
        result = await new Promise<Result>((resolve,reject) => {
          worker.on('message',message => {if ('result' in message) resolve(message.result);});
          worker.once('error',reject);
          worker.once('exit',code => reject(new Error('Worker exit: ' + code)));
        });
      } catch (error) {
        reason = 'WORKER_FAILED';
        app.log.error(error);
      } finally {
        clearInterval(check);
        active = undefined;
      }
      await Database.transaction(pool,'SYSTEM',db => {
        const run = db.findRun(job.runId);
        if (!run || run.status !== 'RUNNING') return;
        const scenario = db.findScenario(run.scenarioId);
        if (scenario) scenario.status = 'READY';
        if (result) run.metrics = result.metrics;
        if (result?.status === 'COMPLETED') {
          run.complete(result.metrics,db.now());
          db.saveRecommendations(result.recommendations);
        } else if (result?.status === 'TIMED_OUT') run.timeout(db.now());
        else run.cancel(db.now(),reason);
      });
    } catch (error) { app.log.error(error); }
    finally { working = false; }
  }
  await app.listen({host: process.env.HOST ?? '127.0.0.1',port: Number(process.env.PORT ?? 3000)});
  const jobs = setInterval(() => { void runNext(); },250);
  const telemetry = setInterval(() => {
    if (process.env.DEMO_IOT !== 'true' || process.env.USE_REAL_IOT === 'true') return;
    void Database.transaction(pool,'SYSTEM',db => new ResourceService(db).thuThapDinhKy()).catch(error => app.log.error(error));
  },5000);
  const alerts = setInterval(() => {
    void Database.transaction(pool,'SYSTEM', db => {
      new DichVuCanhBao(db).quetQuaTai();
      for (const hub of db.state.hubs) {
        const row = new HubMetricRecord(hub.id,db.now(),db.state.parkingRatio(hub.id));
        row.availableVehicles = db.state.vehicles.filter(vehicle => vehicle.hubId === hub.id && vehicle.status === 'AVAILABLE').length;
        row.chargingQueue = db.state.requests.filter(request => request.hubId === hub.id && request.status === 'CHO_XEP_LICH').length;
        db.state.metrics.push(row);
      }
    }).catch(error => app.log.error(error));
  },60_000);
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, async () => {
    clearInterval(jobs);
    clearInterval(telemetry);
    clearInterval(alerts);
    if (active) await active.terminate();
    await app.close();
    await pool.end();
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(error => {console.error(error);process.exitCode = 1;});
}
