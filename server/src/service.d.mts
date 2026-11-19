import type {Pool} from 'pg';
export class BoDieuKhienXacThuc {
  static create(pool:Pool):Promise<M1M2Service>;
  constructor(service:M1M2Service);
  kiemTraPhien(token:string):Promise<{id:string; role:string}>;
}
export type M1M2Service = {expire():Promise<void>};
export class BoDinhThoi {
  constructor(service:M1M2Service,onError:(error:unknown)=>void);
  start():void;
  stop():void;
}
