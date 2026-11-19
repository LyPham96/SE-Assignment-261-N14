import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import type {M1M2Service} from './service.mjs';
export function registerM1M2Routes(app:FastifyInstance,options:{pool:Pool;service:M1M2Service;secureCookies?:boolean}):Promise<void>;
