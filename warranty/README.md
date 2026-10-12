# Bảo hành cửa hàng: tra cứu và dashboard

Ứng dụng web tĩnh (HTML + JavaScript thuần, không cần build, không cần server) để:

- **Tra cứu**: chọn/chạm mã cửa hàng → nhóm hạng mục → hạng mục → nội dung hư hỏng. Ứng dụng cho biết hạng mục còn bảo hành hay không, mã đầu việc, nhà thầu và các yêu cầu đang mở.
- **Dashboard**: cửa hàng còn bảo hành, cảnh báo sắp hết bảo hành, lỗi cần xử lý và đã xử lý, kiểm tra chất lượng dữ liệu.
- **Gửi email**: nút mở sẵn email gửi nhà thầu, cửa hàng hoặc kỹ thuật, có đủ thông tin hạng mục và yêu cầu. Người gửi kiểm tra rồi bấm Gửi.

## Mở ứng dụng

- Mở trực tiếp `docs/index.html` bằng trình duyệt, kể cả trên điện thoại.
- Hoặc xem trên web tại `https://nso.wcm.vn` sau khi bật GitHub Pages và gắn tên miền (xem phần Triển khai).

Trang dùng font Inter và Font Awesome từ CDN. Không có mạng thì trang vẫn chạy, chỉ mất icon và font.

## Cấu trúc

Thư mục `docs/` là toàn bộ app, GitHub Pages publish từ đây. Thư mục `warranty/` chứa file Excel, script và test, không được publish.

| File | Vai trò |
|---|---|
| `docs/index.html` | Giao diện (tab Tra cứu và Dashboard), CSS nằm trong file |
| `docs/js/analysis.js` | Lõi phân tích: tính ngày còn lại, trạng thái yêu cầu, xác nhận, kiểm tra dữ liệu, tạo email |
| `docs/js/app.js` | Điều khiển giao diện, không chứa logic nghiệp vụ |
| `docs/data/warranty-data.js` | Dữ liệu đã chuyển từ Excel. **Tự sinh, không sửa tay** |
| `docs/data/contacts.js` | Danh bạ email nhà thầu, cửa hàng, kỹ thuật. **Sửa tay ở đây** |
| `docs/CNAME` | Tên miền gắn cho GitHub Pages (`nso.wcm.vn`) |
| `warranty/tools/build_data.py` | Đọc file Excel và sinh `docs/data/warranty-data.js` |
| `warranty/source/` | File Excel gốc đang dùng |
| `warranty/tests/analysis.test.js` | Kiểm thử lõi phân tích trên dữ liệu thật |

## Cập nhật khi có file Excel mới (hằng tuần)

1. Thêm file `.xlsx` mới vào `warranty/source/`, hoặc truyền đường dẫn khi chạy.
2. Từ thư mục gốc của repo:

   ```bash
   python3 warranty/tools/build_data.py                      # file .xlsx mới nhất trong source/
   python3 warranty/tools/build_data.py duong/dan/file.xlsx  # hoặc chỉ định file
   ```

3. Kiểm tra lại: `node --test warranty/tests/analysis.test.js`. Test có một số kỳ vọng gắn với dữ liệu hiện tại (số cửa hàng, số yêu cầu), nên sẽ báo khi dữ liệu đổi. Khi đó cập nhật lại các con số trong test.
4. Commit và đẩy lên repo.

Script không phụ thuộc tên sheet. Nó nhận diện sheet theo tiêu đề cột: sheet có `Mã CH` cùng `Hạng mục chi tiết` là BOQ, có `Kết luận` là yêu cầu bảo hành, có `Hạng mục chi tiết` cùng cột `check` là master quy đổi lý do. Sheet ẩn cũng được đọc.

## Quy tắc nghiệp vụ

Ngưỡng và quy tắc nằm ở đầu `docs/js/analysis.js` (`CONFIG`) và trong hàm `classifyStatus`.

**Bảo hành.** Còn bảo hành khi ngày hiện tại ≤ "Ngày hết BH". Còn ≤ 90 ngày là *sắp hết*, còn ≤ 30 ngày là *khẩn*. Ngày tính theo máy đang mở trang. Ô "Tính đến ngày" trên dashboard cho phép xem trước tình trạng vào một ngày khác.

**Trạng thái yêu cầu.** Ghi theo văn bản trong Excel:

| Văn bản có | Phân loại |
|---|---|
| "chờ", "đang", "báo giá" | Đang mở (kể cả "Không thuộc phạm vi" nhưng còn báo giá) |
| "Không thuộc phạm vi" (không còn việc treo) | Đã đóng, không thuộc BH |
| "Đã xử lý", "Đã hỗ trợ" | Đã đóng |
| Không nhận diện được | Tạm tính là đang mở, và báo cảnh báo W02 |

**Quá hạn.** Yêu cầu đang mở và đã qua "Hạn phản hồi" thì quá hạn, tính theo số ngày.

**Xác nhận.** Chọn cửa hàng + hạng mục (+ nội dung hư hỏng) → ứng dụng trả về một trong các kết luận: còn bảo hành, hết bảo hành, không có hạng mục này, không có cửa hàng này. Nếu nội dung hư hỏng khác với master của hạng mục, ứng dụng ghi chú để kiểm tra lại trước khi gửi yêu cầu.

### Kiểm tra dữ liệu

| Mã | Mức | Nội dung |
|---|---|---|
| E01 | Lỗi | Kết luận "Được bảo hành" nhưng trạng thái ghi "Không thuộc phạm vi BH" (hoặc ngược lại) |
| E02 | Lỗi | Yêu cầu gửi sau ngày hết bảo hành |
| E03 | Lỗi | Mã đầu việc của yêu cầu không có trong BOQ của cửa hàng |
| E04 | Lỗi | Mã cửa hàng trong yêu cầu không có trong BOQ |
| E05 | Lỗi | Tên, miền, nhà thầu hoặc ngày BH của một cửa hàng khác nhau giữa các sheet |
| E06 | Lỗi | Mã đầu việc không đúng dạng `BHXDA###` |
| E07 | Lỗi | Hạn phản hồi trước ngày gửi |
| W01 | Cảnh báo | Yêu cầu quá hạn phản hồi |
| W02 | Cảnh báo | Trạng thái xử lý không nhận diện được |
| W03 | Cảnh báo | Hạng mục chưa đối soát với master quy đổi lý do |
| W04 | Cảnh báo | Cửa hàng thiếu miền hoặc nhà thầu |
| W05 | Cảnh báo | Yêu cầu đang mở nhưng bảo hành đã hết |
| W06 | Cảnh báo | Yêu cầu đang mở chưa có nội dung trả lời |
| W07 | Cảnh báo | Thời hạn BH khác 12 tháng từ ngày KT |
| W08 | Cảnh báo | Ô ngày hoặc dòng không đọc được khi chuyển Excel |
| I01 | Ghi chú | Hạng mục thiếu khối lượng CV |
| I02 | Ghi chú | Hạng mục chưa có PIC hoặc trạng thái |
| I03 | Ghi chú | Hạng mục chưa có nội dung hư hỏng |

## Kiểm tra bảo hành, sự vụ và biên bản PDF

Ứng dụng có ba tab:

- **Tra cứu:** chọn cửa hàng, hạng mục, nội dung hư hỏng để kiểm tra bảo hành. Bấm **Tạo sự vụ cho hạng mục này** sẽ chuyển sang tab Sự vụ và điền sẵn thông tin.
- **Sự vụ:** tạo sự vụ gửi nhà thầu, xem danh sách, ghi nhận tình trạng, xuất biên bản PDF.
- **Dashboard:** chỉ hiển thị phân tích tổng hợp sự vụ (số liệu, trạng thái, thời gian xử lý, theo tháng, theo cửa hàng và nhà thầu) và cảnh báo sự vụ quá hạn.

Chi tiết từng phần:

1. **Kiểm tra bảo hành.** Chọn cửa hàng, hạng mục, nội dung hư hỏng. Kết quả cho biết còn hay hết bảo hành, và có cảnh báo nếu dữ liệu chưa khớp. Bấm **Tạo sự vụ cho hạng mục này** để điền sẵn form.
2. **Tạo sự vụ gửi nhà thầu.** Nhập hạng mục, mức độ, hạn nhà thầu phản hồi, người tạo và mô tả. Hệ thống ghi lại tình trạng bảo hành lúc tạo. Mã sự vụ có dạng `SV-YYMM-XXXX`.
3. **Danh sách sự vụ.** Lọc theo đang mở, quá hạn, đã đóng hoặc tất cả. Mở **Xem** để thấy diễn biến và:
   - **Đánh dấu đã gửi nhà thầu** khi đã gửi mail hoặc biên bản.
   - **Ghi nhận tình trạng nhà thầu báo về**: chọn tình trạng, ngày nhà thầu báo, người ghi nhận và nội dung.
   - **Xuất biên bản PDF**: biên bản có thông tin cửa hàng, tình trạng bảo hành, nội dung sự vụ, diễn biến và chỗ ký của hai bên.
   - **Đóng sự vụ**: bấm hai lần để xác nhận.

Trạng thái sự vụ lấy theo lần ghi nhận gần nhất: Mới, Đã gửi nhà thầu, Nhà thầu đã phản hồi, Đang xử lý, Đã xử lý, Đã đóng. Mỗi lần ghi nhận là một dòng riêng, nên hai người cập nhật cùng lúc không ghi đè nhau.

### Nơi lưu sự vụ

- **Trên link claude.ai (artifact):** sự vụ được lưu dùng chung. Mọi người có quyền xem đều thấy. Người tạo sự vụ và ghi nhận tình trạng cần quyền **Contributor** trở lên. Người chỉ có quyền Viewer chỉ xem được và thấy thông báo chỉ xem.
- **Trên trang tĩnh (nso.wcm.vn hoặc mở file trực tiếp):** sự vụ chỉ lưu trong trình duyệt của máy đó. Muốn chia sẻ giữa nhiều người, dùng link claude.ai hoặc cần thêm máy chủ lưu trữ.

### Biên bản PDF

- Biên bản được tạo ngay trong trình duyệt bằng jsPDF 2.5.1 (tải từ cdnjs) và font DejaVu đã nhúng sẵn, nên hiển thị đủ dấu tiếng Việt.
- Trên artifact, biên bản được trao cho người xem qua chức năng tải file của claude.ai, người xem có thể xác nhận hoặc từ chối lưu.
- Chữ ký "Đại diện WCM" lấy từ `sender` trong `docs/data/contacts.js`. Cần điền tên người gửi thật trước khi xuất biên bản đầu tiên.

## Triển khai lên nso.wcm.vn

1. **Bật GitHub Pages:** repo → Settings → Pages → Source chọn *Deploy from a branch*, Branch chọn `claude/warranty-store-analysis-cvqf4v`, thư mục chọn `/docs`, bấm Save.
2. **Gắn tên miền:** trong cùng trang Pages, ô *Custom domain* nhập `nso.wcm.vn`, bấm Save. File `docs/CNAME` đã có sẵn nội dung này.
3. **Tạo bản ghi DNS** trên `wcm.vn` (người quản lý DNS của công ty làm):
   - Loại: `CNAME`
   - Tên: `nso`
   - Giá trị: `phannghiem1111-sys.github.io`
4. Chờ DNS cập nhật (thường vài phút đến vài giờ). Khi trang Pages báo DNS đã đúng, tick *Enforce HTTPS* để bật HTTPS.
5. Mở `https://nso.wcm.vn` để kiểm tra.

Sau khi bật, mỗi lần push lên nhánh này, trang sẽ tự cập nhật.

## Danh bạ email

Sửa `docs/data/contacts.js`, rồi tải lại trang. Danh bạ có bốn phần:

- `contractors`: nhà thầu. `name` phải khớp đúng cột "Nhà Thầu" trong Excel.
- `technicalTeams`: đội kỹ thuật (hộp thư nhóm), có `region`. Được CC khi gửi cho nhà thầu hoặc cửa hàng cùng miền.
- `technicians`: nhân viên kỹ thuật (cá nhân), có `region`.
- `stores`: email cửa hàng, key là mã cửa hàng.
- `sender`: chữ ký cuối email.

Mỗi ô gửi email có hai ô chọn: **Nhóm nhận** và **Người nhận**. Hệ thống tự chọn sẵn người khớp với cửa hàng: nhà thầu theo tên, kỹ thuật theo miền, cửa hàng theo mã. Nếu không khớp, ô hiện "Chọn người nhận" để bạn tự chọn. Địa chỉ hiện ngay trong ô, có nút Sao chép.

Để trống email thì vẫn chọn được người nhận, nhưng địa chỉ sẽ là "Chưa có email". Ứng dụng không có máy chủ nên không tự gửi. Người dùng bấm Mở email rồi bấm Gửi trong ứng dụng mail của mình.

Nếu nút Mở email không hoạt động (ví dụ khi xem qua claude.ai), bấm Sao chép rồi dán địa chỉ vào ứng dụng mail.

## Hạn chế hiện tại

- **Không có đăng nhập.** Ai có đường link `nso.wcm.vn` đều xem được dữ liệu, kể cả khi không thuộc công ty. Dữ liệu có tên nhà thầu và thông tin cửa hàng nên chỉ nên đưa lên đây nếu chấp nhận điều đó. Muốn chặn truy cập ngoài công ty, cần hosting có xác thực (SharePoint nội bộ, server nội bộ).
- **Repo phải là public** để GitHub Pages miễn phí. Nếu repo private, cần gói GitHub hỗ trợ Pages cho private repo.
- **Dữ liệu tĩnh.** Mỗi lần Excel đổi phải chạy lại `build_data.py`. Có thể làm bước nạp Excel trực tiếp trên trình duyệt nếu cần.
- **Sheet BOQ không có cột khối lượng, PIC và trạng thái** (xem I01, I02). Nên bổ sung để dashboard theo dõi được tiến độ từng hạng mục.
- **Cửa hàng 2CBA hiện chỉ có BOQ ẩn.** Sheet này chưa có nhà thầu, miền, và mã đầu việc chưa đối soát được với master, nên xuất hiện ở mục lỗi E06 và cảnh báo W03/W04. Đây là việc cần làm ở nguồn dữ liệu, không phải lỗi của ứng dụng.
- **Chỉ kiểm tra ở mức dữ liệu.** Ứng dụng không biết hợp đồng hay điều kiện loại trừ bảo hành. Kết luận "còn bảo hành" là theo ngày và phạm vi hạng mục trong Excel.
