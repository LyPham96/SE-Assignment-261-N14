# BTL CNPM 261 — Nhóm 14 L03 (Smart E-Mobility Hub)

Báo cáo LaTeX viết chung bằng **VS Code + LaTeX Workshop + GitHub**. Mỗi người sửa **file của mình**, nên gần như không bao giờ bị conflict.

## 1. Ai sửa file nào

| Người | File |
|---|---|
| **Mai** | `Content/02/2_1_MauKienTruc.tex`, `Content/03/3_2_M1.tex`, `Content/04/4_2_M1.tex` |
| **Ly** | `Content/02/2_2_QuyetDinhKienTruc.tex` (*), `Content/03/3_3_M2.tex`, `Content/04/4_3_M2.tex` |
| **Thuyên** | `Content/02/2_4_1_PhanTang.tex`, `Content/02/2_4_2_ThanhPhan.tex` (*), `Content/03/3_4_M3.tex`, `Content/04/4_4_M3.tex` |
| **Hoàn** | `Content/02/2_2_QuyetDinhKienTruc.tex` (*), `Content/02/2_4_2_ThanhPhan.tex` (*), `Content/03/3_5_M4.tex`, `Content/04/4_5_M4.tex` |
| **Bách** | `Content/02/2_3_Deployment.tex`, `Content/02/2_4_3_ThuMuc.tex`, `Content/03/3_1_TongThe.tex`, `Content/03/3_6_HaTang.tex`, `Content/04/4_1_PhamVi.tex` |
| **Chưa ai** | `Content/01/1_1_TongQuan.tex`, `Content/01/1_2_ChiTiet.tex` (Mục 1) |

(*) Bảng phân công đang ghi **2 người cho cùng một mục**. Hai người đó tự chia nhau (ví dụ mỗi người một `\subsubsection`, hoặc một người viết và người kia review), nếu không sẽ dễ conflict.

**File dùng chung** (`main.tex`, `lib.sty`, `bia+header/*`, `references.bib`, các file khung `Content/0X_*.tex`): chỉ **một người** sửa, đề xuất là người tổng hợp. Ai cần thêm package thì nhắn người đó.

Ảnh của chương nào để trong `image/<số chương>/` (ví dụ `image/03/m1_class.png`). Đặt tên **không dấu, không khoảng trắng**.

## 2. Cài đặt (mỗi người làm một lần)

1. **TeX Live** (bản full, nặng vài GB, cài khá lâu): https://tug.org/texlive/
   - Windows: nên dùng TeX Live. Nếu dùng MiKTeX thì phải cài thêm **Strawberry Perl**, vì `latexmk` cần Perl.
   - macOS: cài **MacTeX**. Ubuntu: `sudo apt install texlive-full`.
2. **VS Code**, rồi mở thư mục repo. VS Code sẽ gợi ý cài **LaTeX Workshop** và **Live Share**, cứ bấm Install.
3. **Git** + tài khoản GitHub. Lần đầu dùng thì chạy:
   ```bash
   git config --global user.name "Ten Cua Ban"
   git config --global user.email "email@github"
   ```

**Không muốn cài TeX?** Vẫn được: sửa trực tiếp trên web (vào repo trên GitHub, chuyển sang nhánh `report`, bấm phím `.` để mở editor online). Sau đó tải PDF ở tab **Actions** (xem mục 5). Nhược điểm: mỗi lần xem PDF phải đợi vài phút.

## 3. Lấy báo cáo về máy

Báo cáo nằm ở **nhánh `report`** của repo `LyPham96/SE-Assignment-261-N14`. Nhánh này **tách hẳn khỏi code** (không có chung lịch sử với `main`), nên đừng bao giờ merge nó vào `main`.

```bash
git clone -b report --single-branch https://github.com/LyPham96/SE-Assignment-261-N14.git BTL_CNPM_report
cd BTL_CNPM_report
```
Clone vào **một thư mục riêng**, khác thư mục code, để không lẫn nhánh. Ai chưa có quyền push thì nhờ Ly thêm vào Settings → Collaborators.

**Lưu ý:** repo này đang **public**, nên ai cũng đọc được báo cáo.

## 4. Làm việc hằng ngày

```bash
git pull --rebase            # 1. LUÔN pull trước khi sửa
# 2. sửa file của mình, Ctrl+S là tự compile, PDF mở ở tab bên cạnh
git add Content/03/3_2_M1.tex image/03/
git commit -m "M1: thêm sơ đồ lớp chi tiết"
git pull --rebase            # 3. pull lại trước khi push
git push
```

Quy tắc:
- **Chỉ `git add` file của mình**, đừng `git add .` bừa.
- Trước khi push, máy mình phải **compile không lỗi**. Lỗi LaTeX ở một file làm hỏng PDF của cả nhóm.
- Ký tự đặc biệt phải escape: `\&`, `\%`, `\_`, `\#`. Viết `&` trần trong tiêu đề là lỗi (bản gốc từng có 7 lỗi kiểu này, đã sửa).
- Nếu `pull` báo conflict: mở file bị conflict, giữ phần đúng, xóa các dòng `<<<<<<<`, `=======`, `>>>>>>>`, rồi chạy `git add <file>` và `git rebase --continue`. Nếu không chắc thì hỏi người kia trước khi xóa.

Muốn sửa chung real-time (ví dụ ngồi review cùng nhau): một người bấm **Live Share** ở thanh trạng thái, gửi link cho người khác. Chỉ máy của người host cần cài TeX.

## 5. PDF tự build trên GitHub

Mỗi lần push file `.tex`/ảnh lên nhánh `report`, GitHub Actions tự compile. Xem kết quả ở tab **Actions** → chọn lần chạy mới nhất → **Artifacts → BTL_CNPM_PDF**.
- Dấu ❌ đỏ nghĩa là có người push bản lỗi. Bấm vào để xem log.
- Muốn build lại mà không sửa gì: `git commit --allow-empty -m "rebuild"` rồi `git push`.

## 6. Những gì đã đổi so với bản zip gốc

- Tách mỗi mục con thành một file riêng, đầu mỗi file ghi `% Phụ trách: ...`.
- Đổi tên file có dấu phẩy, dấu tiếng Việt, khoảng trắng (`01_Update_Sub1,2.tex` → `01_Update_Sub1_2.tex`, `Phụ lục.tex` → `05_PhuLuc.tex`, `logo (1).png` → `logo.png`). Tên kiểu này dễ lỗi khi git chạy qua lại giữa Windows và macOS.
- Sửa 7 lỗi `&` chưa escape trong chương 3.
- Tắt `minted` trong `lib.sty`: package này cần `-shell-escape` + Python Pygments và hiện không dùng. Muốn chèn code thì dùng `lstlisting`.
- VS Code tự xoá cache khi compile lỗi (`autoClean: onFailed`), nên sửa xong chỉ cần Ctrl+S, không phải xoá tay. Nếu vẫn kẹt thì `Ctrl+Shift+P` → **LaTeX Workshop: Clean up auxiliary files**.
- File rác và PDF nằm trong thư mục `build/` (đã có trong `.gitignore`), không bị commit lên.
