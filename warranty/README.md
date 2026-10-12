# Bảo hành cửa hàng: tra cứu và dashboard

Ứng dụng web tĩnh (HTML + JavaScript thuần, không cần build, không cần server) để:

- **Tra cứu**: chọn/chạm mã cửa hàng → nhóm hạng mục → hạng mục → nội dung hư hỏng. Ứng dụng cho biết hạng mục còn bảo hành hay không, mã đầu việc, nhà thầu và các yêu cầu đang mở.
- **Dashboard**: cửa hàng còn bảo hành, cảnh báo sắp hết bảo hành, lỗi cần xử lý và đã xử lý, kiểm tra chất lượng dữ liệu.
- **Gửi email**: nút mở sẵn email gửi nhà thầu, cửa hàng hoặc kỹ thuật, có đủ thông tin hạng mục và yêu cầu. Người gửi kiểm tra rồi bấm Gửi.

## Mở ứng dụng

- Mở trực tiếp `warranty/index.html` bằng trình duyệt, kể cả trên điện thoại.
- Hoặc đưa thư mục `warranty/` lên nơi lưu trữ tĩnh (GitHub Pages, SharePoint, file server nội bộ).

Trang dùng font Inter và Font Awesome từ CDN. Không có mạng thì trang vẫn chạy, chỉ mất icon và font.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Giao diện (tab Tra cứu và Dashboard), CSS nằm trong file |
| `js/analysis.js` | Lõi phân tích: tính ngày còn lại, trạng thái yêu cầu, xác nhận, kiểm tra dữ liệu, tạo email |
| `js/app.js` | Điều khiển giao diện, không chứa logic nghiệp vụ |
| `data/warranty-data.js` | Dữ liệu đã chuyển từ Excel. **Tự sinh, không sửa tay** |
| `data/contacts.js` | Danh bạ email nhà thầu, cửa hàng, kỹ thuật. **Sửa tay ở đây** |
| `tools/build_data.py` | Đọc file Excel và sinh `data/warranty-data.js` |
| `source/` | File Excel gốc đang dùng |
| `tests/analysis.test.js` | Kiểm thử lõi phân tích trên dữ liệu thật |

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

Ngưỡng và quy tắc nằm ở đầu `js/analysis.js` (`CONFIG`) và trong hàm `classifyStatus`.

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

## Danh bạ email

Sửa `data/contacts.js`:

- `sender`: chữ ký cuối email.
- `contractors`: key là tên nhà thầu đúng như cột "Nhà Thầu" trong Excel.
- `stores`: key là mã cửa hàng.
- `technicians`: key là miền. `default` dùng khi miền không có trong danh sách.

Để trống email thì nút vẫn mở email, người gửi tự điền người nhận. Ứng dụng không có máy chủ nên không tự gửi được. Người dùng luôn bấm Gửi trong ứng dụng email của mình.

## Hạn chế hiện tại

- **Không có đăng nhập.** Ai có đường link trang đều xem được dữ liệu. Nếu dữ liệu nhạy cảm, đặt thư mục trên nơi có kiểm soát truy cập (SharePoint nội bộ, server có xác thực).
- **Dữ liệu tĩnh.** Mỗi lần Excel đổi phải chạy lại `build_data.py`. Có thể làm bước nạp Excel trực tiếp trên trình duyệt nếu cần.
- **Sheet BOQ không có cột khối lượng, PIC và trạng thái** (xem I01, I02). Nên bổ sung để dashboard theo dõi được tiến độ từng hạng mục.
- **Cửa hàng 2CBA hiện chỉ có BOQ ẩn.** Sheet này chưa có nhà thầu, miền, và mã đầu việc chưa đối soát được với master, nên xuất hiện ở mục lỗi E06 và cảnh báo W03/W04. Đây là việc cần làm ở nguồn dữ liệu, không phải lỗi của ứng dụng.
- **Chỉ kiểm tra ở mức dữ liệu.** Ứng dụng không biết hợp đồng hay điều kiện loại trừ bảo hành. Kết luận "còn bảo hành" là theo ngày và phạm vi hạng mục trong Excel.
