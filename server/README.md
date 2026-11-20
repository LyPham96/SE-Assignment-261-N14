# Chạy PikePike M1–M4

Giao diện chính tại `/` đăng nhập bằng tài khoản và mật khẩu. Một Fastify phục vụ cả `/api` và `/api/v1`; cả hai dùng cùng cookie phiên M1 và một PostgreSQL. Đặt/hủy chỗ M2 xuất hiện ở dashboard M3. Điều chuyển M4 cập nhật đội xe và chỗ đỗ mà M2 đọc, trong cùng giao dịch.

## Chạy bản nộp: Docker server → Android client

Làm theo [README gốc](../README.md) từ mục 1 đến mục 3. `compose.yaml` dùng Neon được cấu hình sẵn: container `init` chạy `npm run setup -w server` bằng kết nối direct (migration + seed), rồi API/worker dùng kết nối pooled. Giao diện đóng gói sẵn trong APK; container `web` chỉ chạy khi chọn profile `debug`.

Để dùng PostgreSQL 17 local thay Neon, thêm `-f compose.yaml -f compose.postgres.yaml` như README gốc. Không cần chạy migration/seed thủ công khi dùng Docker.

## Chạy backend không dùng Docker (tùy chọn cho dev)

1. Yêu cầu Node.js 24, npm và PostgreSQL 17. Tạo `.env` từ `.env.example`; đặt `DATABASE_URL`. Dùng database mới cho lần chạy hợp nhất đầu tiên. Dữ liệu từ hai database cũ cần kế hoạch nhập riêng.
2. Chạy `npm ci`. Có thể giữ Neon trong `.env` hoặc dùng PostgreSQL riêng.
3. Chạy `npm run build -w server`, rồi `npm run setup -w server` để chạy cả hai bộ migration và seed.
4. Seed M1 tạo tài khoản thử theo `server/src/seed.mjs`; seed M3 tạo hai cổng sạc mỗi Hub và nhu cầu điều phối demo. Xe cá nhân được khai báo/duyệt qua Cài đặt.
5. Mở hai terminal chạy `npm run dev -w server` và `npm run dev`. Truy cập [PikePike](http://127.0.0.1:5173/).

API nghe cổng 3000. Native HTTP trong Capacitor dùng cookie jar Android cho phiên đăng nhập; APK debug cho phép HTTP đến Docker API. Kiểm thử Android nằm ở `android/app/src/androidTest/java/vn/pikepike/app/NativeLoginTest.java` và workflow `build-clients.yml`.

## Đối chiếu điểm gọi

| Use case | Điểm gọi trong code |
|---|---|
| UC-09/16 | `ChargingService.layThongTinSac`, `dangKySac`, `taoYeuCauSacTuDong`, `lapLich(maHub, nguCanh, maLanChay)`. UC-16 gọi `KiemTraTaiNguyen.kiemTraTaiNguyenKhaDung(loaiGD, maTaiNguyen, maHub, khungGio, maHubDich, nguCanh, maLanChay)` theo PDF trang 73. |
| UC-13/18 | `IncidentService.baoSuCo`, `layChiTietSuCo`, `tuChoiBaoCao`, `xacNhanVaPhanCong`, `capNhatKetQuaKhacPhuc`, `layKetQuaKhacPhuc`, `ketLuanKiemTra`; dùng `Database` và `NotificationService.gui`. |
| UC-14/15/24 | `MonitoringService.layTongQuanMangLuoi`, `capNhatKhiCoSuKien`; `DichVuCanhBao.quetQuaTai`, `dongCanhBao`; `IoTGateway` chuyển bản tin đến `ResourceService.xuLyBanTin`. |
| UC-17 | `RebalancingController.computeTransferCount`, `proposeTransfer`, `createOrder(cmd)`, `onVehicleBroken(orderId, vehicleId, reportedBy, description, location)`, `completeOrder(orderId, technicianId)`. |
| UC-19/20 | `ReportController.getOperationsReport`, `refreshReport`; `ScenarioController.listTemplates`, `createScenario`, `updateScenario`, `cloneScenario`. |
| UC-21/22 | `SimulationController.runScenario(scenarioId, expectedVersion, sharedSnapshotId)`, `cancelRun`, `getProgress`; `SimulationResultController.getRun`, `compareRuns`, `listRuns`. |
| UC-23 | `RecommendationController.previewImpact`, `applyRecommendations(runId, recommendationIds, confirmed, performedBy)`. Điều chuyển gọi `createOrder`; sạc gọi `lapLich` với `THAT` và `null`. |

Tên lớp và component theo `Class List.pdf`. Với các chữ ký khác nhau giữa bảng kiến trúc và mục thiết kế chi tiết trong `main.pdf`, bảng trên dùng tên và thứ tự tham số ở phần thiết kế chi tiết. Các lỗi nghiệp vụ được ánh xạ thành mã HTTP tại lớp API.

Các điểm vào M1/M2 đang chạy gồm `ManHinhChinh`, `ManHinhDangNhap`, `GiaoDienHub`, `BoDieuKhienXacThuc`, `LoginSession`, `DieuKhienDatCho`, `CSDLTaiNguyen` và `BoDinhThoi`. Các màn hình M3/M4 dùng tên boundary trong chính luồng giao diện. Một số tên entity của danh sách được biểu diễn bằng type TypeScript, như `Hub`, `Vehicle`, `ParkingSpot`, `Reservation` và `Trip`.

`StudentProfile` và `PrivateVehicle` chạy trong phần hồ sơ của giao diện chính. Xe cá nhân được quản trị duyệt theo phiên bản hồ sơ trước khi hiện trong đăng ký sạc M3. `DieuKhienChuyenDi` và `HeThongIoT` chạy trong luồng nhận/trả xe dùng chung. Chạy migration M1/M2 để tạo các bảng nghiệp vụ mới.

Trả xe pin dưới 30% gọi `ChargingService.taoYeuCauSacTuDong` trong cùng giao dịch. Báo hỏng dọc đường kết thúc chuyến, giải phóng chỗ đích và gọi `IncidentService.baoSuCo` để tạo sự cố kèm tác vụ thu hồi.

Thiết bị cần gửi `X-IoT-Key` khi lấy lệnh từ `GET /api/iot/trip-commands/:id` hoặc xác nhận `UNPLUGGED` / `PLUGGED` tại `POST /api/iot/trip-events`. Giao diện giữ nguyên trạng thái chuyến đi cho đến khi có tín hiệu phù hợp và cho phép xác nhận lại. Có thể cấu hình `TRIP_UNLOCK_FEE`, `TRIP_MINUTE_RATE` và `TRIP_KM_RATE` theo biểu phí; mặc định là 0. Luồng kiểm thử sử dụng bản tin thiết bị thử qua API. Chưa xác minh khóa/cáp thật hoặc quét QR qua camera.

## Kiểm thử và mặc định demo

- `npm run test -w server`. Để bật test PostgreSQL đa kết nối, đặt `TEST_DATABASE_URL` trỏ đến DB test riêng. Test tạo và dọn một schema riêng.
- Cấu hình repo dùng một khóa giao dịch PostgreSQL cho toàn mạng demo. Các migration thêm ràng buộc chống trùng yêu cầu/lệnh và chồng phiên sạc. Thông báo nội bộ lưu trong DB và đọc qua API thông báo.
- Nguồn dự báo điều chuyển là `Hub.expectedDemand` trong seed. Hub phụ được chọn theo khoảng cách cấu hình, rồi theo mã Hub khi đồng hạng. Điều hướng gửi cho người có đặt chỗ đang hoạt động tại Hub. SC-02 đến SC-04 và trọng số sạc mặc định là dữ liệu demo vì tài liệu chưa chốt giá trị. Chỉ bật `DEMO_IOT` để sinh bản tin giả trong môi trường thử.
