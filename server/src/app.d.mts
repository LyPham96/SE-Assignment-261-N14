import type {FastifyInstance} from 'fastify';
import type {Pool, PoolClient} from 'pg';
import type {M1M2Service} from './service.mjs';
export function registerM1M2Routes(app:FastifyInstance,options:{
  pool:Pool;service:M1M2Service;secureCookies?:boolean;
  tripHooks?:{
    onLowBatteryReturn:(client:PoolClient,vehicleId:string,hubId:string)=>Promise<void>;
    onBreakdown:(client:PoolClient,userId:string,tripId:string,vehicleId:string,location:string,description:string)=>Promise<string>;
    onHubConfig:(client:PoolClient,hubId:string,config:{capacity:number;chargingCount:number;chargingRate:number})=>Promise<void>;
  };
}):Promise<void>;
