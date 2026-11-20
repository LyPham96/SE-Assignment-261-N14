import Fastify from 'fastify';
import {StudentProfile,PrivateVehicle,DieuKhienChuyenDi,HeThongIoT} from './remaining.mjs';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { prototype } from './prototype.mjs';
import { randomUUID } from 'node:crypto';
import { createService, Problem, BoDieuKhienXacThuc, DieuKhienDatCho, CSDLTaiNguyen } from './service.mjs';

const idSchema = { type: 'string', minLength: 1, maxLength: 80 };

export async function createApp({ pool, clock, fault, logger = false, secureCookies = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 16384 });
  const service = await createService(pool, clock, fault);
  await app.register(cookie);
  await app.register(swagger, { openapi: { info: { title: 'PikePike M1/M2', version: '0.1.0' }, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'pikepike_session' } } } } });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
  await registerM1M2Routes(app,{pool,service,secureCookies});
  app.decorate('service', service);
  return app;
}

export async function registerM1M2Routes(app,{pool,service,secureCookies=false,tripHooks}) {
  const xacThuc = new BoDieuKhienXacThuc(service);
  const datCho = new DieuKhienDatCho(service);
  const taiNguyen = new CSDLTaiNguyen(service);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Problem) return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error.validation) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra các trường nhập.' });
    if (['23505', '40P01', '40001'].includes(error.code)) return reply.code(409).send({ code: 'CONFLICT', message: 'Tài nguyên vừa thay đổi. Vui lòng tải lại và thử lại.' });
    request.log.error(error);
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  });
  app.addHook('onRequest', async request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.routeOptions.url !== '/api/iot/trip-events' && request.headers['x-pikepike-request'] !== '1') throw new Problem(403, 'CSRF_REJECTED', 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.');
  });
  const auth = async request => { request.user = await xacThuc.kiemTraPhien(request.cookies.pikepike_session); };
  const protectedSchema = { security: [{ session: [] }] };
  app.get('/api/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  app.post('/api/auth/login', { schema: { body: { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: { username: { type: 'string', minLength: 1, maxLength: 254 }, password: { type: 'string', minLength: 1, maxLength: 256 } } } } }, async (request, reply) => {
    const { token, user } = await xacThuc.dangNhap(request.body.username, request.body.password);
    reply.setCookie('pikepike_session', token, { path: '/api', httpOnly: true, sameSite: 'strict', secure: secureCookies });
    return { user };
  });
  app.get('/api/auth/me', { preHandler: auth, schema: protectedSchema }, async request => ({ user: request.user }));
  app.post('/api/auth/logout', { preHandler: auth, schema: protectedSchema }, async (request, reply) => {
    await xacThuc.dangXuat(request.cookies.pikepike_session, request.user);
    reply.clearCookie('pikepike_session', { path: '/api' });
    return { success: true };
  });
  app.get('/api/hubs', { preHandler: auth, schema: protectedSchema }, () => taiNguyen.fetchAllHubsStatus());
  app.get('/api/hubs/:id/vehicles', { preHandler: auth, schema: { ...protectedSchema, params: { type: 'object', required: ['id'], properties: { id: idSchema } } } }, request => taiNguyen.layDanhSachXe(request.params.id));
  app.get('/api/me/reservations', { preHandler: auth, schema: protectedSchema }, request => service.reservations(request.user.id));
  app.post('/api/reservations/shared', { preHandler: auth, schema: { ...protectedSchema, body: { type: 'object', additionalProperties: false, required: ['vehicleId'], properties: { vehicleId: idSchema, destinationHubId: idSchema } } } }, async (request, reply) => {
    const result = await datCho.yeuCauDatXe(request.user.id, request.body.vehicleId, request.body.destinationHubId);
    return reply.code(201).send(result);
  });
  app.post('/api/reservations/:id/cancel', { preHandler: auth, schema: { ...protectedSchema, params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } } }, request => datCho.huyDatCho(request.user.id, request.params.id));
  const profiles=new StudentProfile(pool);
  const privateVehicles=new PrivateVehicle(pool);
  const iot=new HeThongIoT(pool);
  const trips=new DieuKhienChuyenDi(pool,iot,tripHooks);
  const uuid={type:'string',format:'uuid'};
  const shortText={type:'string',minLength:1,maxLength:200};
  function route(method,url,handler,{properties,required,params,device=false}={}){
    const schema={...(device?{}:protectedSchema)};
    if(properties)schema.body={type:'object',properties,required:required??Object.keys(properties),additionalProperties:false};
    if(params)schema.params={type:'object',properties:{id:params},required:['id']};
    app.route({method,url,schema,...(!device&&{preHandler:auth}),handler});
  }
  route('GET','/api/me/profile',req=>profiles.layHoSo(req.user.id));
  route('PUT','/api/me/profile',req=>profiles.capNhatHoSo(req.user.id,req.body),{properties:{hoTen:shortText,thongTinLienHe:shortText}});
  route('GET','/api/private-vehicles',req=>privateVehicles.layDanhSach(req.user));
  route('POST','/api/private-vehicles',req=>privateVehicles.khaiBaoXe(req.user.id,req.body),{properties:{bienSo:shortText,mauXe:shortText,maHub:idSchema}});
  route('POST','/api/private-vehicles/:id/review',req=>privateVehicles.duyetXe(req.user.id,req.params.id,req.body.quyetDinh,req.body.lyDo,req.body.phienBanDaMo),{params:idSchema,properties:{quyetDinh:{enum:['APPROVED','REJECTED']},lyDo:shortText,phienBanDaMo:{type:'integer',minimum:1}},required:['quyetDinh','phienBanDaMo']});
  route('GET','/api/reservations/:id/unlock-code',req=>trips.layMaMoKhoa(req.user.id,req.params.id),{params:uuid});
  route('POST','/api/reservations/:id/pickup',req=>trips.yeuCauMoKhoaNhanXe(req.user.id,req.params.id,req.body.maMoKhoa),{params:uuid,properties:{maMoKhoa:{type:'string',pattern:'^[0-9]{6}$'}}});
  route('GET','/api/me/trips',req=>trips.layChuyenDi(req.user.id));
  route('GET','/api/trips/:id/spots',req=>trips.layChoTraXe(req.user.id,req.params.id),{params:uuid});
  route('POST','/api/trips/:id/return',req=>req.body.maChoDo
    ? trips.traXe(req.user.id,req.params.id,req.body.maChoDo)
    : trips.yeuCauHoanTatTraXe(req.user.id,req.params.id),{params:uuid,properties:{maChoDo:idSchema},required:[]});
  route('POST','/api/trips/:id/breakdown',req=>trips.xuLySuCoDocDuong(req.user.id,req.params.id,req.body.toaDoViTri,req.body.moTaSuCo),{params:uuid,properties:{toaDoViTri:shortText,moTaSuCo:shortText}});
  route('POST','/api/iot/trip-events',req=>iot.nhanTin(req.body,req.headers['x-iot-key']),{device:true,properties:{eventId:idSchema,subjectId:uuid,vehicleId:idSchema,kind:{enum:['UNPLUGGED','PLUGGED']},spotId:idSchema,distanceKm:{type:'number',minimum:0,maximum:2000}},required:['eventId','subjectId','vehicleId','kind']});
  route('GET','/api/iot/trip-commands/:id',req=>iot.layLenhMoKhoa(req.params.id,req.headers['x-iot-key']),{device:true,params:idSchema});
  route('GET','/api/demo/status',()=>({enabled:process.env.DEMO_IOT==='true'&&process.env.USE_REAL_IOT!=='true'&&Boolean(process.env.IOT_KEY)}));
  route('POST','/api/demo/trip-events',async req=>{
    if(process.env.DEMO_IOT!=='true'||process.env.USE_REAL_IOT==='true')throw new Problem(404,'NOT_FOUND','Nguồn IoT demo đang tắt.');
    const {subjectId,kind,spotId}=req.body;
    const table=kind==='UNPLUGGED'?'reservations':'shared_trips';
    const row=(await pool.query('SELECT vehicle_id FROM '+table+' WHERE id=$1 AND user_id=$2',[subjectId,req.user.id])).rows[0];
    if(!row)throw new Problem(404,'NOT_FOUND','Không tìm thấy giao dịch của bạn.');
    return iot.nhanTin({eventId:randomUUID(),subjectId,vehicleId:row.vehicle_id,kind,spotId,...(kind==='PLUGGED'&&{distanceKm:1.5})},process.env.IOT_KEY);
  },{properties:{subjectId:uuid,kind:{enum:['UNPLUGGED','PLUGGED']},spotId:idSchema},required:['subjectId','kind']});
  const extra=prototype(pool,undefined,tripHooks);
  const timestamp={type:'string',format:'date-time'};
  route('POST','/api/parking',req=>extra.reserveParking(req.user,req.body),{properties:{vehicleId:idSchema,hubId:idSchema,startsAt:timestamp,durationMinutes:{type:'integer',minimum:1,maximum:1440}}});
  route('GET','/api/parking',req=>extra.parking(req.user));
  route('PUT','/api/parking/:id',req=>extra.changeParking(req.user,req.params.id,req.body),{params:uuid,properties:{hubId:idSchema,cancel:{type:'boolean'}},required:[]});
  route('PUT','/api/reservations/:id/destination',req=>extra.changeDestination(req.user,req.params.id,req.body.hubId),{params:uuid,properties:{hubId:idSchema}});
  route('GET','/api/me/preferences',req=>extra.preferences(req.user));
  route('PUT','/api/me/preferences',req=>extra.preferences(req.user,req.body),{properties:{theme:{enum:['light','dark']},language:{enum:['vi','en']},fontSize:{enum:['small','medium','large']}}});
  app.get('/api/me/history',{preHandler:auth,schema:{querystring:{type:'object',additionalProperties:false,properties:{type:{enum:['ALL','TRIP','RESERVATION','PARKING','CHARGING']},from:timestamp,to:timestamp}}}},req=>extra.history(req.user,req.query));
  route('GET','/api/admin/users',req=>extra.users(req.user));
  const accountProps={username:shortText,name:shortText,role:{enum:['STUDENT','ADMIN','OPERATIONS','TECHNICIAN']},studentCode:shortText,password:{type:'string',minLength:8,maxLength:256},active:{type:'boolean'},version:{type:'integer',minimum:1}};
  route('POST','/api/admin/users',req=>extra.saveUser(req.user,null,req.body),{properties:accountProps,required:['username','name','role','password']});
  route('PUT','/api/admin/users/:id',req=>extra.saveUser(req.user,req.params.id,req.body),{params:uuid,properties:accountProps,required:['username','name','role','active','version']});
  route('GET','/api/admin/hubs',req=>extra.hubConfigs(req.user));
  route('PUT','/api/admin/hubs/:id',req=>extra.saveHub(req.user,req.params.id,req.body),{params:idSchema,properties:{capacity:{type:'integer',minimum:0,maximum:500},chargingCount:{type:'integer',minimum:0,maximum:100},chargingRate:{type:'number',exclusiveMinimum:0,maximum:100},version:{type:'integer',minimum:1},confirmed:{type:'boolean'},reset:{type:'boolean'}},required:['version','confirmed']});
}
