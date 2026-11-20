# PikePike — Smart E-Mobility Hub

Prototype web M1–M4: React/TypeScript, Fastify/Node.js 24, PostgreSQL 17 và Android qua Capacitor. Nghiệp vụ và phiên đăng nhập được lưu trong database dùng chung.

## Chạy bằng Docker Compose

Yêu cầu Node.js 24, npm và Docker Compose.

```sh
cp .env.example .env
npm ci
docker compose up --build -d
docker compose exec api npm run seed:m1-m2 -w server
docker compose exec api npm run seed -w server
```

PowerShell: dùng `Copy-Item .env.example .env`. Mở http://127.0.0.1:8080. Compose chạy cả hai bộ migration trước khi API khởi động. Seed chỉ dành cho demo, có thể khôi phục mặc định điều phối.

## Chạy với PostgreSQL cài sẵn

Cài Node.js 24, PostgreSQL 17; tạo database `pikepike` và tài khoản có quyền tạo bảng/extension `btree_gist`. Sao chép `.env.example` thành `.env`, sửa `DATABASE_URL`. Giữ `IOT_KEY` có giá trị để dùng nhận/trả xe.

```sh
npm ci
npm run db:migrate
npm run migrate -w server
npm run build -w server
npm run db:seed
npm run seed -w server
```

Mở hai terminal chạy `npm run dev -w server` và `npm run dev`. Truy cập http://127.0.0.1:5173.

## Tài khoản demo

Mật khẩu chung: `PikePike2026!`.

| Tài khoản | Vai trò |
|---|---|
| student@pikepike.vn | Sinh viên |
| student2@pikepike.vn | Sinh viên thứ hai để thử tranh chấp |
| admin@pikepike.vn | Quản trị viên |
| operations@pikepike.vn | Vận hành |
| technician@pikepike.vn | Kỹ thuật |

Seed tạo ba Hub (Metro, KTX, Bách Khoa), bốn xe tại Metro và hai cổng sạc mỗi Hub. Sinh viên khai báo xe cá nhân trong **Cài đặt**, quản trị viên duyệt xe trước khi đặt chỗ đỗ/đăng ký sạc.

## Luồng demo

- **M1:** Cài đặt → hồ sơ/khai báo xe; quản trị viên duyệt hoặc từ chối. Sáng/tối, Việt/Anh và cỡ chữ lưu theo tài khoản. Cài đặt có Lịch sử sử dụng với bộ lọc/chi tiết; quản trị có Quản lý tài khoản và Cấu hình Hub.
- **M2:** Chọn Hub → xe → xác nhận đặt → Đặt chỗ của tôi → Nhận xe → xem/nhập mã → Nhận xe. Lần gửi mã đầu tạo lệnh mở khóa; bấm **Demo: mô phỏng rút cáp**, rồi nhận xe lại. Khi trả, chọn chỗ → **Demo: mô phỏng cắm cáp** → xác nhận trả. Có sửa Hub trả/hủy đặt, chỗ đỗ cá nhân và báo hỏng dọc đường.
- **M3:** Dashboard/tài nguyên/cảnh báo, đăng ký/lập lịch sạc, phân công sự cố → kỹ thuật ghi kết quả → vận hành kiểm tra/đóng. Trả xe pin dưới 30% tạo yêu cầu sạc tự động. Nguồn demo cập nhật phiên sạc định kỳ.
- **M4:** Đề xuất/tạo/phân công điều chuyển → kỹ thuật hoàn tất; cấu hình/lưu/nhân bản kịch bản → chạy/hủy What-if → xem/so sánh cùng snapshot → xem trước/xác nhận áp dụng khuyến nghị. Báo cáo vận hành có bộ lọc Hub và khung giờ.

`DEMO_IOT=true` bật nút mô phỏng cáp. Khi tích hợp thiết bị, đặt `DEMO_IOT=false`, `USE_REAL_IOT=true` và khóa riêng; server chặn nút demo. Prototype dùng mã mở khóa thay camera QR; chưa nghiệm thu khóa/cáp thật, push notification hay Android trên máy thật. Thông báo nằm trong ứng dụng; phí mặc định 0, cấu hình qua `TRIP_*`.

## Kiểm thử

Tạo database riêng tên `pikepike_test` hoặc `pikepike_test_<32 ký tự hex>`. Test xóa dữ liệu trong database này.

```sh
# Bash
export TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/pikepike_test
# PowerShell: $env:TEST_DATABASE_URL='postgres://user:password@127.0.0.1:5432/pikepike_test'
npm run verify
```

E2E cần database rỗng riêng tên `pikepike_e2e_<32 ký tự hex>`. Đổi `TEST_DATABASE_URL` sang database đó rồi chạy:

```sh
npx playwright install chromium
npm run test:e2e
```

E2E tự chạy API/worker/Vite trên cổng 3002/5174 và dừng khi kết thúc. Dùng database E2E mới cho mỗi lần chạy. CI chạy build, test PostgreSQL và E2E trên main/m3-m4/zip-branch.

Xem [đối chiếu phạm vi](PROTOTYPE-COVERAGE.md) và [chi tiết backend](server/README.md). OpenAPI: `/api/v1/openapi.json`.

## Android

```sh
npm run android:sync
npm run android:open
```

Cần Android Studio/SDK. Emulator dùng backend truy cập được từ thiết bị (ví dụ `VITE_API_BASE_URL=http://10.0.2.2:3000` trong debug), cấu hình CORS/cookie rồi build/sync lại. Web là môi trường nghiệm thu prototype; Android cần kiểm tra WebView/cookie trên thiết bị trước khi nộp APK.

## Tài nguyên thiết kế

`mockups/` và script xuất ảnh phục vụ thiết kế. `public/images/`, icon và splash Android là tài nguyên ứng dụng cần giữ trong bản mã nguồn.
