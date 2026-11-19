# Plan triển khai backend M3 và M4

Nguồn nghiệp vụ: `main.pdf` §2 (kiến trúc và hợp đồng tích hợp), §3.4–3.5 (thiết kế chi tiết), §4.4–4.5 (nghiệm thu). Các mục thiết kế M3, thiết kế M4 và kiểm thử lần lượt nằm ở trang PDF 80–93, 94–121 và 142–170. Nguồn tên lớp: `Class List.pdf`, trang 1.

## 0. Tech stack và kiến trúc đã chốt

| Phần | Ràng buộc khi triển khai |
|---|---|
| Mã nguồn giao diện | **TypeScript** theo `Phase2_L03_14.pdf` §2.4, trang in 12 (trang PDF 13). **Figma** là nguồn thiết kế màn hình. **GitHub** lưu mã giao diện và ảnh `mockups/`. |
| Web và môi trường dev | **React SPA**, **Vite dev server chạy bằng Node.js** tại `127.0.0.1:5173` qua HTTP loopback. Trạng thái demo ở bộ nhớ; chế độ giao diện và ngôn ngữ ở `localStorage`. Nguồn: `main.pdf` §2.3.2, trang in 21–22 (PDF 22–23). |
| Android | **Capacitor WebView** chạy tài nguyên web build từ `dist/`, đóng gói APK với ID `vn.pikepike.app`. Nguồn: `main.pdf` §2.3.2. |
| Kiến trúc backend | **Ứng dụng nguyên khối phân tầng, chia module M1–M4**. API, phiên, phân quyền, nghiệp vụ, Repository, AuditLog, IoTGateway, Scheduler và What-if chạy trong cùng tiến trình ứng dụng. Module gọi nhau qua hợp đồng đã thống nhất. Nguồn: `main.pdf` §2.3.2 và §2.4.1. |
| Giao thức triển khai | Theo phương án **HTTPS với payload JSON** trong `main.pdf` §2.3.2 cho Web/Android ↔ API và IoT/nguồn giả lập ↔ máy chủ. UI có thể polling với chu kỳ tối đa 5 giây (NFR-02); bản tin trạng thái có chu kỳ 5 giây (NIF-01). Hai nguồn IoT dùng cùng hợp đồng và được chọn qua `USE_REAL_IOT`. |
| Backend | **TypeScript strict, Node.js 24 LTS, Fastify 5**. Dùng `tsx watch` khi phát triển và `tsc` để build bản chạy bằng Node. |
| Lưu trữ | **PostgreSQL 17**, driver `pg`, SQL tham số hóa và migration qua `node-pg-migrate`. Truy cập qua Repository và biên giao dịch. Dữ liệu vận hành lưu trong bảng quan hệ; JSONB dùng cho nội dung snapshot bất biến, tham số kịch bản và số liệu mô phỏng. |
| Triển khai | **Docker Compose** với `db`, `api` và `web`. PostgreSQL dùng named volume. Nginx phục vụ SPA, hỗ trợ tải lại route và proxy `/api` tới Fastify. Migration chạy một lần trước khi API nhận lưu lượng; seed 6 Hub dùng riêng cho dev/test. |
| Kiểm thử | `node:test` và Fastify inject cho logic/API; PostgreSQL thật qua Compose cho migration, ràng buộc, khóa và rollback. Playwright cho luồng web chính và kiểm tra khói Android trên emulator hoặc máy thật. CI chạy `npm ci`, typecheck, build và test. |

**Repo:** giữ React 19, Vite 6 và Capacitor 7 theo cấu hình hiện có. Giữ `src/` và cấu hình Vite/Capacitor ở root; dùng npm workspaces với `server/` cho backend và `packages/contracts/` cho DTO, enum, JSON Schema và mã lỗi dùng chung. Đặt migration ở `server/migrations/`. Dùng một lockfile và Node 24 cho dev, CI và Docker.

**HTTP:** REST JSON dưới `/api/v1`; Fastify dùng JSON Schema để kiểm tra request/response, sinh OpenAPI qua `@fastify/swagger`. Frontend dùng `fetch` qua một API client dùng chung. Backend kiểm phiên `LoginSession` của M1 qua Bearer token, vai trò và quyền sở hữu; IoT dùng endpoint với thông tin xác thực thiết bị. Trả mã lỗi nghiệp vụ ổn định và lỗi theo trường nếu có. Thời điểm lưu bằng `timestamptz`, trao đổi ISO 8601 UTC.

**Chạy dev:** dùng Compose cho PostgreSQL, chạy Fastify và Vite trên máy dev; Vite proxy `/api` sang Fastify. Bản web dùng đường dẫn API tương đối. Android dùng `VITE_API_BASE_URL` tuyệt đối, emulator debug truy cập host qua `10.0.2.2`, thiết bị thật dùng địa chỉ LAN hoặc HTTPS dev. HTTP chỉ dùng cho debug local; bản phát hành dùng HTTPS và CORS theo origin triển khai. Các biến `VITE_*` là công khai; DB URL và khóa thiết bị chỉ đặt ở server. Ghi cấu hình cần thiết trong `.env.example`.

**Build Android:** `npm run android:sync` build bằng Vite và đồng bộ `dist/` vào Capacitor, sau đó dùng Android Studio/Gradle để build APK. WebView chạy JavaScript do Vite biên dịch từ TypeScript; ứng dụng gọi cùng API với web.

**Giao dịch và tác vụ nền:** mỗi giao dịch dùng một kết nối `pg`. Khóa hàng theo thứ tự ID ổn định, dùng ràng buộc DB để chống trùng khóa lũy đẳng và chồng lịch sạc; capture snapshot trong giao dịch đọc nhất quán `REPEATABLE READ`. Lưu thông báo cần retry vào outbox cùng giao dịch và chống gửi lặp bằng ID sự kiện. UC-21 trả HTTP `202` với `runId`; worker thread trong service API chạy mô phỏng, ghi tiến độ và đọc yêu cầu hủy từ DB. Bản demo chạy một run tại một thời điểm; yêu cầu tiếp theo vào hàng chờ. Khi service khởi động lại, run đang thực thi được đánh dấu `INCOMPLETE` kèm lý do, các run đang chờ tiếp tục được xử lý. Client polling để đọc tiến độ và cập nhật dashboard.

Tham chiếu: [Node.js 24 LTS](https://nodejs.org/en/blog/release/v24.20.0/), [Fastify JSON Schema](https://fastify.dev/docs/v5.7.x/Reference/Validation-and-Serialization/), [giao dịch node-postgres](https://node-postgres.com/features/transactions), [Capacitor Android](https://capacitorjs.com/docs/android).

## 1. Chuẩn tên và trách nhiệm

| Nhóm | M3 | M4 |
|---|---|---|
| Boundary | `ChargingUI`, `GiaoDienBaoSuCo`, `DashboardUI`, `OperationsUI`, `IoTGateway` | `RebalancingScreen`, `RebalancingTaskScreen`, `ReportScreen`, `ScenarioScreen`, `SimulationResultScreen` |
| Control | `ChargingService`, `IncidentService`, `MonitoringService`, `DichVuCanhBao`, `ResourceService`, `NotificationService` | `RebalancingController`, `ReportController`, `ScenarioController`, `SimulationController`, `SimulationResultController`, `RecommendationController` |
| Truy xuất dữ liệu | `Database` | Dùng hợp đồng truy xuất của `Database` theo §3.5; Class List không khai báo lớp truy xuất riêng cho M4 |
| Entity | `ChargingPoint`, `ChargingRequest`, `ChargingSession`, `Incident`, `OverloadAlert` | `RebalancingOrder`, `Scenario`, `SimulationRun`, `NetworkSnapshot`, `CoordinationRecommendation`, `HubMetricRecord`, `Notification` |
| Kiểu dùng chung | Dùng `NetworkState` qua hợp đồng đọc trạng thái và lập lịch | `NetworkState` |

- Các tên `ChargingRequestService`, `ChargingScheduler`, `DashboardService`, `OverloadMonitor`, `DeviceEventService` lần lượt quy về `ChargingService` (hai tên đầu), `MonitoringService`, `DichVuCanhBao`, `ResourceService`. `ChargingUI` phục vụ đăng ký sạc; boundary vận hành UC-16 là `OperationsUI`.
- `RebalancingUI` và `RebalancingService` quy về `RebalancingScreen` / `RebalancingTaskScreen` và `RebalancingController`. Tên cũ `SimulationService` tách theo UC-20/21; `RecommendationService` tách theo UC-22/23, dùng đúng controller trong bảng. `NotificationService` là Control M3; `Notification` là Entity M4.
- Dùng lại `User`, `PrivateVehicle`, `AuditLog` của M1; `Hub`, `Vehicle`, `ParkingSpot`, `Reservation`, `Trip`, `KiemTraTaiNguyen`, `CSDLTaiNguyen` của M2. Boundary chuyển yêu cầu và hiển thị kết quả; Control kiểm quyền, điều phối và quản lý giao dịch; Entity giữ bất biến và chuyển trạng thái; lớp truy xuất đọc/ghi theo hợp đồng.
- Giữ `lapLich`, `baoSuCo`, `xuLyBanTin`, `gui`, `ghi` tại ranh giới tích hợp. Ưu tiên chữ ký chi tiết §3.4/§3.5 và kịch bản nghiệm thu khi bảng kiến trúc dùng tên khác như `dangKyNhuCauSac` / `dangKySac`, `nhanBanTin` / `xuLyBanTin`, `suggestRebalancing` / `proposeTransfer`, `getOperationalReport` / `getOperationsReport`, `runSimulation` / `runScenario`. Chốt một tên cho mỗi thao tác, cùng bộ mã trạng thái dùng chung trước khi định nghĩa schema/API.

## 2. Phạm vi và quy tắc M3

| UC và lớp phụ trách | Luồng và quy tắc nghiệm thu |
|---|---|
| **UC-09 — ChargingService** | `layThongTinSac` đọc mức pin, chỗ đỗ và thông tin Hub. `dangKySac` kiểm quyền sở hữu, xe cá nhân đã duyệt (BR-13), tương thích Hub và yêu cầu trùng; lưu `ChargingRequest` ở `CHO_XEP_LICH`. Chặn trùng cả khi gửi đồng thời. Tích hợp UC-12 qua `taoYeuCauSacTuDong` đối với xe dùng chung trả về với pin dưới 30% (BR-10). |
| **UC-13 — IncidentService** | `baoSuCo` kiểm người báo, tài nguyên và liên hệ chuyến đi khi áp dụng; kiểm báo trùng, lưu `Incident` ở `MOI`. Dùng cùng hợp đồng từ M2 (UC-12), M4 (UC-17) và tiếp nhận lỗi thiết bị qua `moSuCoTuThietBi`. |
| **UC-14 — MonitoringService** | `layTongQuanMangLuoi` tổng hợp trạng thái gần nhất theo bộ lọc, gồm dữ liệu Hub và tài nguyên. Nhận sự kiện để làm mới Dashboard, giữ giá trị gần nhất kèm timestamp và độ tin cậy khi mất tín hiệu. Đọc tổng quan không làm đổi tài nguyên. |
| **UC-15 — DichVuCanhBao** | Quét định kỳ mỗi phút, dùng cùng định nghĩa tỷ lệ sử dụng chỗ với M4. Dữ liệu còn mới: dưới 85% chưa gần đầy; từ 85% đến dưới 95% gần đầy; từ 95% nghiêm trọng và chặn nhận chỗ mới. Tạo/cập nhật cảnh báo đang mở, đóng khi chỉ số hạ dưới ngưỡng; kiểm ngưỡng cổng sạc riêng theo cấu hình. Không phát cảnh báo trùng hoặc nâng mức chỉ từ mẫu IoT cũ. |
| **UC-16 — ChargingService** | `lapLich(maHub, nguCanh, maLanChay?)` đọc yêu cầu chờ, cổng và lịch trong đúng ngữ cảnh. `tinhDiemUuTien` theo BR-06, thời lượng theo tốc độ BR-05, `thuPhanBo` dùng UC-06 và tránh chồng cổng/khung giờ. Yêu cầu phân bổ được chuyển `DA_XEP_LICH`; yêu cầu còn lại giữ `CHO_XEP_LICH` kèm lý do. Theo dõi tiếp `DANG_SAC`, `XONG`, `HUY`. Hub không tồn tại, hết cổng, tranh chấp và lỗi lưu phải có kết quả rõ ràng. Lịch thật lưu nguyên tử và chỉ gửi thông báo thay đổi sau khi lưu thành công. Mục tiêu ≤1 giây/Hub (NFR-03). |
| **UC-18 — IncidentService** | `layChiTietSuCo`; vận hành từ chối có lý do (`MOI → TU_CHOI`) hoặc xác nhận và phân công kỹ thuật có quyền (`MOI → DANG_XU_LY`). Kỹ thuật được giao lưu kết quả khắc phục; vận hành kiểm tra, nếu chưa đạt giữ `DANG_XU_LY`, đạt thì `DA_DONG` và phục hồi tài nguyên đủ điều kiện. Trạng thái cuối không sửa tùy ý. Đồng bộ thay đổi Incident và tài nguyên, đánh dấu tài nguyên lỗi theo luồng xác nhận, xử lý lịch sạc bị ảnh hưởng và gửi thông báo theo luồng. |
| **UC-24 — IoTGateway → ResourceService** | `xuLyBanTin` kiểm cấu trúc, loại, ID, trạng thái, nguồn và timestamp. Bản tin cũ hoặc lặp không ghi đè hay phát thêm sự kiện; bản tin sai bị từ chối. Bản mới cập nhật trạng thái, pin nếu có, timestamp và phát sự kiện cho giám sát sau khi ghi. Nhịp cập nhật 5 giây; dùng nguồn thật hoặc giả lập qua cùng cổng theo cấu hình. Kiểm mốc gián đoạn 3 phút (giữ giá trị kèm `STALE`) và 6 phút (mất tín hiệu/quá hạn tin cậy) theo TC-M3-20. |

## 3. Phạm vi và quy tắc M4

| UC và lớp phụ trách | Luồng và quy tắc nghiệm thu |
|---|---|
| **UC-17 — RebalancingController** | `proposeTransfer` đọc hai Hub và ứng viên. `computeTransferCount` là hàm thuần: lấy min của nhu cầu thiếu tại đích làm tròn lên, số xe nguồn vượt mức giữ lại (mặc định 2) và số chỗ trống đích; chặn kết quả âm. Đích ≥95% bị từ chối. Xe ứng viên `AVAILABLE`, không thuộc lệnh khác, không sắp có lịch sạc; xếp pin giảm dần. Khi đích thiếu chỗ, xét phương án Hub thứ hai theo đặc tả. `createOrder` kiểm xác nhận, khóa xe/chỗ, tính lại và giảm số lượng khi cần; lưu lệnh, xe `REBALANCING` và chỗ đích `RESERVED` theo cùng giao dịch. Giao kỹ thuật rảnh nếu có, nếu chưa có giữ `PENDING_ASSIGNMENT`. Xe hỏng bị loại, nhả chỗ giữ, hủy lệnh nếu không còn xe. Chỉ người được giao hoàn tất lệnh `ASSIGNED/IN_PROGRESS`; cập nhật xe tại Hub đích về `AVAILABLE`, chiếm chỗ đích và giải phóng chỗ nguồn trong cùng giao dịch. |
| **UC-19 — ReportController** | `getOperationsReport` / `refreshReport` kiểm bộ lọc và khung giờ; tổng hợp dữ liệu vận hành từ một lần đọc nhất quán theo Hub hoặc toàn mạng. Đánh dấu gần đầy từ 85%, giữ số gần nhất và nhãn nguồn cũ, trả mã lần chạy liên quan nếu trùng khung giờ. Chỉ số mô phỏng được xem qua UC-22. |
| **UC-20 — ScenarioController** | `listTemplates` cho SC-01 đến SC-04. `createScenario`, `updateScenario`, `cloneScenario` kiểm loại sự kiện, Hub, giới hạn cường độ/thời lượng và mã duy nhất. Tạo trạng thái `READY`, lưu seed, sửa có `expectedVersion` và giữ phiên bản cũ. Nhân bản có mã mới, phiên bản 1 và tham chiếu bản gốc. Chỉ lưu cấu hình tại UC-20. |
| **UC-21 — SimulationController** | `runScenario` kiểm quyền, phiên bản và tham số. Lấy snapshot nhất quán hoặc snapshot dùng chung; báo `DATA_NOT_STABLE` nếu không đọc được trong thời hạn. Snapshot sao chép sâu gồm các tài nguyên, phiên sạc và đặt chỗ; mỗi run có bản làm việc riêng. Sinh sự kiện theo seed, chạy từng phút, cập nhật tiến độ, thuê xe theo BR-01/09, kiểm chỗ theo BR-04 và cập nhật sạc theo BR-05; dùng UC-06 và UC-16 trong ngữ cảnh mô phỏng. Tổng hợp tỷ lệ đáp ứng, quá tải và xe pin yếu; sinh `REBALANCE`, `CHARGING_SCHEDULE`, `REDIRECT_STUDENTS`. Cùng đầu vào, phiên bản, seed và snapshot phải tái lập kết quả. Mục tiêu ≤10 giây cho lần chạy chuẩn; hủy ở ranh giới bước, trả `INCOMPLETE`; vượt hạn trả `TIMED_OUT`. Hai trạng thái này chỉ có kết quả từng phần. |
| **UC-22 — SimulationResultController** | `listRuns`, `getRun`, `compareRuns`. Hiển thị số liệu, trạng thái, lý do dừng, khuyến nghị và hiệu lực theo trạng thái thật hiện tại. Chỉ so sánh các lần chạy tồn tại có cùng `snapshotId`; chỉ lần chạy hoàn tất với dữ liệu đầy đủ được áp dụng. Đây là luồng đọc. |
| **UC-23 — RecommendationController** | `previewImpact` đọc các mục `NOT_APPLIED` và tóm tắt xe, chỗ, lịch, thông báo. `applyRecommendations` yêu cầu xác nhận, kiểm quyền và khóa chống áp dụng gói đồng thời. Đọc lại live, tính lại tác động; mục hết hiệu lực ghi `SKIPPED`. Điều chuyển gọi UC-17 với `FROM_RECOMMENDATION`; lịch gọi `lapLich(maHub, THAT, null)`; chuyển hướng kiểm Hub vẫn ≥95% và gửi gợi ý qua `NotificationService.gui`. Lưu kết quả từng mục `APPLIED/SKIPPED/FAILED`, ghi audit. Lỗi một mục được ghi riêng; xung đột giữa hai gói từ chối toàn gói đến sau. Gửi lại cùng gói không tạo lệnh hay thông báo lần hai. |

## 4. Hợp đồng tích hợp và thứ tự làm

1. Dựng workspace, Fastify, Postgres/Compose, migration và hợp đồng REST theo §0. Chốt schema, vai trò, mã lỗi và ánh xạ enum Việt/Anh. Dùng chung định nghĩa tỷ lệ chỗ, trạng thái tài nguyên, thời gian và ngưỡng. Thiết lập giao dịch và đồng hồ thay thế được trong kiểm thử. Chuẩn hóa hợp đồng `KiemTraTaiNguyen.kiemTraTaiNguyenKhaDung` (UC-06) nhận Hub, khung giờ và ngữ cảnh/run khi có.
2. Làm M3 theo lát cắt: IoT → giám sát/cảnh báo; đăng ký → lập lịch; báo cáo → xử lý sự cố. Hoàn thiện đường gọi tài nguyên và sạc tự động từ M2. Với `THAT`, đọc/ghi dữ liệu thật; với `MO_PHONG`, xác định đúng working state bằng run ID và chỉ ghi lên đó. Kiểm tra tính nhất quán cho lịch, hàng chờ và lý do chờ.
3. Làm điều chuyển và báo cáo vận hành M4. Khóa và kiểm lại trạng thái ngay trước ghi, kiểm quyền trên backend, dùng khóa lũy đẳng bền vững. Các thao tác cùng thay đổi lệnh, xe và chỗ cần rollback cùng nhau khi lỗi. Phát thông báo hoặc sự kiện sau khi giao dịch nghiệp vụ thành công.
4. Làm kịch bản, snapshot, run và đọc kết quả. Tách snapshot bất biến khỏi working state; lưu phiên bản và snapshot ID trên mỗi run. Chia sẻ logic nghiệp vụ M2/M3 giữa hai ngữ cảnh, kiểm kết quả lặp lại và rằng chế độ What-if không ghi vào tài nguyên vận hành hay gửi thông báo thật.
5. Nối preview và apply sau khi UC-16, UC-17 và UC-22 hoạt động. Mọi quyết định ghi phải dựa trên dữ liệu thật được kiểm lại dưới khóa thích hợp. Dùng audit log và lưu trạng thái đầu ra để kiểm soát retry, gửi trùng và lỗi từng phần.

## 5. Nghiệm thu và các điểm cần chốt

- Chạy toàn bộ **TC-M3-01–20** theo §4.4: đăng ký 01–03, báo sự cố 04–05, giám sát 06–07, cảnh báo 08–10, lập lịch 11–13, xử lý sự cố 14–17, IoT 18–20. Kiểm riêng rollback, phân bổ trùng, snapshot không thay đổi dữ liệu thật, bản tin cũ/trùng và ranh giới 85%/95%.
- Chạy toàn bộ **TC-M4-01–15** theo §4.5: điều chuyển 01–03, báo cáo 04–05, kịch bản 06–07, mô phỏng 08–10, kết quả 11–12, áp dụng 13–15. Kiểm cạnh tranh xe/chỗ và gói khuyến nghị, giảm lượng xe khi live thay đổi, snapshot dùng chung, timeout/hủy, lũy đẳng và hiệu năng trên dữ liệu demo.
- Chốt trước khi mã hóa phần liên quan: giá trị trọng số BR-06 và quy tắc hòa điểm nếu chưa có nguồn chuẩn; tham số chính thức cho mẫu SC-02–SC-04; nguồn `getExpectedDemand`; quy tắc chọn Hub đích thứ hai; chủ sở hữu chuyển xe đang điều chuyển sang `BROKEN` và giá trị `LoaiSuCo`; phạm vi người nhận khuyến nghị chuyển hướng; có cần xác nhận lại khi kết quả preview thay đổi. Với UC-23, §3.5 nêu phương án truyền xác nhận cùng danh sách xe sang UC-17; ghi lại quyết định trước khi nối hai luồng.

Hướng dẫn chạy và bảng đối chiếu điểm gọi của nhánh `m3-m4` nằm trong [server/README.md](server/README.md), cùng các mặc định demo cho những dữ liệu tài liệu chưa chốt.
