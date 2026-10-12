// Chạy: node --test warranty/tests/analysis.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

globalThis.window = globalThis;
require(path.join(__dirname, '..', 'data', 'warranty-data.js'));
const A = require(path.join(__dirname, '..', 'js', 'analysis.js'));

const DATA = globalThis.WARRANTY_DATA;
const ASOF = '2026-10-12';
const model = A.buildModel(DATA, ASOF);
const check = (id) => model.checks.find((c) => c.id === id);

test('ETL: đọc đủ sheet, đúng số dòng', () => {
  assert.equal(DATA.boqRows.length, 212, '63 dòng BOQ hiển thị + 149 dòng sheet ẩn');
  assert.equal(DATA.requestRows.length, 9);
  assert.equal(DATA.reasonMaster.length, 63);
  assert.equal(DATA.meta.etlWarnings.length, 0);
  assert.deepEqual([...new Set(DATA.boqRows.map((r) => r.storeCode))].sort(), ['2CAO', '2CBA']);
});

test('Cửa hàng: thông tin bảo hành và số hạng mục', () => {
  assert.equal(model.stores.length, 2);
  const cao = model.storeMap.get('2CAO');
  assert.equal(cao.contractor, 'Phú Mỹ');
  assert.equal(cao.region, 'Miền Nam');
  assert.equal(cao.handover, '2026-04-29');
  assert.equal(cao.warrantyEnd, '2027-04-29');
  assert.equal(cao.itemCount, 63);
  assert.equal(model.storeMap.get('2CBA').itemCount, 149);
  assert.equal(model.storeMap.get('2CBA').contractor, null, 'sheet ẩn không có cột nhà thầu');
});

test('Bảo hành: số ngày còn lại theo ngày hiện tại', () => {
  const cao = A.warrantyInfo('2026-04-29', '2027-04-29', ASOF);
  assert.equal(cao.daysLeft, 199);
  assert.equal(cao.status, 'ok');
  assert.equal(cao.progress, 45);
  assert.equal(A.warrantyInfo('2026-05-26', '2027-05-26', ASOF).daysLeft, 226);
});

test('Bảo hành: ngưỡng sắp hết và khẩn', () => {
  const end = '2027-04-29';
  assert.equal(A.warrantyInfo(null, end, '2027-01-28').status, 'ok', '91 ngày');
  assert.equal(A.warrantyInfo(null, end, '2027-01-29').status, 'warn', '90 ngày');
  assert.equal(A.warrantyInfo(null, end, '2027-03-30').status, 'critical', '30 ngày');
  assert.equal(A.warrantyInfo(null, end, '2027-04-30').status, 'expired');
  assert.equal(A.warrantyInfo(null, null, ASOF).status, 'unknown');
});

test('Trạng thái yêu cầu: 6 đang mở, 3 đã đóng, tất cả 6 đang mở đều quá hạn', () => {
  const open = model.requests.filter((r) => r.isOpen);
  assert.equal(open.length, 6);
  assert.equal(model.requests.length - open.length, 3);
  assert.ok(open.every((r) => r.overdueDays === 38), 'hạn 04/09/2026 đến 12/10/2026 = 38 ngày');
});

test('Phân loại trạng thái theo văn bản', () => {
  assert.deepEqual(A.classifyStatus('Đã xử lý'), { state: 'closed', outcome: 'resolved', saysOut: false });
  assert.equal(A.classifyStatus('Đang xử lý, chờ phản hồi').state, 'open');
  assert.equal(A.classifyStatus('Đã phản hồi thời gian xử lý, chờ kết quả').state, 'open');
  assert.deepEqual(
    A.classifyStatus('Không thuộc phạm vi bảo hành. Nhà thầu đang báo giá chi phí'),
    { state: 'open', outcome: 'pending', saysOut: true },
    'vẫn đang mở vì còn báo giá'
  );
  assert.equal(A.classifyStatus('Không thuộc phạm vi bảo hành. Đã hỗ trợ xử lý').state, 'closed');
  assert.equal(A.classifyStatus('Không thuộc phạm vi bảo hành').outcome, 'out_of_scope');
  assert.equal(A.classifyStatus('Đã gửi nhưng chưa rõ').state, 'unknown');
});

test('Kiểm tra E01: kết luận mâu thuẫn với trạng thái (3 yêu cầu)', () => {
  assert.equal(check('E01').count, 3);
  assert.ok(check('E01').refs.every((r) => r.startsWith('2CAO')));
});

test('Kiểm tra E06 và W03: 149 hạng mục 2CBA không đối soát được với master', () => {
  assert.equal(check('E06').count, 149);
  assert.equal(check('W03').count, 149);
  assert.ok(check('E06').detail.includes('2CBA: 149'));
});

test('Kiểm tra W04: cửa hàng thiếu nhà thầu/miền là 2CBA', () => {
  assert.equal(check('W04').count, 1);
  assert.ok(check('W04').refs[0].startsWith('2CBA'));
});

test('Kiểm tra các lỗi không có trong dữ liệu: E02, E03, E04, E05, E07, W05, W07', () => {
  for (const id of ['E02', 'E03', 'E04', 'E05', 'E07', 'W05', 'W07', 'W08']) {
    assert.equal(check(id).count, 0, id);
  }
});

test('Kiểm tra W01: 6 yêu cầu quá hạn', () => {
  assert.equal(check('W01').count, 6);
  assert.match(check('W01').detail, /38 ngày/);
});

test('Tra cứu theo cửa hàng và hạng mục', () => {
  const cases = A.searchCases(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT' });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].item.code, 'BHXDA001');
  assert.equal(cases[0].warranty.status, 'ok');
  assert.equal(A.searchCases(model, { storeCode: '2CAO' }).length, 63);
  assert.equal(A.searchCases(model, {}).length, 212);
});

test('Tra cứu theo nội dung hư hỏng: tìm được cửa hàng', () => {
  const cases = A.searchCases(model, { reason: 'Gạch nền vỡ / Lún nứt nền' });
  assert.equal(cases.length, 3);
  assert.ok(cases.every((c) => c.store.code === '2CAO'));
});

test('Lựa chọn lọc theo cửa hàng và hạng mục', () => {
  const opts = A.facetOptions(model, { storeCode: '2CAO' });
  assert.ok(opts.categories.length > 0);
  assert.ok(opts.items.every((name) => model.items.some((i) => i.storeCode === '2CAO' && i.item === name)));
  const none = A.facetOptions(model, { storeCode: '2CAO', category: 'Không tồn tại' });
  assert.deepEqual(none.items, []);
});

test('Nội dung hư hỏng không lọc theo hạng mục, để vẫn cảnh báo khi chọn sai', () => {
  const byItem = A.facetOptions(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT' });
  assert.ok(byItem.reasons.includes('Thấm dột mái tôn'));
  const v = A.confirmCase(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT', reason: 'Thấm dột mái tôn' });
  assert.ok(v.notes.some((n) => n.includes('khác với master')));
});

test('Xác nhận: còn bảo hành, sai nội dung hư hỏng thì có ghi chú', () => {
  const ok = A.confirmCase(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT', reason: 'Hư hỏng do sự cố lún nền móng' });
  assert.equal(ok.verdict, 'covered');
  assert.deepEqual(ok.notes, []);

  const wrong = A.confirmCase(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT', reason: 'Thấm dột mái tôn' });
  assert.equal(wrong.verdict, 'covered');
  assert.equal(wrong.notes.length, 1);
});

test('Xác nhận: hết hạn, không có cửa hàng, không có hạng mục', () => {
  const late = A.buildModel(DATA, '2027-06-01');
  assert.equal(A.confirmCase(late, { storeCode: '2CAO', item: 'Móng, giằng BTCT' }).verdict, 'expired');
  assert.equal(A.confirmCase(model, { storeCode: 'XXXX', item: 'Móng, giằng BTCT' }).verdict, 'no_store');
  assert.equal(A.confirmCase(model, { storeCode: '2CAO', item: 'Không có hạng mục' }).verdict, 'no_item');
  assert.equal(A.confirmCase(model, { storeCode: '2CAO' }), null, 'chưa đủ thông tin thì không xác nhận');
});

test('Dashboard: KPI đúng với dữ liệu', () => {
  const d = A.buildDashboard(model);
  assert.equal(d.kpi.stores, 2);
  assert.equal(d.kpi.covered, 2);
  assert.equal(d.kpi.expiring, 0);
  assert.equal(d.kpi.open, 6);
  assert.equal(d.kpi.overdue, 6);
  assert.equal(d.kpi.closed, 3);
  assert.equal(d.kpi.errors, 2, 'E01 và E06');
  assert.ok(d.checks[0].severity === 'error');
  assert.equal(d.covered[0].code, '2CAO', 'sắp hết trước');
});

test('Dashboard: cảnh báo sắp hết khi mốc ngày thay đổi', () => {
  // 10/02/2027: 2CAO còn 78 ngày (trong ngưỡng 90), 2CBA còn 105 ngày (ngoài ngưỡng)
  const near = A.buildModel(DATA, '2027-02-10');
  const d = A.buildDashboard(near);
  assert.equal(d.kpi.expiring, 1);
  assert.equal(d.expiring[0].code, '2CAO');
  assert.equal(d.expiring[0].warranty.status, 'warn');
  assert.equal(d.expiring[0].warranty.daysLeft, 78);
  assert.equal(d.stores.find((s) => s.code === '2CBA').warranty.status, 'ok');
});

test('Email: nội dung có mã cửa hàng và tham số được mã hoá', () => {
  const cas = A.searchCases(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT' })[0];
  const req = model.requests.find((r) => r.storeCode === '2CAO' && r.code === 'BHXDA026');
  const mail = A.buildMail('contractor', { store: cas.store, item: cas.item, request: req, warranty: cas.warranty }, {
    contractors: { 'Phú Mỹ': { email: 'pm@example.com' } },
    technicians: { 'Miền Nam': { email: 'kt@example.com' } },
    sender: 'Nguyễn Văn A',
  });
  assert.equal(mail.to, 'pm@example.com');
  assert.equal(mail.cc, 'kt@example.com');
  assert.ok(mail.subject.includes('2CAO'));
  assert.ok(mail.body.includes('quá hạn 38 ngày'));
  assert.ok(mail.href.startsWith('mailto:pm%40example.com?cc=kt%40example.com&subject='));
  assert.ok(!mail.href.includes(' '), 'không có khoảng trắng thô trong link');
});

test('Yêu cầu của cửa hàng lạ: báo lỗi E04 và không làm hỏng dashboard', () => {
  const broken = JSON.parse(JSON.stringify(DATA));
  broken.requestRows.push({ ...broken.requestRows[0], storeCode: 'ZZZZ', row: 999 });
  const m = A.buildModel(broken, ASOF);
  assert.equal(m.checks.find((c) => c.id === 'E04').count, 1);
  const d = A.buildDashboard(m);
  assert.equal(d.kpi.open, 7);
  assert.equal(d.kpi.errors, 4, 'E01, E03 (mã không có trong BOQ của CH lạ), E04, E06');
});

test('Email: chưa cấu hình địa chỉ vẫn tạo được link để người dùng tự điền', () => {
  const cas = A.searchCases(model, { storeCode: '2CAO', item: 'Móng, giằng BTCT' })[0];
  const mail = A.buildMail('store', { store: cas.store, item: cas.item, warranty: cas.warranty }, {});
  assert.equal(mail.to, '');
  assert.ok(mail.href.startsWith('mailto:?subject='));
});
