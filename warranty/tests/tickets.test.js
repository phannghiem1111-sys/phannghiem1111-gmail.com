// Chạy: node --test warranty/tests/tickets.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const T = require(path.join(__dirname, '..', '..', 'docs', 'js', 'tickets.js'));

const store = { code: '2CAO', storeName: 'WM+ LDG 59 Tuyên Quang', region: 'Miền Nam', contractor: 'Phú Mỹ', handover: '2026-04-29', warrantyEnd: '2027-04-29' };
const warranty = { status: 'ok', daysLeft: 199, endDate: '2027-04-29' };
const base = { storeCode: '2CAO', item: 'Móng, giằng BTCT', itemCode: 'BHXDA001', reason: 'Hư hỏng do sự cố lún nền móng', detail: '  Nứt chân tường  ', priority: 'urgent', deadline: '2026-10-20', createdBy: 'Nguyễn Văn A' };
const opts = { nowIso: '2026-10-12T09:30:00', createdDate: '2026-10-12', rng: () => 0.5 };

test('Mã sự vụ đúng định dạng SV-YYMM-XXXX', () => {
  const id = T.newTicketId('2026-10-12', () => 0);
  assert.match(id, /^SV-2610-[A-Z2-9]{4}$/);
});

test('Kiểm tra nhập liệu: thiếu cửa hàng, hạng mục, hạn, người tạo', () => {
  const errors = T.validateTicketInput({ storeCode: '', item: '', deadline: '', createdBy: ' ' });
  assert.equal(errors.length, 4);
});

test('Hạn phản hồi trước ngày tạo bị từ chối', () => {
  const errors = T.validateTicketInput({ ...base, createdDate: '2026-10-12', deadline: '2026-10-01' });
  assert.ok(errors.some((e) => e.includes('không được trước ngày tạo')));
});

test('Tạo sự vụ lưu ảnh chụp bảo hành và chuẩn hóa mô tả', () => {
  const t = T.buildTicket(base, store, warranty, opts);
  assert.equal(t.warrantyStatus, 'ok');
  assert.equal(t.warrantyDaysLeft, 199);
  assert.equal(t.detail, 'Nứt chân tường');
  assert.equal(t.priority, 'urgent');
  assert.equal(t.contractor, 'Phú Mỹ');
});

test('Sai mức độ thì về mức Thường', () => {
  const t = T.buildTicket({ ...base, priority: 'lạ' }, store, warranty, opts);
  assert.equal(t.priority, 'normal');
});

test('Trạng thái lấy từ sự kiện gần nhất, không ghi đè khi nhiều người cập nhật', () => {
  const t = T.buildTicket(base, store, warranty, opts);
  const created = T.buildEvent(t.id, 'create', { atIso: '2026-10-12T09:30:00', by: 'A', rng: () => 0.1 });
  const sent = T.buildEvent(t.id, 'sent', { atIso: '2026-10-12T10:00:00', by: 'A', rng: () => 0.2 });
  const reported = T.buildEvent(t.id, 'status', { status: 'Đang xử lý', note: 'Đã cử người', by: 'B', atIso: '2026-10-14T15:00:00', reportedDate: '2026-10-14', rng: () => 0.3 });
  const view = T.ticketView(t, [reported, created, sent], '2026-10-16');
  assert.equal(view.status, 'Đang xử lý');
  assert.equal(view.events.length, 3);
  assert.equal(view.events[0].type, 'create', 'diễn biến theo thời gian');
  assert.equal(view.open, true);
});

test('Quá hạn tính theo ngày hiện tại, sự vụ đã đóng không quá hạn', () => {
  const t = T.buildTicket(base, store, warranty, opts);
  const open = T.ticketView(t, [], '2026-10-25');
  assert.equal(open.overdueDays, 5);
  const closeEv = T.buildEvent(t.id, 'close', { atIso: '2026-10-24T08:00:00', by: 'A', rng: () => 0.4 });
  const closed = T.ticketView(t, [closeEv], '2026-10-25');
  assert.equal(closed.status, 'Đã đóng');
  assert.equal(closed.open, false);
  assert.equal(closed.overdueDays, 0);
});

test('Tình trạng nhà thầu phải nằm trong danh sách hợp lệ', () => {
  const t = T.buildTicket(base, store, warranty, opts);
  assert.throws(() => T.buildEvent(t.id, 'status', { status: 'Tùy ý', by: 'A', atIso: '2026-10-14T10:00:00' }), /tình trạng hợp lệ/);
  assert.throws(() => T.buildEvent(t.id, 'status', { status: 'Đang xử lý', by: '', atIso: '2026-10-14T10:00:00' }), /người ghi nhận/);
});

test('Bộ lọc và số liệu tổng hợp', () => {
  const t1 = T.buildTicket(base, store, warranty, opts);
  const t2 = T.buildTicket({ ...base, item: 'Dây điện' }, store, warranty, { ...opts, rng: () => 0.9 });
  const views = [T.ticketView(t1, [], '2026-10-25'), T.ticketView(t2, [], '2026-10-01')];
  const sum = T.summarize(views);
  assert.equal(sum.total, 2);
  assert.equal(sum.overdue, 1);
  assert.equal(T.filterViews(views, 'overdue').length, 1);
});

test('Dữ liệu biên bản có tên file không dấu và đủ diễn biến', () => {
  const t = T.buildTicket(base, store, warranty, opts);
  const e = T.buildEvent(t.id, 'status', { status: 'Đang xử lý', note: 'Đã cử người', by: 'B', atIso: '2026-10-14T15:00:00', reportedDate: '2026-10-14', rng: () => 0.3 });
  const view = T.ticketView(t, [e], '2026-10-16');
  const m = T.minutesModel(view, store, { sender: 'Người gửi', generatedAt: '2026-10-16T08:00:00' });
  assert.equal(m.events[0].date, '14/10/2026');
  assert.equal(m.warrantyText, 'Còn bảo hành, còn 199 ngày (đến 29/04/2027)');
  assert.equal(T.minutesFilename(t.id), `Bien-ban-${t.id}.pdf`);
  assert.ok(m.requestLine.includes('Phú Mỹ'));
});
