# Đối chiếu phạm vi prototype

Đối chiếu UC-01–UC-27 trong tài liệu đề tài tại workspace. Mức kiểm chứng: prototype web có dữ liệu bền và IoT giả lập.

| UC | Chức năng | Đường vào / hiện thực |
|---|---|---|
| 01 | Đăng nhập, phiên, khóa đăng nhập, đăng xuất | Đăng nhập; `service.mjs`, cookie HttpOnly/PostgreSQL |
| 02 | Hồ sơ, khai báo và duyệt xe cá nhân | Cài đặt; `remaining.mjs`, kiểm phiên bản duyệt |
| 03 | Giao diện, ngôn ngữ, cỡ chữ | Cài đặt; `/api/me/preferences`, lưu theo tài khoản |
| 04 | Lịch sử, bộ lọc và chi tiết | Cài đặt → Lịch sử; `/api/me/history`, chỉ dữ liệu của mình |
| 05 | Tìm Hub và xem tài nguyên | Trang chủ, Hub/xe; `student-screens.tsx` |
| 06 | Kiểm tra tài nguyên | Giao dịch có khóa cho đặt chỗ; `KiemTraTaiNguyen` cho sạc/mô phỏng |
| 07 | Đặt xe | Chọn xe → xác nhận; `service.reserve` |
| 08 | Đặt chỗ đỗ cá nhân | Cài đặt → Đặt chỗ đỗ; `/api/parking` |
| 09 | Đăng ký sạc | Sạc xe; `ChargingService` |
| 10 | Sửa/hủy đặt chỗ | Đặt chỗ của tôi, Cài đặt → Sửa đặt chỗ; chuyển giữ chỗ nguyên tử |
| 11 | Nhận xe | Mã mở khóa riêng, xác nhận cáp qua IoT; `DieuKhienChuyenDi` |
| 12 | Trả xe/kết thúc chuyến | Chuyến đi → Trả xe / báo hỏng; phí/quãng đường/yêu cầu sạc/thu hồi |
| 13 | Báo sự cố | Báo sự cố / chuyến đi; `IncidentService` |
| 14 | Giám sát mạng | Dashboard/tài nguyên, polling 5 giây |
| 15 | Cảnh báo quá tải | `DichVuCanhBao`, ngưỡng 85/95%, không nâng mức từ nguồn cũ |
| 16 | Lập lịch sạc | Lịch sạc; `ChargingService.lapLich`, ràng buộc chống chồng tại DB |
| 17 | Điều chuyển | Điều phối; đề xuất/tạo/phân công/hoàn tất/báo xe hỏng |
| 18 | Xử lý sự cố | Vận hành phân công → kỹ thuật ghi kết quả → vận hành kết luận |
| 19 | Báo cáo vận hành | Báo cáo theo Hub và thời gian |
| 20 | Kịch bản | What-if: mẫu, tạo/sửa có phiên bản, nhân bản |
| 21 | Chạy mô phỏng | Worker, snapshot/seed, tiến độ, hủy và timeout |
| 22 | Kết quả/so sánh | Kết quả; chỉ so sánh cùng snapshot |
| 23 | Áp dụng khuyến nghị | Xem trước/xác nhận; kiểm lại live, chống áp dụng trùng |
| 24 | IoT | API thiết bị có khóa; demo cùng hợp đồng, nhãn dữ liệu cũ/mất tín hiệu |
| 25 | Quét hết hạn | `BoDinhThoi`, giải phóng, hai no-show khóa đặt 24 giờ |
| 26 | Quản lý tài khoản | Cài đặt quản trị; tạo/sửa/vai trò/khóa/kích hoạt, phiên bản và thu hồi phiên |
| 27 | Cấu hình Hub | Cài đặt quản trị; sức chứa/cổng/tốc độ, mặc định, phiên bản/xác nhận |

## Kiểm chứng tự động

- `server/test/demo.test.mjs`: đăng nhập/phiên, tranh chấp xe/chỗ, quyền/CSRF, rollback, pin/lấp đầy, hết hạn/no-show, seed lặp.
- `server/test/prototype.test.mjs`: chỗ đỗ đã duyệt, chống đặt trùng giữa hai loại, đổi Hub/rollback, lịch sử riêng tư, tùy chọn qua phiên mới, quản trị tài khoản/Hub.
- `server/src/operations.test.ts`: sạc/sự cố/bản tin cũ, điều chuyển, snapshot tái lập, áp dụng lũy đẳng.
- `server/src/http.integration.test.ts`: PostgreSQL thật, tranh chấp yêu cầu sạc và chống chồng phiên.
- `scripts/demo-e2e.mjs`: nhiều vai trò trên trình duyệt, hồ sơ/duyệt xe, chỗ đỗ, sạc, đặt xe, điều chuyển, cáp demo, báo hỏng, lịch sử, worker What-if và khuyến nghị.

Test bao phủ luồng/ràng buộc chính, không đồng nghĩa từng test case trong báo cáo hoặc mọi NFR đều đã được nghiệm thu. Chưa kiểm tải 200 phiên, benchmark đầy đủ, Android/camera/IoT thật hay push notification. Mẫu SC-02–SC-04, trọng số sạc, dự báo nhu cầu và biểu phí dùng mặc định demo trong `server/README.md` / `.env.example`.

Lượt xác minh ngày 20/11/2026: frontend/backend build đạt; 20 test M1/M2 và 8 test M3/M4/PostgreSQL đạt, không skip; E2E trình duyệt đạt, bao gồm quản trị tài khoản/cấu hình Hub và worker What-if. Docker/Android chưa được chạy trong lượt này.
