import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createService, Problem } from './service.mjs';

const idSchema = { type: 'string', minLength: 1, maxLength: 80 };

export async function createApp({ pool, clock, fault, logger = false, secureCookies = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 16384 });
  const service = await createService(pool, clock, fault);
  await app.register(cookie);
  await app.register(swagger, { openapi: { info: { title: 'PikePike M1/M2 demo', version: '0.1.0' }, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'pikepike_session' } } } } });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Problem) return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error.validation) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra các trường nhập.' });
    if (['23505', '40P01', '40001'].includes(error.code)) return reply.code(409).send({ code: 'CONFLICT', message: 'Tài nguyên vừa thay đổi. Vui lòng tải lại và thử lại.' });
    request.log.error(error);
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  });
  app.addHook('onRequest', async request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers['x-pikepike-request'] !== '1') throw new Problem(403, 'CSRF_REJECTED', 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.');
  });
  const auth = async request => { request.user = await service.authenticate(request.cookies.pikepike_session); };
  const protectedSchema = { security: [{ session: [] }] };
  app.get('/api/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  app.post('/api/auth/login', { schema: { body: { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: { username: { type: 'string', minLength: 1, maxLength: 254 }, password: { type: 'string', minLength: 1, maxLength: 256 } } } } }, async (request, reply) => {
    const { token, user } = await service.login(request.body.username, request.body.password);
    reply.setCookie('pikepike_session', token, { path: '/api', httpOnly: true, sameSite: 'strict', secure: secureCookies });
    return { user };
  });
  app.get('/api/auth/me', { preHandler: auth, schema: protectedSchema }, async request => ({ user: request.user }));
  app.post('/api/auth/logout', { preHandler: auth, schema: protectedSchema }, async (request, reply) => {
    await service.logout(request.cookies.pikepike_session, request.user);
    reply.clearCookie('pikepike_session', { path: '/api' });
    return { success: true };
  });
  app.get('/api/hubs', { preHandler: auth, schema: protectedSchema }, () => service.hubs());
  app.get('/api/hubs/:id/vehicles', { preHandler: auth, schema: { ...protectedSchema, params: { type: 'object', required: ['id'], properties: { id: idSchema } } } }, request => service.vehicles(request.params.id));
  app.get('/api/me/reservations', { preHandler: auth, schema: protectedSchema }, request => service.reservations(request.user.id));
  app.post('/api/reservations/shared', { preHandler: auth, schema: { ...protectedSchema, body: { type: 'object', additionalProperties: false, required: ['vehicleId'], properties: { vehicleId: idSchema, destinationHubId: idSchema } } } }, async (request, reply) => {
    const result = await service.reserve(request.user.id, request.body.vehicleId, request.body.destinationHubId);
    return reply.code(201).send(result);
  });
  app.post('/api/reservations/:id/cancel', { preHandler: auth, schema: { ...protectedSchema, params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } } }, request => service.cancel(request.user.id, request.params.id));
  app.decorate('service', service);
  return app;
}
