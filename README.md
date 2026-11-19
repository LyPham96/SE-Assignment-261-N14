# PikePike

Sau khi ghép M1–M2 và M3–M4, mở `/` để vào giao diện vận hành ban đầu, hoặc `/?mode=m1-m2` để vào giao diện đăng nhập và đặt xe của M1–M2. Xem [hướng dẫn dựng hai API và hai cơ sở dữ liệu](server/README.md).

## Cài đặt giao diện và ngôn ngữ

Bấm bánh răng trên thanh đầu trang để mở hồ sơ tài khoản và Cài đặt. Chế độ Sáng/Tối và Việt/Anh áp dụng cho toàn bộ app, ghi nhớ bằng localStorage. Không thêm nghiệp vụ thanh toán.

Xuất đầy đủ 25 màn hình trong 4 tổ hợp (100 PNG có khung iPhone 14 Pro):
```sh
node scripts/preferences-mockups.mjs
```
Chạy dev server trước khi xuất. Mở `mockups/preferences.html` để duyệt Light–VI, Light–EN, Dark–VI và Dark–EN; ảnh so sánh Cài đặt tại `mockups/00-settings-variants.png`.

Mockup tương tác Smart E-Mobility Hub, React + TypeScript, lấy hướng thiết kế từ ảnh tham chiếu: nền xanh nhạt–kem, thẻ trắng bo tròn, cam chủ đạo, thanh điều hướng nổi.

## Chạy
```sh
npm install
npm run dev
```
Mở http://127.0.0.1:5173. Các màn hình vận hành lấy vai trò từ phiên do máy chủ xác thực. Dựng backend theo hướng dẫn ở trên trước khi dùng các chức năng gọi API.

## Kiểm tra / chụp ảnh
```sh
npm run build
npx playwright install chromium
npm run screenshots
```
Chạy dev server trước khi chụp. Ảnh có khung điện thoại lưu trong `mockups/`. Script kiểm tra luồng đặt–nhận–trả xe và What-if–áp dụng khuyến nghị. Mã mở khóa demo: **248012**.

## Android
```sh
npm run android:sync
npm run android:open
```
Project `android/` đã được tạo và đồng bộ. Cần Android Studio và Android SDK để build APK. Capacitor đóng gói giao diện TypeScript trong ứng dụng Android; đây không phải React Native. QR hiện là khung minh họa, dùng mã demo để mở khóa. Camera, IoT, xác thực, thông báo và backend chưa được tích hợp. Các tương tác là dữ liệu mô phỏng trong bộ nhớ, tải lại trang sẽ khôi phục dữ liệu mẫu.

## Phạm vi
24 màn hình đúng các nhóm: đăng nhập/vai trò; Hub/tài nguyên; đặt xe; đặt chỗ đỗ; đăng ký sạc; quản lý đặt chỗ/QR/chuyến đi/trả xe/báo sự cố; dashboard/tài nguyên/cảnh báo; xử lý sự cố/lịch sạc; điều chuyển; What-if và xác nhận áp dụng. Không bổ sung hồ sơ, lịch sử, báo cáo thống kê hay cấu hình quản trị.
