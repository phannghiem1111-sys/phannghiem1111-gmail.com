/*
 * Sự vụ bảo hành: tạo phiếu gửi nhà thầu, ghi nhận tình trạng, theo dõi quá hạn.
 * Thuần JS, không phụ thuộc DOM. Dùng chung cho trình duyệt (window.WarrantyTickets) và node (tests).
 *
 * Mô hình: mỗi sự vụ là một phiếu (ticket) bất biến sau khi tạo. Mọi thay đổi là một sự kiện (event)
 * ghi thêm. Trạng thái hiện tại là trạng thái của sự kiện gần nhất. Nhờ vậy nhiều người cùng cập nhật
 * không ghi đè nhau.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarrantyTickets = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STATUSES = ['Mới', 'Đã gửi nhà thầu', 'Nhà thầu đã phản hồi', 'Đang xử lý', 'Đã xử lý', 'Đã đóng'];
  const CLOSED_STATUSES = ['Đã xử lý', 'Đã đóng'];
  const PRIORITIES = { normal: 'Thường', urgent: 'Gấp', critical: 'Khẩn' };
  const EVENT_TYPES = {
    create: { label: 'Tạo sự vụ', status: 'Mới' },
    sent: { label: 'Gửi nhà thầu', status: 'Đã gửi nhà thầu' },
    status: { label: 'Nhận tình trạng từ nhà thầu' },
    close: { label: 'Đóng sự vụ', status: 'Đã đóng' },
  };
  const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const pad2 = (n) => String(n).padStart(2, '0');

  /** Số ngày từ fromIso đến toIso, cả hai dạng 'YYYY-MM-DD'. */
  function dayDiff(fromIso, toIso) {
    if (!fromIso || !toIso) return null;
    const [y1, m1, d1] = fromIso.split('-').map(Number);
    const [y2, m2, d2] = toIso.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  /** Mã sự vụ dạng SV-YYMM-XXXX. rng trả về số trong [0, 1), truyền vào để kiểm thử ổn định. */
  function newTicketId(dateIso, rng = Math.random) {
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += ID_CHARS[Math.floor(rng() * ID_CHARS.length)];
    const [y, m] = dateIso.split('-');
    return `SV-${y.slice(2)}${m}-${suffix}`;
  }

  /** Mã sự kiện, dùng làm id tài liệu để không trùng giữa các người cập nhật. */
  function newEventId(atIso, rng = Math.random) {
    const stamp = atIso.replace(/\D/g, '').slice(0, 14);
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += ID_CHARS[Math.floor(rng() * ID_CHARS.length)];
    return `EV${stamp}${suffix}`;
  }

  /** Lỗi nhập liệu khi tạo sự vụ. Trả về mảng thông báo tiếng Việt, rỗng nghĩa là hợp lệ. */
  function validateTicketInput(input) {
    const errors = [];
    if (!input.storeCode) errors.push('Chọn cửa hàng.');
    if (!input.item) errors.push('Chọn hạng mục cần sửa.');
    if (!input.deadline) errors.push('Chọn hạn phản hồi của nhà thầu.');
    if (input.deadline && input.createdDate && input.deadline < input.createdDate) {
      errors.push('Hạn phản hồi không được trước ngày tạo sự vụ.');
    }
    if (!input.createdBy || !String(input.createdBy).trim()) errors.push('Nhập tên người tạo sự vụ.');
    return errors;
  }

  /**
   * Tạo phiếu sự vụ. store: mục cửa hàng từ mô hình, warranty: kết quả warrantyInfo tại thời điểm tạo.
   * Ảnh chụp bảo hành được lưu cùng phiếu, để sau này biết tình trạng lúc mở sự vụ.
   */
  function buildTicket(input, store, warranty, { nowIso, createdDate, rng } = {}) {
    const errors = validateTicketInput({ ...input, createdDate });
    if (errors.length) throw new Error(errors.join(' '));
    return {
      id: newTicketId(createdDate, rng),
      storeCode: store.code,
      storeName: store.storeName || '',
      region: store.region || '',
      contractor: store.contractor || '',
      item: input.item,
      itemCode: input.itemCode || '',
      reason: input.reason || '',
      detail: (input.detail || '').trim(),
      priority: PRIORITIES[input.priority] ? input.priority : 'normal',
      deadline: input.deadline,
      createdAt: nowIso,
      createdBy: String(input.createdBy).trim(),
      warrantyStatus: warranty.status,
      warrantyEnd: warranty.endDate || '',
      warrantyDaysLeft: warranty.daysLeft,
    };
  }

  /**
   * Sự kiện ghi thêm vào sự vụ. type: 'create' | 'sent' | 'status' | 'close'.
   * Với 'status' phải có status hợp lệ (tình trạng nhà thầu báo về). reportedDate là ngày nhà thầu báo.
   */
  function buildEvent(ticketId, type, { status, note, by, atIso, reportedDate, rng } = {}) {
    const spec = EVENT_TYPES[type];
    if (!spec) throw new Error(`Loại sự kiện không hợp lệ: ${type}`);
    const finalStatus = type === 'status' ? status : spec.status;
    if (!STATUSES.includes(finalStatus)) throw new Error('Chọn tình trạng hợp lệ.');
    if (!String(by || '').trim()) throw new Error('Nhập tên người ghi nhận.');
    return {
      id: newEventId(atIso, rng),
      ticketId,
      type,
      status: finalStatus,
      note: (note || '').trim(),
      by: String(by).trim(),
      at: atIso,
      reportedDate: reportedDate || atIso.slice(0, 10),
    };
  }

  /** Trạng thái hiện tại: trạng thái của sự kiện gần nhất. Chưa có sự kiện nào thì là 'Mới'. */
  function currentStatus(events) {
    const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
    return sorted.length ? sorted[sorted.length - 1].status : 'Mới';
  }

  /**
   * Hiển thị đầy đủ một sự vụ: trạng thái, quá hạn, diễn biến theo thời gian.
   * asOf là ngày so sánh 'YYYY-MM-DD'.
   */
  function ticketView(ticket, allEvents, asOf) {
    const events = allEvents
      .filter((e) => e.ticketId === ticket.id)
      .sort((a, b) => a.at.localeCompare(b.at));
    const status = currentStatus(events);
    const open = !CLOSED_STATUSES.includes(status) && status !== 'Đã đóng';
    const overdueDays = open && ticket.deadline ? Math.max(0, dayDiff(ticket.deadline, asOf)) : 0;
    return {
      ...ticket,
      status,
      open,
      overdueDays,
      events,
      lastAt: events.length ? events[events.length - 1].at : ticket.createdAt,
    };
  }

  /** Lọc danh sách: 'open' (đang mở), 'overdue' (quá hạn), 'closed' (đã đóng), 'all'. */
  function filterViews(views, filter) {
    if (filter === 'open') return views.filter((v) => v.open);
    if (filter === 'overdue') return views.filter((v) => v.overdueDays > 0);
    if (filter === 'closed') return views.filter((v) => !v.open);
    return views;
  }

  /** Số liệu tổng hợp cho dashboard. */
  function summarize(views) {
    const byStatus = {};
    for (const v of views) byStatus[v.status] = (byStatus[v.status] || 0) + 1;
    return {
      total: views.length,
      open: views.filter((v) => v.open).length,
      overdue: views.filter((v) => v.overdueDays > 0).length,
      closed: views.filter((v) => !v.open).length,
      byStatus,
    };
  }

  /** Dữ liệu cho biên bản PDF, tách khỏi phần vẽ để có thể kiểm thử. */
  function minutesModel(view, store, { sender, generatedAt }) {
    const warrantyText =
      view.warrantyStatus === 'expired'
        ? `Hết bảo hành ngày ${fmtDate(view.warrantyEnd)}`
        : view.warrantyDaysLeft === null || view.warrantyDaysLeft === undefined
          ? 'Chưa rõ ngày bảo hành'
          : `Còn bảo hành, còn ${view.warrantyDaysLeft} ngày (đến ${fmtDate(view.warrantyEnd)})`;
    return {
      title: 'Biên bản sự vụ bảo hành',
      ticketId: view.id,
      status: view.status,
      priority: PRIORITIES[view.priority] || PRIORITIES.normal,
      createdAt: fmtDateTime(view.createdAt),
      createdBy: view.createdBy,
      deadline: fmtDate(view.deadline),
      overdueDays: view.overdueDays,
      store: {
        code: view.storeCode,
        name: view.storeName || (store && store.storeName) || '',
        region: view.region || '',
        contractor: view.contractor || '',
      },
      warrantyText,
      item: view.item,
      itemCode: view.itemCode,
      reason: view.reason,
      detail: view.detail,
      events: view.events.map((e) => ({
        date: fmtDate(e.reportedDate),
        label: EVENT_TYPES[e.type] ? EVENT_TYPES[e.type].label : e.type,
        status: e.status,
        note: e.note,
        by: e.by,
      })),
      requestLine: `Đề nghị nhà thầu ${view.contractor || ''}`.trim() +
        ' xác nhận phương án xử lý, thời gian cam kết và báo lại tình trạng cho WCM.',
      sender: sender || '',
      generatedAt: fmtDateTime(generatedAt),
    };
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = iso.slice(0, 10);
    const t = iso.length > 10 ? iso.slice(11, 16) : '';
    return t ? `${fmtDate(d)} ${t}` : fmtDate(d);
  }

  /** Tên file biên bản, không dấu để tương thích mọi hệ thống. */
  function minutesFilename(ticketId) {
    return `Bien-ban-${ticketId}.pdf`;
  }

  return {
    STATUSES,
    CLOSED_STATUSES,
    PRIORITIES,
    EVENT_TYPES,
    dayDiff,
    newTicketId,
    newEventId,
    validateTicketInput,
    buildTicket,
    buildEvent,
    currentStatus,
    ticketView,
    filterViews,
    summarize,
    minutesModel,
    minutesFilename,
  };
});
