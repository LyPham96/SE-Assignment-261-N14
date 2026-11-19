# Chạy M3 và M4

Nhánh `m3-m4` dùng chung ứng dụng TypeScript cho web và Capacitor. Backend cung cấp REST JSON dưới `/api/v1`. Các màn hình M3/M4 trong giao diện PikePike tại `/` gọi trực tiếp API. Trang đăng nhập xác minh mã phiên bằng `GET /api/v1/me` và lấy vai trò từ server. Các luồng M1/M2 khác vẫn cần backend của phân hệ tương ứng.

## Chạy dev

Yêu cầu Node.js 24, npm, Docker Compose và PostgreSQL 17 (Compose có sẵn dịch vụ `db`).

1. Tạo `.env` từ `.env.example` và đặt mật khẩu dev cùng `IOT_KEY` nếu cần gửi bản tin thiết bị. Giữ `DATABASE_URL` đồng bộ với mật khẩu.
2. Chạy `npm ci`, `docker compose up -d db`, `npm run migrate -w server` và `npm run build -w server`.
3. Chạy `npm run seed -w server`. Lệnh tạo dữ liệu demo và in token một ngày cho `SV01`, `OP01`, `TECH01`. Chạy lại seed sẽ thay token demo.
4. Chạy `npm run dev -w server` và `npm run dev` trong hai terminal. Mở [PikePike](http://127.0.0.1:5173/) và nhập mã phiên tương ứng với vai trò cần thử. Kiểm tra API qua [OpenAPI](http://127.0.0.1:3000/api/v1/openapi.json).

Để chạy cả stack bằng Docker, dùng `docker compose up --build -d` rồi `docker compose exec api npm run seed -w server`. Web nghe trên cổng 8080. Android dùng `VITE_API_BASE_URL` tuyệt đối, build đồng bộ bằng `npm run android:sync` và đóng gói trong Android Studio. Backend thực của M1 và M2 kết nối vào cùng hợp đồng phiên, xe, chỗ đỗ, chuyến đi và giữ chỗ. Dữ liệu seed phục vụ thử M3/M4 độc lập.

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

## Kiểm thử và mặc định demo

- `npm run test -w server`. Để bật test PostgreSQL đa kết nối, đặt `TEST_DATABASE_URL` trỏ đến DB test riêng. Test tạo và dọn một schema riêng.
- Cấu hình repo dùng một khóa giao dịch PostgreSQL cho toàn mạng demo. Các migration thêm ràng buộc chống trùng yêu cầu/lệnh và chồng phiên sạc. Thông báo nội bộ lưu trong DB và đọc qua API thông báo.
- Nguồn dự báo điều chuyển là `Hub.expectedDemand` trong seed. Hub phụ được chọn theo khoảng cách cấu hình, rồi theo mã Hub khi đồng hạng. Điều hướng gửi cho người có đặt chỗ đang hoạt động tại Hub. SC-02 đến SC-04 và trọng số sạc mặc định là dữ liệu demo vì tài liệu chưa chốt giá trị. Chỉ bật `DEMO_IOT` để sinh bản tin giả trong môi trường thử.
