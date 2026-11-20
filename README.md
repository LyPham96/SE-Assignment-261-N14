# PikePike — Smart E-Mobility Hub

Ứng dụng Android cho hệ thống điều phối phương tiện điện ĐHQG-HCM. Luồng chạy chính: **Docker API server → PostgreSQL Neon dùng chung → app Android**. Client React/TypeScript được đóng gói trong APK bằng Capacitor 7; không cần bật website/Vite để dùng app.

## 1. Chuẩn bị sau khi clone

```sh
git clone https://github.com/LyPham96/SE-Assignment-261-N14.git
cd SE-Assignment-261-N14
npm ci
```

Cài các công cụ sau:

| Công cụ | Phiên bản / thành phần |
|---|---|
| Node.js | 24.x, kèm npm |
| Docker Desktop / Docker Engine | Có Docker Compose v2; trên Windows bật Docker Desktop ở chế độ Linux containers |
| Java | **JDK 21**, đặt `JAVA_HOME` tới thư mục JDK |
| Android Studio + Android SDK | SDK Platform **Android 15 / API 35**, Build-Tools **35.0.0**, Platform-Tools (`adb`) |
| Thiết bị | Emulator API 35 trong Android Studio, hoặc điện thoại Android 6.0/API 23 trở lên có USB debugging |

Trong Android Studio: **Tools → SDK Manager** để cài các SDK ở trên; **Tools → Device Manager → Create Virtual Device** để tạo emulator API 35. Dùng JDK 21 cho project; không dùng JDK 17 hoặc JDK 24/25 với Gradle wrapper hiện tại.

Sao chép file cấu hình, tại thư mục gốc repo:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
$env:JAVA_HOME='C:\duong-dan-toi\jdk-21'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
java -version
adb version
```

Thay `JAVA_HOME` bằng đường dẫn JDK 21 trên máy. Android Studio cũng có thể tạo `android/local.properties` chứa `sdk.dir` khi mở project `android/` lần đầu.

```sh
# macOS / Linux
cp .env.example .env
export JAVA_HOME=/path/to/jdk-21
# Android SDK: macOS thường là $HOME/Library/Android/sdk;
# Linux thường là $HOME/Android/Sdk. Chọn đúng đường dẫn máy mình.
export ANDROID_HOME=$HOME/Android/Sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
java -version
adb version
```

## 2. Build và chạy Docker server trước

### Database mặc định: Neon của đề án

`.env.example` đã có kết nối dưới đây. Sau khi sao chép thành `.env`, có thể dùng ngay, không cần cài PostgreSQL trên máy và không cần tạo database khác.

```dotenv
# Postgres — your database connection
DATABASE_URL="postgresql://neondb_owner:npg_KeCZ90lwAOpP@ep-cool-term-bio3riqq.c-5.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL_POOLED="postgresql://neondb_owner:npg_KeCZ90lwAOpP@ep-cool-term-bio3riqq-pooler.c-5.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

API_BIND_HOST=0.0.0.0
API_PORT=3000
COOKIE_SECURE=false
IOT_KEY=pikepike-local-demo-device-key
DEMO_IOT=true
USE_REAL_IOT=false
ANDROID_API_BASE_URL=http://10.0.2.2:3000
VITE_API_BASE_URL=
CORS_ORIGINS=https://localhost
```

- `DATABASE_URL`: kết nối **direct**, dùng cho migration và khởi tạo dữ liệu. Có thể dùng URL này trong pgAdmin/DBeaver/psql để xem database.
- `DATABASE_URL_POOLED`: kết nối **pooler**, dùng cho API và worker. Nếu dùng PostgreSQL riêng không có pooler, đặt hai biến bằng cùng URL.
- Chỉ server truy cập PostgreSQL. APK gọi API trên cổng 3000; database URL không được nhúng vào APK.
- Đây là database dùng chung: dữ liệu đặt xe/sạc/cấu hình thay đổi từ một client sẽ xuất hiện trên các client khác.

Tại thư mục gốc, khi Docker Desktop đã chạy:

```sh
docker compose up --build -d --wait --wait-timeout 180 api
docker compose ps
docker compose logs init
```

Lệnh này build image API; container `init` tự chạy migration M3/M4, migration M1/M2 và seed tài khoản/tài nguyên, rồi container `api` mới khởi động. `init` kết thúc với mã **0/Exited (0)** là thành công, không phải lỗi. Không cần chạy migration/seed bằng tay.

Kiểm tra server trước khi build app:

```powershell
# PowerShell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

```sh
# macOS / Linux, hoặc curl.exe trên Windows
curl --fail http://127.0.0.1:3000/api/health
```

Kết quả mong đợi: `{"status":"ok"}`. Nếu chưa chạy được, xem `docker compose logs init api`. Máy cần Internet để tải image/npm packages và kết nối Neon; lần đầu có thể mất vài phút. Nếu quá thời gian chờ, kiểm tra log và chạy lại lệnh `up` sau khi mạng ổn định.

Giữ Docker server chạy trong khi dùng app. Dừng khi không dùng: `docker compose down` (không xóa dữ liệu Neon).

## 3. Build APK và chạy Android client

### 3.1. Chạy trên Android emulator — mặc định

Mở emulator API 35 trong Android Studio. Giữ dòng sau trong `.env`:

```dotenv
ANDROID_API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` là địa chỉ để Android emulator truy cập máy đang chạy Docker. Không đặt `localhost` cho trường hợp này.

Từ thư mục gốc repo:

```sh
npm run android:build
```

Script kiểm tra JDK/SDK, build TypeScript/giao diện với đúng API URL, chạy Capacitor sync, rồi Gradle `assembleDebug`. Script chạy được trên Windows, macOS và Linux; không cần cài Gradle riêng. Lần đầu Gradle tải các dependencies qua Internet.

APK debug đã được ký để cài thử nằm tại:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Cài và mở app:

```sh
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n vn.pikepike.app/.MainActivity
```

Nếu có nhiều thiết bị, dùng `adb -s <device-id> ...` cho thiết bị muốn cài. Chỉ cần Docker API và APK; **không chạy `npm run dev`**.

Có thể mở project bằng `npm run android:open` rồi bấm Run trong Android Studio. Sau mỗi lần đổi source hoặc `ANDROID_API_BASE_URL`, chạy `npm run android:sync` trước khi Run; lệnh này build và đồng bộ client nhưng chưa tạo APK.

### 3.2. Điện thoại thật qua USB

Bật Developer options → USB debugging, cắm USB, chấp nhận thông báo cho phép debug. Đổi trong `.env`:

```dotenv
ANDROID_API_BASE_URL=http://127.0.0.1:3000
```

Sau đó:

```sh
npm run android:build
adb reverse tcp:3000 tcp:3000
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n vn.pikepike.app/.MainActivity
```

`adb reverse` chuyển cổng 3000 của điện thoại về Docker API trên máy tính. Chạy lại lệnh này sau khi rút/cắm USB hoặc khởi động lại thiết bị.

### 3.3. Điện thoại thật qua Wi‑Fi

Điện thoại và máy chạy Docker phải cùng mạng. Xem IPv4 của máy bằng `ipconfig` (Windows) hoặc cấu hình mạng của hệ điều hành. Ví dụ máy có IP `192.168.1.10`, đặt:

```dotenv
ANDROID_API_BASE_URL=http://192.168.1.10:3000
```

Chạy lại `npm run android:build`, cài APK như trên. Cho phép kết nối cổng TCP 3000/Docker qua firewall; thử mở `http://192.168.1.10:3000/api/health` trên trình duyệt điện thoại trước. Cách này không cần `adb reverse` khi sử dụng app.

APK debug cho phép HTTP để kết nối Docker trong mạng demo. Giao diện nằm sẵn trong APK, HTTP native của Capacitor xử lý API/cookie phiên. Bản phát hành ngoài phạm vi bài nộp cần API HTTPS và cấu hình ký release riêng.

### 3.4. Đăng nhập và thử chức năng

Mật khẩu chung cho các tài khoản demo: **`PikePike2026!`**.

| Tài khoản | Vai trò |
|---|---|
| student@pikepike.vn | Sinh viên |
| student2@pikepike.vn | Sinh viên thứ hai |
| admin@pikepike.vn | Quản trị viên |
| operations@pikepike.vn | Vận hành |
| technician@pikepike.vn | Kỹ thuật |

Seed tạo ba Hub (Metro, KTX, Bách Khoa), bốn xe dùng chung tại Metro và hai cổng sạc/Hub. Có thể tạo thêm tài khoản trong Cài đặt của quản trị viên. Mỗi tài khoản chỉ có một phiên đăng nhập; dùng tài khoản khác nhau khi demo đồng thời trên nhiều thiết bị.

- **M1:** Cài đặt → hồ sơ/khai báo xe; quản trị duyệt xe, quản lý tài khoản/cấu hình Hub. Có sáng/tối, Việt/Anh, cỡ chữ và lịch sử sử dụng.
- **M2:** Chọn xe → đặt → Đặt chỗ của tôi → Nhận xe → xem/nhập mã → Nhận xe lần đầu để gửi lệnh mở khóa → **Demo: mô phỏng rút cáp** → Nhận xe lại. Trả xe → chọn chỗ → **Demo: mô phỏng cắm cáp** → xác nhận trả. Có sửa/hủy đặt chỗ và chỗ đỗ xe cá nhân đã duyệt.
- **M3:** Đăng ký/lập lịch sạc, giám sát/cảnh báo, báo sự cố → giao kỹ thuật → ghi kết quả → vận hành kết luận. Xe trả pin dưới 30% tự tạo yêu cầu sạc.
- **M4:** Điều chuyển → kỹ thuật hoàn tất; tạo/lưu/nhân bản kịch bản → chạy/hủy What-if → xem/so sánh cùng snapshot → xem trước/xác nhận áp dụng khuyến nghị; báo cáo theo Hub/thời gian.

Demo dùng mã mở khóa và IoT giả lập, thông báo trong ứng dụng; phí mặc định bằng 0 (`TRIP_*`). Không cần camera QR hay khóa/cáp thật để chạy bài demo.

## 4. Tùy chọn: giao diện web/WebView để debug

Phần này không bắt buộc cho luồng Docker server → Android app ở trên.

### Debug giao diện trong trình duyệt

Dùng cùng server/database, bật thêm container phục vụ giao diện:

```sh
docker compose --profile debug up --build -d --wait --wait-timeout 180 web
```

Mở http://127.0.0.1:8080. Nginx proxy `/api` đến container API, nên không sửa URL client cho bản trình duyệt.

Hoặc phát triển giao diện bằng Vite, trong khi Docker API vẫn chạy:

```sh
npm run dev
```

Mở http://127.0.0.1:5173. Giữ `VITE_API_BASE_URL=` rỗng trong `.env` để Vite proxy đến API tại cổng 3000. `ANDROID_API_BASE_URL` chỉ được script Android sử dụng, không đổi địa chỉ của bản debug trình duyệt.

### Inspect WebView của app Android

Cắm USB, bật USB debugging, mở APK debug. Trong Chrome trên máy tính mở `chrome://inspect/#devices`, chọn **inspect** bên dưới PikePike để xem DOM/console. Xem log API bằng `docker compose logs -f api`. Giao diện Android vẫn là bản đóng gói trong APK.

## 5. Tùy chọn: thay Neon bằng PostgreSQL riêng

### PostgreSQL 17 chạy trong Docker

Repo có file override; không cần sửa source:

```sh
docker compose -f compose.yaml -f compose.postgres.yaml up --build -d --wait --wait-timeout 180 api
```

Dùng cùng hai tham số `-f` cho các lệnh `ps`, `logs`, `down` và `--profile debug ... web` về sau. Override này thay URL cho cả `init` và `api`, đồng thời tạo PostgreSQL 17 với volume `pgdata`; không sử dụng Neon.

Kết nối từ máy tính:

```dotenv
DATABASE_URL="postgresql://pikepike:pikepike_demo_2026@127.0.0.1:5432/pikepike"
DATABASE_URL_POOLED="postgresql://pikepike:pikepike_demo_2026@127.0.0.1:5432/pikepike"
```

Đây là URL cho công cụ truy cập từ máy tính; bên trong containers, override dùng host `db`. Mật khẩu lấy từ `POSTGRES_PASSWORD` trong `.env`. Nếu cổng 5432 đang bị chiếm, đổi cổng publish trong `compose.postgres.yaml`. `docker compose ... down` giữ dữ liệu trong volume; chỉ thêm `-v` khi muốn xóa database local.

### PostgreSQL tự quản lý ở nơi khác

Tạo database trống và tài khoản có quyền tạo bảng/extension `btree_gist`. Đổi `DATABASE_URL` và `DATABASE_URL_POOLED` trong `.env`; không có pooler thì dùng cùng URL. Chạy lại lệnh Docker ở mục 2. Nếu PostgreSQL chạy ngay trên host Docker Desktop, URL trong container dùng `host.docker.internal` thay `127.0.0.1`. Trên Linux có thể dùng IP mà container truy cập được.

App Android vẫn gọi Docker API; không cần đổi `ANDROID_API_BASE_URL` khi chỉ thay database.

## 6. Kiểm thử và cấu trúc

- [Đối chiếu UC-01–27 và phạm vi kiểm chứng](PROTOTYPE-COVERAGE.md).
- [Chi tiết backend/API](server/README.md); OpenAPI: http://127.0.0.1:3000/api/v1/openapi.json.
- CI **Docker server and Android client** build Docker image, khởi tạo PostgreSQL riêng, build APK và kiểm tra app trên emulator API 35. APK nằm trong artifact `pikepike-debug-apk` của mỗi lần chạy thành công.
- CI **Prototype M1-M4** kiểm tra nghiệp vụ/PostgreSQL và E2E giao diện.

Để chạy test local, dùng database test riêng; **không dùng Neon dùng chung ở mục 2** vì test có thao tác xóa dữ liệu:

```powershell
$env:TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/pikepike_test'
npm run verify
```

Bash: dùng `export TEST_DATABASE_URL=...`. Tên được chấp nhận là `pikepike_test` hoặc `pikepike_test_<32 ký tự hex>`. E2E cần database trống mới tên `pikepike_e2e_<32 ký tự hex>`, đổi biến này rồi chạy `npx playwright install chromium` và `npm run test:e2e`.

`mockups/` là ảnh thiết kế; `public/images/`, icon/splash Android là tài nguyên cần cho ứng dụng.

Tham khảo công cụ: [Capacitor 7 / JDK 21](https://capacitorjs.com/docs/v7/updating/7-0), [Capacitor native HTTP](https://capacitorjs.com/docs/v7/apis/http).
