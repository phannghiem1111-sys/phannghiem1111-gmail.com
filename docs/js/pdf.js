/*
 * Xuất biên bản sự vụ thành PDF bằng jsPDF, dùng font DejaVu đã nhúng để hiển thị đủ dấu tiếng Việt.
 * Nhận dữ liệu từ WarrantyTickets.minutesModel(). Trả về ArrayBuffer để trao cho downloads.save hoặc tải về.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarrantyPdf = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PAGE_W = 210;
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM = 276; // chừa chỗ cho chân trang
  const LINE_H = 4.6;
  const FONT = 'DejaVu';
  const TABLE_COLS = [22, 34, 36, 0, 30]; // Ngày, Hành động, Tình trạng, Ghi chú (co giãn), Người ghi
  const TABLE_HEAD = ['Ngày', 'Hành động', 'Tình trạng', 'Ghi chú', 'Người ghi'];

  /**
   * jsPDF: constructor (window.jspdf.jsPDF). fonts: { regular, bold } dạng base64 TTF.
   * Trả về ArrayBuffer của file PDF.
   */
  function buildMinutesPdf(model, { jsPDF, fonts }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
    doc.addFont('DejaVuSans.ttf', FONT, 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
    doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');

    let y = MARGIN;
    const font = (style, size) => {
      doc.setFont(FONT, style);
      doc.setFontSize(size);
    };
    const wrap = (text, width) => doc.splitTextToSize(String(text || '—'), width);
    const ensure = (h) => {
      if (y + h > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
    };
    const drawLines = (lines, x, lh = LINE_H) => {
      lines.forEach((ln, i) => doc.text(ln, x, y + i * lh + 3.2));
      return lines.length * lh;
    };

    // Tiêu đề
    font('normal', 8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('WCM · Bảo hành cửa hàng', MARGIN, y + 3);
    y += 6;
    font('bold', 16);
    doc.setTextColor(15, 23, 42);
    doc.text(model.title, MARGIN, y + 6);
    y += 11;
    font('bold', 11);
    doc.setTextColor(218, 37, 29);
    doc.text(`Mã sự vụ: ${model.ticketId}`, MARGIN, y + 4);
    font('normal', 9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Trạng thái: ${model.status}   ·   Mức độ: ${model.priority}   ·   Lập lúc: ${model.createdAt}`, MARGIN, y + 9);
    y += 14;

    const section = (title) => {
      ensure(14);
      font('bold', 10.5);
      doc.setTextColor(15, 23, 42);
      doc.text(title, MARGIN, y + 4);
      doc.setDrawColor(203, 213, 225);
      doc.line(MARGIN, y + 6.5, PAGE_W - MARGIN, y + 6.5);
      y += 10;
    };

    const kv = (label, value) => {
      const valueW = CONTENT_W - 44;
      const lines = wrap(value, valueW);
      const h = lines.length * LINE_H + 2;
      ensure(h);
      font('bold', 9);
      doc.setTextColor(71, 85, 105);
      doc.text(label, MARGIN, y + 3.2);
      font('normal', 9.5);
      doc.setTextColor(15, 23, 42);
      drawLines(lines, MARGIN + 44);
      y += h;
    };

    const paragraph = (text, size = 9.5) => {
      font('normal', size);
      doc.setTextColor(15, 23, 42);
      const lines = wrap(text, CONTENT_W);
      ensure(lines.length * LINE_H + 2);
      y += drawLines(lines, MARGIN) + 2;
    };

    // Cửa hàng và bảo hành
    section('1. Cửa hàng và bảo hành');
    kv('Cửa hàng', `${model.store.code}${model.store.name ? ' · ' + model.store.name : ''}`);
    kv('Miền', model.store.region || '—');
    kv('Nhà thầu', model.store.contractor || 'Chưa có trong danh bạ');
    kv('Bảo hành', model.warrantyText);
    y += 2;

    // Nội dung sự vụ
    section('2. Nội dung sự vụ');
    kv('Hạng mục (BOQ)', model.item);
    kv('Mã đầu việc BH', model.itemCode || '—');
    kv('Nội dung hư hỏng', model.reason || '—');
    kv('Hạn phản hồi', model.deadline + (model.overdueDays > 0 ? `  (quá hạn ${model.overdueDays} ngày)` : ''));
    if (model.detail) kv('Mô tả', model.detail);
    kv('Người tạo', model.createdBy || '—');
    y += 2;

    // Diễn biến
    section('3. Diễn biến và tình trạng nhà thầu báo về');
    const drawRow = (cells, { head = false } = {}) => {
      const widths = TABLE_COLS.map((w) => w);
      const used = widths.reduce((s, w) => s + w, 0);
      widths[3] = CONTENT_W - (used - widths[3]);
      const cellLines = cells.map((c, i) => {
        font(head ? 'bold' : 'normal', head ? 8.5 : 8.8);
        return wrap(c, widths[i] - 3);
      });
      const h = Math.max(...cellLines.map((l) => l.length)) * LINE_H + 2.6;
      ensure(h);
      if (head) {
        doc.setFillColor(241, 245, 249);
        doc.rect(MARGIN, y, CONTENT_W, h, 'F');
      }
      let x = MARGIN;
      cellLines.forEach((lines, i) => {
        font(head ? 'bold' : 'normal', head ? 8.5 : 8.8);
        doc.setTextColor(head ? 71 : 15, head ? 85 : 23, head ? 105 : 42);
        drawLines(lines, x + 1.5);
        x += widths[i];
      });
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGIN, y + h, PAGE_W - MARGIN, y + h);
      y += h;
    };
    drawRow(TABLE_HEAD, { head: true });
    if (!model.events.length) {
      paragraph('Chưa có tình trạng nào được ghi nhận.', 9);
    } else {
      model.events.forEach((e) => drawRow([e.date, e.label, e.status, e.note || '—', e.by]));
    }
    y += 4;

    // Đề nghị và chữ ký
    section('4. Đề nghị và xác nhận');
    paragraph(model.requestLine);
    y += 6;
    ensure(34);
    font('bold', 9.5);
    doc.setTextColor(15, 23, 42);
    const colW = CONTENT_W / 2;
    doc.text('Đại diện nhà thầu', MARGIN, y + 4);
    doc.text('Đại diện WCM', MARGIN + colW, y + 4);
    font('normal', 8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(model.store.contractor || '', MARGIN, y + 9);
    doc.text(model.sender || '', MARGIN + colW, y + 9);
    doc.setDrawColor(148, 163, 184);
    doc.line(MARGIN, y + 26, MARGIN + colW - 10, y + 26);
    doc.line(MARGIN + colW, y + 26, PAGE_W - MARGIN - 10, y + 26);
    font('normal', 8.5);
    doc.text('Họ tên, chữ ký, ngày ký', MARGIN, y + 30);
    doc.text('Họ tên, chữ ký, ngày ký', MARGIN + colW, y + 30);
    y += 36;

    // Chân trang: đánh số trang ở mọi trang
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      font('normal', 8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Mã sự vụ ${model.ticketId} · Lập bởi WCM lúc ${model.generatedAt}`, MARGIN, 287);
      doc.text(`Trang ${p}/${pages}`, PAGE_W - MARGIN, 287, { align: 'right' });
    }

    return doc.output('arraybuffer');
  }

  return { buildMinutesPdf, TABLE_COLS };
});
