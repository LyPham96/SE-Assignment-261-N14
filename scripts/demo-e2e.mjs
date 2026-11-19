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
const iotKey='pikepike-e2e-device-key';
process.env.IOT_KEY=iotKey;
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
  await event({eventId:'unplug-e2e',subjectId:reservation.id,vehicleId:'PK-1',kind:'UNPLUGGED'});
  await student.locator('.scroll').getByRole('button',{name:'Nhận xe',exact:true}).click();
  await student.waitForURL(/screen=trip/);
  await verifyVehicle('IN_USE');
  const trip=(await (await student.request.get(base+'/api/me/trips')).json())[0];
  await student.locator('.scroll').getByRole('button',{name:'Trả xe',exact:true}).click();
  await student.getByLabel('Chỗ trả xe').selectOption(reservation.destination_spot_id);
  await student.getByRole('button',{name:'Xác nhận trả xe'}).click();
  await student.getByText('Chưa nhận được xác nhận cáp sạc từ thiết bị.').waitFor();
  await event({eventId:'plug-e2e',subjectId:trip.id,vehicleId:'PK-1',kind:'PLUGGED',spotId:reservation.destination_spot_id,distanceKm:1.5});
  await pool.query("UPDATE vehicles SET battery=25 WHERE id='PK-1'");
  await student.getByRole('button',{name:'Xác nhận trả xe'}).click();
  await student.getByRole('heading',{name:'Đã trả xe'}).waitFor();
  await verifyVehicle('AVAILABLE');
  assert.equal((await pool.query("SELECT status FROM charging_request WHERE \"vehicleId\"='PK-1'")).rows[0].status,'CHO_XEP_LICH');
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
  assert.deepEqual(errors,[]);
  console.log('PASS: shared UI login, profile, vehicle approval and charging, booking, dispatch, cable-confirmed pickup and return');
} finally {
  await browser?.close();
  vite?.kill();
  await app?.close();
  await pool.end();
}
