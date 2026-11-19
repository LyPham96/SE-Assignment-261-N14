import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createPool } from '../server/src/db.mjs';
import { migrate } from '../server/src/migrate.mjs';
import { seed } from '../server/src/seed.mjs';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/dist/index.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/^\/pikepike_(test|e2e_[a-f0-9]{32})$/.test(new URL(databaseUrl).pathname)) {
  throw new Error('Use a disposable pikepike_test or pikepike_e2e_<hex uuid> database.');
}
const pool = createPool(databaseUrl);
let app, vite, browser;
try {
  await migrate(databaseUrl);
  await runner({ databaseUrl, dir: fileURLToPath(new URL('../server/migrations/',import.meta.url)), migrationsTable:'pgmigrations', direction:'up',count:Infinity });
  await seed(pool);
  app = await createServer(pool);
  await app.listen({host:'127.0.0.1',port:3002});
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174','--strictPort'],{
    env:{...process.env,API_TARGET:'http://127.0.0.1:3002'},windowsHide:true,stdio:'pipe',
  });
  let ready=false;
  for(let i=0;i<40;i++){
    ready=await fetch('http://127.0.0.1:5174/api/health').then(response=>response.ok,()=>false);
    if(ready)break;
    await delay(250);
  }
  assert(ready,'Vite proxy did not become ready');
  const channel=process.env.BROWSER_CHANNEL??(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')?'msedge':undefined);
  browser=await chromium.launch({channel});
  const student=await browser.newPage();
  const operator=await browser.newPage();
  const errors=[];
  for(const page of [student,operator])page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:5174';
  async function login(page,username,screen){
    await page.goto(base);
    await page.getByLabel('Tài khoản').fill(username);
    await page.getByLabel('Mật khẩu').fill('PikePike2026!');
    await page.locator('.scroll').getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await page.waitForURL(new RegExp('screen='+screen));
  }
  await login(student,'student@pikepike.vn','home');
  await student.locator('nav.bottom-nav').getByRole('button',{name:'Sạc xe'}).click();
  await student.getByText('Chưa có xe cá nhân đã duyệt.').waitFor();
  await student.goto(base+'/?screen=vehicle');
  await student.getByLabel('Hub nhận xe').selectOption('metro');
  await student.locator('.card').filter({has:student.getByRole('heading',{name:'Pike City 01',exact:true})}).getByRole('button',{name:'Chọn xe này'}).click();
  await student.getByLabel('Hub trả xe dự kiến').selectOption('ktx');
  await student.locator('.scroll').getByRole('button',{name:'Xác nhận đặt xe'}).click();
  await student.waitForURL(/screen=reservations/);
  await student.reload();
  await student.locator('.scroll').getByText('Đã giữ xe',{exact:true}).waitFor();
  await login(operator,'operations@pikepike.vn','dashboard');
  async function verifyVehicle(status) {
    const result=await operator.request.get(base+'/api/v1/dashboard');
    assert.equal(result.status(),200);
    const rows=await result.json();
    assert.equal(rows.flatMap(row=>row.vehicles).find(item=>item.id==='PK-1').status,status);
  }
  await verifyVehicle('RESERVED');
  await student.locator('.scroll').getByRole('button',{name:'Hủy đặt chỗ',exact:true}).click();
  await student.getByRole('button',{name:'Xác nhận hủy đặt chỗ'}).click();
  await student.waitForURL(/screen=reservations/);
  await verifyVehicle('AVAILABLE');
  await pool.query('UPDATE hub SET "expectedDemand"=2 WHERE id=$1',['ktx']);
  const command={sourceHubId:'metro',destHubId:'ktx',vehicleIds:['PK-2'],confirmed:true,idempotencyKey:'unified-e2e'};
  const rejected=await operator.request.post(base+'/api/v1/rebalancing/orders',{data:command});
  assert.equal(rejected.status(),403);
  const order=await operator.request.post(base+'/api/v1/rebalancing/orders',{headers:{'X-PikePike-Request':'1'},data:command});
  assert.equal(order.status(),201,await order.text());
  const catalog=await student.request.get(base+'/api/hubs/metro/vehicles');
  const moved=(await catalog.json()).find(item=>item.id==='PK-2');
  assert.equal(moved.status,'DANG_DIEU_CHUYEN');
  assert.equal(moved.eligible,false);
  assert.deepEqual(errors,[]);
  console.log('PASS: original UI login, shared session, M2 booking + reload + cancellation, M4 order visible in M2');
} finally {
  await browser?.close();
  vite?.kill();
  await app?.close();
  await pool.end();
}
