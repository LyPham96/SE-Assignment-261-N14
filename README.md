# BTL CNPM 261 — Nhóm 14 L03 (Smart E-Mobility Hub)

Báo cáo LaTeX viết chung bằng **VS Code + LaTeX Workshop + GitHub** (nhánh `report`). Mỗi người chỉ sửa **file của mình**, nên gần như không bị conflict.

**Mục lục:** [1. Ai sửa file nào](#1-ai-sửa-file-nào) · [2. Cài đặt](#2-cài-đặt-mỗi-người-làm-một-lần) · [3. Viết và xem PDF](#3-viết-và-xem-pdf-trong-vs-code) · [4. Viết nội dung](#4-viết-nội-dung) · [5. Lỗi thường gặp](#5-lỗi-thường-gặp) · [6. Git](#6-git-lấy-bài-về-và-đẩy-bài-lên) · [7. PDF trên GitHub](#7-pdf-tự-build-trên-github)

---

## 1. Ai sửa file nào

| Người | File |
|---|---|
| **Mai** | `Content/02/2_1_MauKienTruc.tex`, `Content/03/3_2_M1.tex`, `Content/04/4_2_M1.tex` |
| **Ly** | `Content/02/2_2_QuyetDinhKienTruc.tex` (*), `Content/03/3_3_M2.tex`, `Content/04/4_3_M2.tex` |
| **Thuyên** | `Content/02/2_4_1_PhanTang.tex`, `Content/02/2_4_2_ThanhPhan.tex` (*), `Content/03/3_4_M3.tex`, `Content/04/4_4_M3.tex` |
| **Hoàn** | `Content/02/2_2_QuyetDinhKienTruc.tex` (*), `Content/02/2_4_2_ThanhPhan.tex` (*), `Content/03/3_5_M4.tex`, `Content/04/4_5_M4.tex` |
| **Bách** | `Content/02/2_3_Deployment.tex`, `Content/02/2_4_3_ThuMuc.tex`, `Content/03/3_1_TongThe.tex`, `Content/03/3_6_HaTang.tex`, `Content/04/4_1_PhamVi.tex` |
| **Chưa ai** | `Content/01/1_1_TongQuan.tex`, `Content/01/1_2_ChiTiet.tex` (Mục 1) |

(*) Bảng phân công đang ghi **2 người cho cùng một mục**. Hai người đó tự chia nhau, ví dụ mỗi người một `\subsubsection`, nếu không sẽ dễ conflict.

**Đừng sửa các file dùng chung** (`main.tex`, `lib.sty`, `bia+header/*`, `references.bib`, các file khung `Content/0X_*.tex`). Chỉ một người tổng hợp được sửa những file này. Cần thêm package thì nhắn người đó.

---

## 2. Cài đặt (mỗi người làm một lần)

Cần 3 thứ: **VS Code**, **extension LaTeX Workshop**, và **một chương trình compile LaTeX**. Phần compile chọn **A hoặc B**:

| | A. TeX Live | B. Tectonic (khuyên dùng cho máy yếu) |
|---|---|---|
| Dung lượng | ~8 GB | ~50 MB + ~50 MB gói tải về lần đầu |
| Cài | 30–60 phút | 2 phút |
| Lỗi phải xoá cache | Có thể gặp (đã cấu hình tự xoá) | **Không bao giờ** |
| Cần mạng | Không | Chỉ lần compile đầu tiên |

LaTeX Workshop **không phải** chương trình compile. Nó chỉ là extension gọi TeX Live hoặc Tectonic. Thiếu chương trình compile thì bấm build sẽ báo lỗi.

### A. TeX Live
1. Tải https://tug.org/texlive/windows.html → `install-tl-windows.exe`, cài mặc định. (macOS: MacTeX. Ubuntu: `sudo apt install texlive-full`.)
2. Recipe dùng trong VS Code: **latexmk (TeX Live/MiKTeX)**.

### B. Tectonic
1. Tải `tectonic-0.15.0-x86_64-pc-windows-msvc.zip` ở https://github.com/tectonic-typesetting/tectonic/releases, giải nén ra `tectonic.exe`, để vào một thư mục cố định, ví dụ `C:\tools\`.
2. Thêm thư mục đó vào PATH. Mở **PowerShell** và chạy (đổi đường dẫn nếu bạn để chỗ khác):
   ```powershell
   [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';C:\tools', 'User')
   ```
3. Kiểm tra: Win+R → `cmd /k where tectonic` phải ra đường dẫn tới `tectonic.exe`.
4. Recipe dùng trong VS Code: **tectonic (nhe, khong can TeX Live)**.

### Chung cho cả A và B
1. Cài **VS Code** và **Git** (https://git-scm.com/download/win).
2. Mở VS Code → `Ctrl+Shift+X` → tìm **LaTeX Workshop** (tác giả **James Yu**) → Install.
3. **Cài xong TeX Live/Tectonic thì phải thoát hẳn VS Code** (File → Exit) **rồi mở lại**. VS Code chỉ đọc PATH lúc khởi động, đóng bằng nút X đôi khi chưa đủ.

---

## 3. Viết và xem PDF trong VS Code

**Mỗi lần làm bài:**
1. VS Code → **File → Open Folder** → chọn thư mục `BTL_CNPM_report`.
2. Mở file của bạn (xem mục 1) và **click vào trong khung code** để con trỏ nhấp nháy trong file `.tex`.
3. Viết xong bấm **Ctrl+S**: VS Code tự compile. Góc dưới bên trái hiện **✓** là thành công, **✗** là lỗi.

**Lần đầu tiên:** chọn recipe. `Ctrl+Shift+P` → gõ `>latex workshop build with recipe` → chọn **latexmk** (nếu cài A) hoặc **tectonic** (nếu cài B). VS Code nhớ lựa chọn này cho các lần sau.

**Xem PDF:**
- **Ctrl+Alt+V**: mở PDF ở tab bên cạnh, mỗi lần Ctrl+S nó tự cập nhật.
- **Nếu khung PDF trắng hoặc xám** (hay gặp khi VS Code chạy với quyền Administrator): `Ctrl+Shift+P` → **LaTeX Workshop: View LaTeX PDF file in web browser**. PDF sẽ mở trong Edge/Chrome và vẫn tự cập nhật khi Ctrl+S.
- File PDF thật nằm ở `build/main.pdf`.

> ⚠️ Mọi lệnh LaTeX Workshop chỉ chạy khi **con trỏ đang ở trong file `.tex`**. Nếu đang click vào bảng log, tab PDF hay file khác thì sẽ báo `not a TeX file` hoặc `Cannot find LaTeX root file`.

---

## 4. Viết nội dung

- Chỉ viết **dưới các tiêu đề có sẵn** trong file của bạn. Không sửa dòng `\input{...}` trong các file khung.
- Ký tự đặc biệt phải thêm `\` phía trước: `\&` `\%` `\_` `\#` `\$`. Viết `&` trần trong tiêu đề là lỗi.
- **Hình:** để ảnh trong `image/<số chương>/`, tên không dấu, không khoảng trắng (ví dụ `image/03/m1_class.png`), rồi chèn:
  ```latex
  \begin{figure}[H]
    \centering
    \includegraphics[width=\textwidth]{image/03/m1_class.png}
    \caption{Sơ đồ lớp chi tiết M1}
  \end{figure}
  ```
- **Bảng dài nhiều trang:** dùng `longtable` (xem mẫu trong `Content/05_PhuLuc.tex`).
- **Code:** dùng `\begin{lstlisting} ... \end{lstlisting}`. Không dùng `minted`, vì nó đã bị tắt.

---

## 5. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| `Ctrl+Shift+P` gõ lệnh mà ra **No matching results** | Thiếu dấu `>` ở đầu (đang tìm file chứ không phải lệnh), hoặc chưa cài LaTeX Workshop | Thêm `>` vào đầu. Vẫn không có lệnh nào bắt đầu bằng "LaTeX Workshop:" thì cài extension (mục 2) |
| `Active document is not a TeX file` / `Cannot find LaTeX root file` | Con trỏ không nằm trong file `.tex` | Click vào khung code của một file `.tex` rồi chạy lại |
| `'tectonic' is not recognized` / `spawn latexmk ENOENT` | VS Code không thấy chương trình compile | Kiểm tra `cmd /k where tectonic`. Có kết quả thì **File → Exit** rồi mở lại VS Code. Không có thì làm lại bước PATH (mục 2B) |
| Khung PDF trắng/xám | Trình xem trong VS Code lỗi khi chạy quyền admin | Dùng **View LaTeX PDF file in web browser** (mục 3) |
| `Misplaced alignment tab character &` | Có `&` không escape | Đổi `&` → `\&` |
| `File 'Content/...' not found` | Gõ nhầm vào trong `\input{...}` | Sửa lại đường dẫn, hoặc vào Source Control → chuột phải file → **Discard Changes** |
| Sửa lỗi rồi mà vẫn báo lỗi (chỉ với latexmk) | Cache cũ còn giữ lỗi | Đã cấu hình tự xoá cache khi lỗi. Nếu vẫn kẹt: `Ctrl+Shift+P` → **LaTeX Workshop: Clean up auxiliary files**, rồi Ctrl+S |
| Tectonic báo `The font "..." cannot be found` | Bản `lib.sty` cũ | Pull bản mới nhất. `lib.sty` hiện gọi font theo tên file nên không phụ thuộc font cài trên máy |
| Tectonic lần đầu đứng im lâu | Đang tải gói (~50 MB) | Đợi vài phút, cần có mạng. Từ lần thứ hai chỉ còn vài giây |
| Muốn biết lỗi chi tiết | | Bảng **OUTPUT** → chọn **LaTeX Workshop**, hoặc mở `build/main.log` |

---

## 6. Git: lấy bài về và đẩy bài lên

Báo cáo nằm ở **nhánh `report`** của repo `LyPham96/SE-Assignment-261-N14`. Nhánh này **tách hẳn khỏi code**, không chung lịch sử với `main`, nên **đừng bao giờ merge vào `main`**. Repo đang **public**, nên ai cũng đọc được báo cáo.

**Lấy về lần đầu** (clone vào thư mục riêng, khác thư mục code):
```bash
git clone -b report --single-branch https://github.com/LyPham96/SE-Assignment-261-N14.git BTL_CNPM_report
```
Lần đầu dùng git thì khai báo tên:
```bash
git config --global user.name "Ten Cua Ban"
git config --global user.email "email-github-cua-ban"
```

**Mỗi lần làm bài, bấm nút trong VS Code (không cần gõ lệnh):**
1. **Trước khi viết:** bấm biểu tượng **⟳ (Sync)** ở góc dưới bên trái để lấy bài mới của nhóm.
2. Viết bài, Ctrl+S, kiểm tra **compile ✓**.
3. Mở tab **Source Control** (biểu tượng nhánh cây bên trái):
   - Rê chuột lên **file của bạn** → bấm **+** (Stage). **Chỉ stage file của mình**, file khác hiện chữ M thì kệ hoặc Discard.
   - Gõ mô tả ngắn vào ô Message, ví dụ `M1: thêm sơ đồ lớp`, rồi bấm **Commit**.
   - Bấm **Sync Changes** để đẩy lên.

Hoặc dùng lệnh:
```bash
git pull --rebase
git add Content/03/3_2_M1.tex image/03/
git commit -m "M1: thêm sơ đồ lớp chi tiết"
git pull --rebase
git push
```

**Quy tắc:**
- **Chỉ đẩy khi compile ✓.** Một file lỗi làm hỏng PDF của cả nhóm.
- Không `git add .` bừa.
- Nếu bị **conflict**: mở file đó, giữ phần đúng, xoá các dòng `<<<<<<<`, `=======`, `>>>>>>>`, rồi stage lại và tiếp tục. Nếu không chắc thì hỏi người kia trước khi xoá.

Muốn sửa chung real-time: một người bấm **Live Share** ở thanh trạng thái rồi gửi link. Chỉ máy của người host cần có TeX.

---

## 7. PDF tự build trên GitHub

Mỗi lần có người push file `.tex` hoặc ảnh lên nhánh `report`, GitHub Actions tự compile (bằng TeX Live):
- Xem ở tab **Actions** → lần chạy mới nhất → **Artifacts → BTL_CNPM_PDF** để tải PDF.
- Dấu ❌ nghĩa là có người push bản lỗi, bấm vào để xem log.
- Muốn build lại mà không sửa gì: `git commit --allow-empty -m "rebuild"` rồi `git push`.

Ai không cài được gì vẫn viết được: vào repo trên GitHub → chuyển sang nhánh `report` → bấm phím `.` để mở editor online → sửa, commit → tải PDF ở tab Actions. Mỗi lần phải đợi vài phút.

---

## Phụ lục: đã đổi gì so với bản zip gốc

- Tách mỗi mục con thành một file riêng, đầu mỗi file ghi `% Phụ trách: ...`.
- Đổi tên file có dấu phẩy, dấu tiếng Việt, khoảng trắng (`01_Update_Sub1,2.tex` → `01_Update_Sub1_2.tex`, `Phụ lục.tex` → `05_PhuLuc.tex`, `logo (1).png` → `logo.png`).
- Sửa 7 lỗi `&` chưa escape trong chương 3. Bỏ dòng trống trong `\fancyhead` (bản fancyhdr cũ báo lỗi).
- `lib.sty` chạy được cả pdfLaTeX (TeX Live/MiKTeX/Overleaf) lẫn XeTeX/Tectonic. Font tiếng Việt được chọn theo engine.
- Tắt `minted` vì cần `-shell-escape` + Python và hiện không dùng.
- VS Code tự xoá cache khi compile lỗi (`autoClean: onFailed`).
- File phụ và PDF nằm trong `build/`, không bị commit lên.
