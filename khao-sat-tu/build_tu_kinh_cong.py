"""Tạo file Excel lọc tủ kính cong cần khảo sát chuẩn bị thay.

Nguồn: phiếu khảo sát 15 cửa hàng (nhập ngày 30/10/2026).
Tiêu chí lọc: MODEL_LOC (mặc định: CH có ghi model tủ đang dùng).
Chạy: python3 khao-sat-tu/build_tu_kinh_cong.py
"""
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = Path(__file__).with_name("tu_kinh_cong_can_thay.xlsx")

# Model được coi là tủ kính cong. Sửa danh sách này nếu đổi tiêu chí.
MODEL_LOC = ["Sanden CAUS-1875G", "Carrier SVEUM 1882P"]

COLS = ["ĐMT", "ĐMH-040", "ĐMH-060",  # hiện trạng
        "ĐMT 1.8m", "ĐMT 2.6m", "ĐMH 1.8", "ĐMH 2.6", "Nâng cấp ĐMH 060", "040"]  # đề xuất

ROWS = [
    ["Lương Định Của", "2641", "Sanden CAUS-1875G", "X", "", "", "", "", "X", "", "X", ""],
    ["Golden River A3, SH10", "3537", "Sanden CAUS-1875G", "X", "", "", "", "X", "", "", "", ""],
    ["CC Lexington", "4239", "Carrier SVEUM 1882P", "X", "", "", "X", "", "", "", "", ""],
    ["Hoàng Anh Riverview", "2026", "Sanden CAUS-1875G", "X", "", "", "", "", "X", "", "X", ""],
    ["Cao Ốc Lexington", "2365", "", "X", "", "", "X", "", "", "", "", ""],
    ["153Z Nguyễn Duy Trinh", "3157", "Sanden CAUS-1875G", "X", "", "", "", "", "X", "", "X", ""],
    ["331C Trần Hưng Đạo", "2023", "Sanden CAUS-1875G", "X", "", "", "", "", "X", "", "X", ""],
    ["232 Lê Văn Thịnh", "6036", "", "", "", "X", "", "", "X", "", "", ""],
    ["Tầng 1+2B Gateway Thảo Điền", "4662", "", "X", "", "", "", "", "", "X", "X", ""],
    ["CC Nu Cui", "4940", "Carrier SVEUM 1882P", "X", "", "", "", "", "X", "", "X", ""],
    ["001 Sava2, CC Avenue", "4772", "Carrier SVEUM 1882P", "X", "", "", "", "", "X", "", "", "X"],
    ["Citi Bella", "3156", "Carrier SVEUM 1882P", "X", "", "", "", "", "X", "", "X", ""],
    ["001G6B, CC Tú Liêm", "5483", "Carrier SVEUM 1882P", "X", "", "", "", "", "X", "", "", "X"],
    ["109 Đường 39", "3469", "Carrier SVEUM 1882P", "X", "", "", "", "", "", "X", "X", ""],
    ["VE_SO6 KĐC New City", "5591", "Carrier SVEUM 1882P", "X", "", "", "X", "", "", "", "", ""],
]

F = "Arial"
thin = Side(style="thin", color="808080")
B = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR = PatternFill("solid", fgColor="D9E1F2")
GRP = PatternFill("solid", fgColor="B4C6E7")
TOT = PatternFill("solid", fgColor="F2F2F2")
HEADERS = ["STT", "Tên cửa hàng (CH)", "Mã SAP", "Model tủ đang sử dụng", *COLS, "Số hạng mục đề xuất"]
NC = len(HEADERS)


def sheet(ws, title, rows, notes):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=NC)
    c = ws.cell(1, 1, title)
    c.font = Font(name=F, size=13, bold=True)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells("E2:G2"); ws.merge_cells("H2:M2")
    for col in range(1, NC + 1):
        ws.cell(2, col).fill = GRP; ws.cell(2, col).border = B
    for col, t in [(5, "Hiện trạng"), (8, "Đề xuất bổ sung / thay thế")]:
        c = ws.cell(2, col, t); c.font = Font(name=F, size=10, bold=True)
        c.alignment = Alignment(horizontal="center")
    for col, t in enumerate(HEADERS, 1):
        c = ws.cell(3, col, t); c.font = Font(name=F, size=10, bold=True); c.fill = HDR; c.border = B
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[3].height = 42
    first, last = 4, 3 + len(rows)
    for i, r in enumerate(rows):
        row = first + i
        name, sap, model, *flags = r
        vals = [i + 1, name, sap, model or None] + [x or None for x in flags]
        vals.append(f'=COUNTIF(H{row}:M{row},"X")')
        for col, v in enumerate(vals, 1):
            c = ws.cell(row, col, v); c.font = Font(name=F, size=10); c.border = B
            c.alignment = Alignment(horizontal="left" if col in (2, 4) else "center", vertical="center", wrap_text=True)
    tr = last + 1
    ws.cell(tr, 2, "Tổng")
    ws.cell(tr, 3, f"=COUNTA(C{first}:C{last})")
    for col in range(5, NC + 1):
        L = get_column_letter(col)
        ws.cell(tr, col, f"=SUM({L}{first}:{L}{last})" if col == NC else f'=COUNTIF({L}{first}:{L}{last},"X")')
    for col in range(1, NC + 1):
        c = ws.cell(tr, col); c.font = Font(name=F, size=10, bold=True); c.fill = TOT; c.border = B
        c.alignment = Alignment(horizontal="left" if col == 2 else "center")
    for i, t in enumerate(notes):
        ws.cell(tr + 2 + i, 2, t).font = Font(name=F, size=10, bold=(i == 0))
    for col, w in {1: 6, 2: 30, 3: 11, 4: 22, 5: 9, 6: 10, 7: 10, 8: 11, 9: 11, 10: 11, 11: 11, 12: 16, 13: 11, 14: 14}.items():
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.freeze_panes = "C4"


wb = Workbook()
loc = [r for r in ROWS if r[2] in MODEL_LOC]
sheet(wb.active, "Tủ kính cong cần khảo sát chuẩn bị thay", loc, [
    "Ghi chú",
    "1. Tiêu chí lọc: CH có model tủ đang dùng là " + " hoặc ".join(MODEL_LOC) + ".",
    f"2. Lọc được {len(loc)}/{len(ROWS)} CH. Các CH không ghi model trên phiếu không nằm trong danh sách này.",
    "3. Model tủ, tên CH và mã SAP đọc từ chữ viết tay, cần đối chiếu phiếu gốc (vd mã 331C Trần Hưng Đạo: 2023 hay 8023).",
])
wb.active.title = "Tủ kính cong cần thay"
sheet(wb.create_sheet("Danh sách CH"), "Danh sách cửa hàng: hiện trạng tủ và đề xuất bổ sung", ROWS, [
    "Ghi chú",
    "1. X: có (hiện trạng) hoặc đề xuất. Ô trống: không. Dấu \"-\" trên phiếu coi là ô trống.",
    "2. Cột \"040\" bị mất mép giấy trên phiếu, tên đầy đủ chưa rõ.",
])
wb.save(OUT)
print("saved", OUT, "rows", len(loc))
