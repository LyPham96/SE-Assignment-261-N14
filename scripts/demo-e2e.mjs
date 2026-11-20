import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createPool } from '../server/src/db.mjs';
import { migrate } from '../server/src/migrate.mjs';
import { seed } from '../server/src/seed.mjs';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/^\/pikepike_(test|e2e_[a-f0-9]{32})$/.test(new URL(databaseUrl).pathname)) {
  throw new Error('Use a disposable pikepike_test or pikepike_e2e_<hex uuid> database.');
}
const pool = createPool(databaseUrl);
const iotKey='pikepike-e2e-device-key';
process.env.IOT_KEY=iotKey;
let app, vite, browser;
try {
  await migrate(databaseUrl);
  await runner({ databaseUrl, dir: fileURLToPath(new URL('../server/migrations/',import.meta.url)), migrationsTable:'pgmigrations', direction:'up',count:Infinity });
  await seed(pool);
  const serverEnv={...process.env,DATABASE_URL:databaseUrl,PORT:'3002',HOST:'127.0.0.1',DEMO_IOT:'true',USE_REAL_IOT:'false',IOT_KEY:iotKey};
  await promisify(execFile)(process.execPath,['server/dist/seed.js'],{env:serverEnv,windowsHide:true});
  app = spawn(process.execPath,['server/dist/index.js'],{env:serverEnv,windowsHide:true,stdio:'ignore'});
  let apiReady=false;
  for(let i=0;i<80;i++){
    apiReady=await fetch('http://127.0.0.1:3002/api/health').then(response=>response.ok,()=>false);
    if(apiReady)break;await delay(250);
  }
  assert(apiReady,'API did not become ready');
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
  await student.goto(base+'/?screen=settings');
  await student.getByLabel('Thông tin liên hệ').fill('student@example.test');
  await student.getByRole('button',{name:'Lưu hồ sơ'}).click();
  await student.getByText('Đã cập nhật hồ sơ').waitFor();
  await student.getByLabel('Biển số').fill('59-E2E-01');
  await student.getByLabel('Mẫu xe').fill('Xe kiểm thử');
  await student.getByRole('button',{name:'Gửi khai báo'}).click();
  await student.getByText('Chờ duyệt',{exact:true}).waitFor();
  const admin=await browser.newPage();
  await login(admin,'admin@pikepike.vn','home');
  await admin.goto(base+'/?screen=settings');
  await admin.getByRole('button',{name:'Duyệt xe',exact:true}).click();
  await admin.getByText('Đã duyệt',{exact:true}).waitFor();
  await student.goto(base+'/?screen=parking');
  await student.getByLabel('Thời gian đến').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
  await student.getByRole('button',{name:'Xác nhận đặt chỗ đỗ',exact:true}).click();
  await student.getByText('Đã lưu thay đổi',{exact:true}).waitFor();
  const parking=(await (await student.request.get(base+'/api/parking')).json())[0];
  assert.equal(parking.status,'DA_XAC_NHAN');
  const cancelled=await student.request.put(base+'/api/parking/'+parking.id,{headers:{'X-PikePike-Request':'1'},data:{cancel:true}});
  assert.equal(cancelled.status(),200,await cancelled.text());
  const account=await student.request.get(base+'/api/v1/me');
  assert.equal((await account.json()).vehicles.length,1);
  await student.goto(base+'/?screen=charge');
  await student.locator('.scroll').getByRole('button',{name:'Gửi yêu cầu sạc'}).click();
  await student.getByText(/Đã tiếp nhận yêu cầu sạc/).waitFor();
  const booking=await student.request.post(base+'/api/reservations/shared',{headers:{'X-PikePike-Request':'1'},data:{vehicleId:'PK-1',destinationHubId:'ktx'}});
  assert.equal(booking.status(),201,await booking.text());
  const reservation=await booking.json();
  await student.goto(base+'/?screen=reservations');
  await student.locator('.scroll').getByRole('button',{name:'Nhận xe',exact:true}).click();
  await student.getByRole('button',{name:'Xem mã mở khóa'}).click();
  const code=await student.locator('.scroll p strong').textContent();
  await student.getByLabel('Mã mở khóa',{exact:true}).fill(code);
  await student.locator('.scroll').getByRole('button',{name:'Nhận xe',exact:true}).click();
  await student.getByText('Chưa nhận được xác nhận cáp sạc từ thiết bị.').waitFor();
  const iotHeaders={'x-iot-key':iotKey};
  const commands=await operator.request.get(base+'/api/iot/trip-commands/PK-1',{headers:iotHeaders});
  assert.equal((await commands.json())[0].reservation_id,reservation.id);
  const event=async data=>{
    const result=await operator.request.post(base+'/api/iot/trip-events',{headers:iotHeaders,data});
    assert.equal(result.status(),200,await result.text());
  };
  await student.getByRole('button',{name:'Demo: mô phỏng rút cáp'}).click();
  await student.getByText('Demo: đã rút cáp',{exact:true}).waitFor();
  await student.locator('.scroll').getByRole('button',{name:'Nhận xe',exact:true}).click();
  await student.waitForURL(/screen=trip/);
  await verifyVehicle('IN_USE');
  const trip=(await (await student.request.get(base+'/api/me/trips')).json())[0];
  await student.locator('.scroll').getByRole('button',{name:'Trả xe',exact:true}).click();
  await student.getByLabel('Chỗ trả xe').selectOption(reservation.destination_spot_id);
  await student.getByRole('button',{name:'Xác nhận trả xe'}).click();
  await student.getByText('Chưa nhận được xác nhận cáp sạc từ thiết bị.').waitFor();
  await student.getByRole('button',{name:'Demo: mô phỏng cắm cáp'}).click();
  await student.getByText('Demo: đã cắm cáp',{exact:true}).waitFor();
  await pool.query("UPDATE vehicles SET battery=25 WHERE id='PK-1'");
  await student.getByRole('button',{name:'Xác nhận trả xe'}).click();
  await student.getByRole('heading',{name:'Đã trả xe'}).waitFor();
  await verifyVehicle('AVAILABLE');
  assert(['CHO_XEP_LICH','DA_XEP_LICH','DANG_SAC'].includes((await pool.query("SELECT status FROM charging_request WHERE \"vehicleId\"='PK-1'")).rows[0].status));
  const another=await student.request.post(base+'/api/reservations/shared',{headers:{'X-PikePike-Request':'1'},data:{vehicleId:'PK-3',destinationHubId:'bk'}});
  assert.equal(another.status(),201,await another.text());
  const secondReservation=await another.json();
  const pickupPath=base+'/api/reservations/'+secondReservation.id;
  const secondCode=(await (await student.request.get(pickupPath+'/unlock-code')).json()).maMoKhoa;
  const pickup=()=>student.request.post(pickupPath+'/pickup',{headers:{'X-PikePike-Request':'1'},data:{maMoKhoa:secondCode}});
  assert.equal((await pickup()).status(),409);
  await event({eventId:'unplug-breakdown',subjectId:secondReservation.id,vehicleId:'PK-3',kind:'UNPLUGGED'});
  assert.equal((await pickup()).status(),200);
  await student.goto(base+'/?screen=trip');
  await student.getByRole('button',{name:'Báo xe hỏng dọc đường'}).click();
  await student.getByLabel('Vị trí sự cố').fill('Ga Metro');
  await student.getByLabel('Mô tả sự cố').fill('Xe không lên nguồn');
  await student.getByRole('button',{name:'Gửi báo cáo và kết thúc chuyến'}).click();
  await student.getByText(/Đã báo sự cố/).waitFor();
  assert.equal((await pool.query('SELECT status FROM trip_recovery_tasks')).rows[0].status,'PENDING');
  assert.equal((await pool.query("SELECT status FROM vehicles WHERE id='PK-3'")).rows[0].status,'HONG');
  await student.goto(base+'/?screen=history');
  await student.getByRole('heading',{name:'Lịch sử sử dụng',exact:true}).waitFor();
  await student.getByLabel('Loại hoạt động').selectOption('TRIP');
  await student.getByRole('button',{name:'Lọc lịch sử'}).click();
  await student.getByRole('button',{name:/TRIP · PK-1/}).waitFor();
  await admin.goto(base+'/?screen=hubConfig');
  await admin.getByRole('button',{name:'Ga Metro ĐHQG · 20 chỗ · 2 cổng',exact:true}).click();
  await admin.getByLabel('Số chỗ đỗ').fill('21');
  await admin.getByLabel('Tốc độ sạc (% / phút)').fill('3');
  if(process.env.E2E_SCREENSHOT_PATH) await admin.screenshot({path:process.env.E2E_SCREENSHOT_PATH,fullPage:true});
  admin.once('dialog',dialog=>dialog.accept());
  await admin.getByRole('button',{name:'Lưu cấu hình Hub',exact:true}).click();
  await admin.getByText('Đã lưu thay đổi',{exact:true}).waitFor();
  assert((await pool.query('SELECT rate FROM charging_point WHERE "hubId"=\'metro\' AND retired IS NOT TRUE')).rows.every(p=>p.rate===3));
  const reset=await admin.request.put(base+'/api/admin/hubs/metro',{headers:{'X-PikePike-Request':'1'},data:{version:2,confirmed:true,reset:true}});
  assert.equal(reset.status(),200,await reset.text());
  const hubs=await (await student.request.get(base+'/api/hubs')).json();
  assert.equal(hubs.find(h=>h.id==='metro').capacity,20);
  await admin.goto(base+'/?screen=accounts');
  await admin.getByLabel('Tên đăng nhập',{exact:true}).fill('e2e-operator@example.test');
  await admin.getByLabel('Tên tài khoản',{exact:true}).fill('E2E operator');
  await admin.getByLabel('Vai trò').selectOption('OPERATIONS');
  await admin.getByLabel('Mật khẩu khởi tạo / đặt lại').fill('PikePike2026!');
  admin.once('dialog',dialog=>dialog.accept());
  await admin.getByRole('button',{name:'Lưu tài khoản',exact:true}).click();
  await admin.getByText('Đã lưu thay đổi',{exact:true}).waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE username='e2e-operator@example.test'")).rows[0].n,1);
  const headers={'X-PikePike-Request':'1'};
  const post=async(path,data)=>{
    const response=await operator.request.post(base+'/api/v1'+path,{headers,data});
    assert(response.ok(),await response.text());return response.json();
  };
  const {scenario}=await post('/scenarios',{code:'E2E-DEMAND',hubIds:['bk'],eventType:'DEMAND_SURGE',intensity:20,durationMin:10,seed:42});
  const {runId}=await post('/scenarios/'+scenario.id+'/run',{expectedVersion:1});
  let result;
  for(let i=0;i<100;i++){
    result=await (await operator.request.get(base+'/api/v1/runs/'+runId)).json();
    if(result.run.status!=='RUNNING')break;await delay(200);
  }
  assert.equal(result.run.status,'COMPLETED',JSON.stringify(result));
  await operator.goto(base+'/?screen=results');
  await operator.locator('label.field').filter({has:operator.locator('span').getByText('Lần chạy',{exact:true})}).locator('select').selectOption(runId);
  await operator.getByText('Hoàn tất',{exact:true}).first().waitFor();
  const recommendations=result.recommendations.map(item=>item.id);
  if(recommendations.length){
    await post('/runs/'+runId+'/preview',{recommendationIds:recommendations});
    await post('/runs/'+runId+'/apply',{recommendationIds:recommendations,confirmed:true});
    const repeated=await post('/runs/'+runId+'/apply',{recommendationIds:recommendations,confirmed:true});
    assert(repeated.rejectedWholePackage);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: login, profile, approval, parking, charging, booking, dispatch, demo cable pickup/return, breakdown, history, production simulation worker and idempotent recommendations');
} finally {
  await browser?.close();
  vite?.kill();
  app?.kill();
  await pool.end();
}
