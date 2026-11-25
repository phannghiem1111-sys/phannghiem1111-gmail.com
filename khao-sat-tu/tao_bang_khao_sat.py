"""Tạo file Excel bảng khảo sát tủ 15 cửa hàng từ phiếu viết tay (phieu-goc.webp).

Chạy: python3 tao_bang_khao_sat.py  ->  bang_khao_sat_cua_hang.xlsx (cùng thư mục)
Ô tô vàng + comment = chữ viết tay chưa chắc, cần đối chiếu phiếu gốc.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.page import PageMargins

OUT = Path(__file__).with_name("bang_khao_sat_cua_hang.xlsx")

SANDEN = "Sanden CAUS-1875G"
CARRIER = "Carrier SVEUM 1882P"

# Cột: A Tên CH | B Mã SAP | C Model tủ | D ĐMT | E ĐMH-040 | F ĐMH-060 (hiện trạng)
#      G ĐMT 1,8m | H ĐMT 2,6m | I ĐMH 1,8 | J ĐMH 2,6 | K Nâng cấp ĐMH 060 | L 040 (đề xuất)
# (tên CH, mã SAP, model, các cột có dấu X)
ROWS = [
    ("Lương Định Của", "2641", SANDEN, "DIK"),
    ("Golden River A3, SH10", "3537", SANDEN, "DH"),
    ("CC Lexington", "4239", CARRIER, "DG"),
    ("Hoàng Anh Riverview", "2026", SANDEN, "DIK"),
    ("Cao Ốc Lexington", "2965", None, "DG"),
    ("537 Nguyễn Duy Trinh", "3157", SANDEN, "DIK"),
    ("331C Trần Hưng Đạo", "2023", SANDEN, "DIK"),
    ("232 Lê Văn Thịnh", "6036", None, "FI"),
    ("Tầng 1 + 2B Gateway Thảo Điền", "4662", None, "DJK"),
    ("CC Nu Cui", "4940", CARRIER, "DIK"),
    ("001 Sava2, CC Avenue", "4772", CARRIER, "DIL"),
    ("Citi Bella", "3156", CARRIER, "DIK"),
    ("001 Lô B, CC Thủ Thiêm", "5483", CARRIER, "DIL"),
    ("109 Đường 39", "3469", CARRIER, "DJK"),
    ("VE_S06 KDC New City", "5591", CARRIER, "DG"),
]

FIRST = 4  # dòng dữ liệu đầu tiên

# Ô chưa chắc: (số thứ tự CH 1..15; 0 = dòng tiêu đề 2; -1 = dòng tiêu đề 1, cột) -> ghi chú
UNSURE = {
    (5, "B"): "Mã đọc là 2965, có thể là 2365.",
    (7, "B"): "Mã đọc là 2023, có thể là 8023.",
    (8, "A"): "Tên viết tay khó đọc: 232 Lê Văn Thịnh.",
    (10, "A"): "Tên viết tay khó đọc: CC Nu Cui (có thể Nu Cú).",
    (11, "A"): "Tên viết tay khó đọc: CC Avenue / Avalon?",
    (13, "A"): "Phiếu ghi '001 Lô B' (có thể 001.6B), CC Thủ Thiêm.",
    (14, "A"): "Số nhà đọc là 109, có thể 103.",
    (8, "F"): "Dấu X nằm sát đường kẻ giữa 2 dòng, gán theo dòng gần nhất.",
    (9, "D"): "Dấu X nằm sát đường kẻ giữa dòng 9 và 10, gán cho dòng 9.",
    (11, "L"): "Dấu giống tick hơn X; cột 040 bị mất mép phiếu.",
    (13, "L"): "Dấu giống tick hơn X; cột 040 bị mất mép phiếu.",
    (0, "C"): "Model đọc gần đúng: Sanden CAUS-1875G (hoặc CAS/CUS-1875G), Carrier SVEUM 1882P (hoặc SVELIM).",
    (-1, "G"): "Tiêu đề nhóm trên phiếu khó đọc (có thể 'Đề xuất khảo sát').",
    (0, "L"): "Tên cột bị mất mép phiếu, tạm ghi 'ĐMH 040'.",
}

FONT = "Arial"


def addr(idx, col):
    row = {0: 2, -1: 1}.get(idx, FIRST + idx - 1)
    return f"{col}{row}"

thin = Side(style="thin", color="000000")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HEADER_FILL = PatternFill("solid", fgColor="E7E6E6")
UNSURE_FILL = PatternFill("solid", fgColor="FFF2CC")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)


def build():
    wb = Workbook()
    ws = wb.active
    ws.title = "Khảo sát cửa hàng"

    # Tiêu đề 3 dòng gộp ô
    for rng in ("A1:A3", "B1:B3", "C1:F1", "G1:L1", "C2:C3", "D2:D3", "E2:E3", "F2:F3"):
        ws.merge_cells(rng)
    ws["A1"], ws["B1"] = "Tên CH", "Mã SAP"
    ws["C1"], ws["G1"] = "Hiện trạng", "Đề xuất thay đổi"
    ws["C2"], ws["D2"], ws["E2"], ws["F2"] = "Model tủ đang sử dụng", "ĐMT", "ĐMH-040", "ĐMH-060"
    sub = {"G": ("ĐMT", "1,8m"), "H": ("ĐMT", "2,6m"), "I": ("ĐMH", "1,8"),
           "J": ("ĐMH", "2,6"), "K": ("Nâng cấp ĐMH", "060"), "L": ("ĐMH", "040")}
    for col, (top, bottom) in sub.items():
        ws[f"{col}2"], ws[f"{col}3"] = top, bottom

    for i, (name, code, model, marks) in enumerate(ROWS):
        r = FIRST + i
        ws[f"A{r}"], ws[f"B{r}"], ws[f"C{r}"] = name, code, model
        for col in marks:
            ws[f"{col}{r}"] = "X"
    last = FIRST + len(ROWS) - 1

    for row in ws[f"A1:L{last}"]:
        for c in row:
            c.font = Font(name=FONT, size=10, bold=c.row <= 3)
            c.border = BORDER
            if c.row <= 3:
                c.fill, c.alignment = HEADER_FILL, CENTER
            else:
                c.alignment = LEFT if c.column_letter in "AC" else CENTER

    for (idx, col), note in UNSURE.items():
        cell = ws[addr(idx, col)]
        cell.fill = UNSURE_FILL
        cell.comment = Comment(note, "Kiểm tra")

    widths = {"A": 32, "B": 10, "C": 24, **{c: 11 for c in "DEFGHIJKL"}}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    ws.row_dimensions[2].height = 30
    ws.freeze_panes = "D4"

    note_row = last + 2
    ws[f"A{note_row}"] = "Ghi chú: ô tô vàng là chữ viết tay chưa chắc (rê chuột xem comment). Dấu '-' trên phiếu coi là ô trống."
    ws[f"A{note_row}"].font = Font(name=FONT, size=9, italic=True)

    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.5, bottom=0.5)

    # Sheet liệt kê ô cần kiểm tra
    ck = wb.create_sheet("Cần kiểm tra")
    ck.append(["Ô", "Cửa hàng", "Nội dung cần kiểm tra"])
    for (idx, col), note in UNSURE.items():
        ck.append([addr(idx, col), "(tiêu đề)" if idx <= 0 else ROWS[idx - 1][0], note])
    for row in ck.iter_rows():
        for c in row:
            c.font = Font(name=FONT, size=10, bold=c.row == 1)
            c.border = BORDER
            c.alignment = LEFT
    for col, w in {"A": 8, "B": 30, "C": 80}.items():
        ck.column_dimensions[col].width = w

    wb.save(OUT)
    return OUT


if __name__ == "__main__":
    print("saved", build())
