/*
 * Lõi phân tích bảo hành cửa hàng. Không phụ thuộc DOM.
 * Dùng chung cho trình duyệt (window.WarrantyAnalysis) và node (tests).
 *
 * Mọi hàm nhận `asOf` (ngày so sánh, dạng 'YYYY-MM-DD') để kết quả luôn theo ngày hiện tại.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarrantyAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CONFIG = {
    warnDays: 90, // Sắp hết bảo hành: còn <= 90 ngày
    criticalDays: 30, // Khẩn: còn <= 30 ngày
    codePattern: /^BHXDA\d{3}$/, // Mã đầu việc chuẩn của master quy đổi
  };

  const STATUS_LABEL = {
    ok: 'Còn bảo hành',
    warn: 'Sắp hết BH',
    critical: 'Khẩn: sắp hết BH',
    expired: 'Hết bảo hành',
    unknown: 'Chưa rõ ngày BH',
  };

  const STORE_FIELDS = ['storeName', 'region', 'contractor', 'handover', 'warrantyEnd'];
  const FIELD_LABEL = {
    storeName: 'tên CH',
    region: 'miền',
    contractor: 'nhà thầu',
    handover: 'ngày KT',
    warrantyEnd: 'ngày hết BH',
  };

  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- Ngày tháng: so sánh theo ngày, dùng UTC để không lệch múi giờ ----------
  const pad2 = (n) => String(n).padStart(2, '0');

  function parseIso(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function daysBetween(fromIso, toIso) {
    const a = parseIso(fromIso);
    const b = parseIso(toIso);
    if (a === null || b === null) return null;
    return Math.round((b - a) / DAY_MS);
  }

  function todayIso(now = new Date()) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function addYears(iso, years) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${y + years}-${pad2(m)}-${pad2(d)}`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const normKey = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ---------- Bảo hành của cửa hàng ----------
  function warrantyInfo(handover, warrantyEnd, asOf) {
    if (!warrantyEnd) return { status: 'unknown', daysLeft: null, progress: null, endDate: null };
    const daysLeft = daysBetween(asOf, warrantyEnd);
    let status = 'ok';
    if (daysLeft < 0) status = 'expired';
    else if (daysLeft <= CONFIG.criticalDays) status = 'critical';
    else if (daysLeft <= CONFIG.warnDays) status = 'warn';

    const total = handover ? daysBetween(handover, warrantyEnd) : null;
    const elapsed = handover ? daysBetween(handover, asOf) : null;
    const progress =
      total > 0 && elapsed !== null ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : null;
    return { status, daysLeft, progress, endDate: warrantyEnd };
  }

  // ---------- Trạng thái xử lý của yêu cầu (văn bản tự do từ Excel) ----------
  // Quy tắc: có dấu hiệu đang chờ thì là "đang mở" trước, sau đó mới tới "đã đóng".
  const OPEN_MARKERS = ['chờ', 'đang', 'báo giá'];

  function classifyStatus(text) {
    const t = normKey(text);
    const saysOut = t.includes('không thuộc phạm vi');
    if (OPEN_MARKERS.some((m) => t.includes(m))) return { state: 'open', outcome: 'pending', saysOut };
    if (saysOut) return { state: 'closed', outcome: 'out_of_scope', saysOut };
    if (t.includes('đã xử lý') || t.includes('đã hỗ trợ')) return { state: 'closed', outcome: 'resolved', saysOut };
    return { state: 'unknown', outcome: 'unknown', saysOut };
  }

  // ---------- Xây dựng mô hình dữ liệu và chạy kiểm tra ----------
  function buildModel(data, asOf) {
    const boqRows = data.boqRows || [];
    const requestRows = data.requestRows || [];
    const master = data.reasonMaster || [];
    const etlWarnings = (data.meta && data.meta.etlWarnings) || [];

    // 1. Cửa hàng: lấy từ các sheet BOQ, ghi nhận xung đột giữa các dòng
    const storeMap = new Map();
    const storeConflicts = [];
    for (const row of boqRows) {
      if (!row.storeCode) continue;
      let store = storeMap.get(row.storeCode);
      if (!store) {
        store = { code: row.storeCode, itemCount: 0, sheets: [] };
        for (const f of STORE_FIELDS) store[f] = null;
        storeMap.set(row.storeCode, store);
      }
      store.itemCount += 1;
      if (!store.sheets.includes(row.sheet)) store.sheets.push(row.sheet);
      for (const f of STORE_FIELDS) {
        if (!row[f]) continue;
        if (store[f] === null) store[f] = row[f];
        else if (store[f] !== row[f]) {
          storeConflicts.push(`${store.code}: ${FIELD_LABEL[f]} là "${store[f]}" nhưng dòng ${row.row} (${row.sheet}) ghi "${row[f]}"`);
        }
      }
    }

    // 2. Hạng mục: đối chiếu với master quy đổi lý do theo tên hạng mục
    const masterByItem = new Map();
    for (const m of master) {
      const key = normKey(m.item);
      if (key && !masterByItem.has(key)) masterByItem.set(key, m);
    }
    const items = boqRows
      .filter((r) => r.storeCode && r.item)
      .map((r) => {
        const m = masterByItem.get(normKey(r.item));
        let reason = null;
        let reasonSource = 'none';
        if (m && m.reason) {
          reason = m.reason;
          reasonSource = 'master';
        } else if (r.reasonGroup) {
          reason = r.reasonGroup;
          reasonSource = 'group';
        }
        return {
          id: `${r.sheet}#${r.row}`,
          storeCode: r.storeCode,
          stt: r.stt,
          item: r.item,
          qty: r.qty,
          code: r.code || null,
          codeOk: CONFIG.codePattern.test(r.code || ''),
          category: r.groupHs || 'Chưa phân nhóm',
          reason,
          reasonSource,
          pic: r.pic,
          status: r.status,
        };
      });

    // 3. Yêu cầu bảo hành: trạng thái, quá hạn, so sánh thông tin cửa hàng
    for (const r of requestRows) {
      if (!r.storeCode) continue;
      const store = storeMap.get(r.storeCode);
      if (!store) continue;
      for (const f of STORE_FIELDS) {
        if (r[f] && store[f] !== null && store[f] !== r[f]) {
          storeConflicts.push(`${store.code}: ${FIELD_LABEL[f]} là "${store[f]}" trên BOQ nhưng "${r[f]}" ở yêu cầu dòng ${r.row}`);
        }
      }
    }
    const requests = requestRows
      .filter((r) => r.storeCode)
      .map((r) => {
        const st = classifyStatus(r.statusText);
        const isOpen = st.state !== 'closed'; // trạng thái không rõ vẫn tính là đang mở, để không bỏ sót
        const overdueDays = isOpen && r.deadline ? Math.max(0, daysBetween(r.deadline, asOf)) : 0;
        return {
          id: `${r.sheet}#${r.row}`,
          storeCode: r.storeCode,
          stt: r.stt,
          reasonText: r.reasonText,
          sentDate: r.sentDate,
          sender: r.sender,
          detail: r.detail,
          code: r.code || null,
          category: r.groupHs || 'Chưa phân nhóm',
          conclusion: r.conclusion,
          pic: r.pic,
          deadline: r.deadline,
          statusText: r.statusText,
          response: r.response,
          state: st.state,
          outcome: st.outcome,
          saysOut: st.saysOut,
          isOpen,
          overdueDays,
        };
      });

    const model = {
      asOf,
      stores: [...storeMap.values()],
      storeMap,
      items,
      requests,
      master,
      storeConflicts,
      etlWarnings,
    };
    model.checks = runChecks(model);
    return model;
  }

  // ---------- Kiểm tra dữ liệu: lỗi (error), cảnh báo (warning), ghi chú (info) ----------
  function runChecks(model) {
    const { items, requests, stores, storeMap, storeConflicts, asOf } = model;
    const out = [];
    const add = (id, severity, title, refs, detail) =>
      out.push({ id, severity, title, detail, count: refs.length, refs });

    const reqRef = (r) => `${r.storeCode} · ${r.code || 'thiếu mã'} · ${r.reasonText || r.detail || '—'}`;
    const itemRef = (i) => `${i.storeCode} · ${i.code || 'thiếu mã'} · ${i.item}`;
    const perStore = (list) => {
      const counts = {};
      for (const x of list) counts[x.storeCode] = (counts[x.storeCode] || 0) + 1;
      return Object.entries(counts)
        .map(([code, n]) => `${code}: ${n}`)
        .join(', ');
    };

    // Lỗi
    add(
      'E01', 'error', 'Kết luận mâu thuẫn với trạng thái xử lý',
      requests.filter((r) => {
        const concludedCovered = /được bảo hành/i.test(r.conclusion || '');
        const concludedOut = /không thuộc|ngoài phạm vi/i.test(r.conclusion || '');
        return (concludedCovered && r.saysOut) || (concludedOut && !r.saysOut && !!r.statusText);
      }).map(reqRef),
      'Kết luận ghi một đằng, trạng thái ghi một nẻo. P.KT và P.XD cần thống nhất lại kết luận.'
    );
    add(
      'E02', 'error', 'Yêu cầu gửi sau ngày hết bảo hành',
      requests.filter((r) => {
        const s = storeMap.get(r.storeCode);
        return s && r.sentDate && s.warrantyEnd && r.sentDate > s.warrantyEnd;
      }).map(reqRef),
      'Ngày gửi yêu cầu nằm ngoài thời hạn bảo hành của cửa hàng.'
    );
    add(
      'E03', 'error', 'Mã đầu việc không có trong BOQ của cửa hàng',
      requests.filter((r) => !r.code || !items.some((i) => i.storeCode === r.storeCode && i.code === r.code)).map(reqRef),
      'Không tìm thấy hạng mục nào của cửa hàng mang mã này, nên không xác định được phạm vi bảo hành.'
    );
    add(
      'E04', 'error', 'Cửa hàng trong yêu cầu không có trong BOQ',
      requests.filter((r) => !storeMap.has(r.storeCode)).map(reqRef),
      'Mã cửa hàng xuất hiện ở sheet yêu cầu nhưng không có ở sheet BOQ.'
    );
    add(
      'E05', 'error', 'Thông tin cửa hàng không khớp giữa các sheet',
      storeConflicts,
      'Tên, miền, nhà thầu hoặc ngày bảo hành của cùng một cửa hàng khác nhau giữa các sheet.'
    );
    add(
      'E06', 'error', 'Mã đầu việc sai định dạng BHXDA###',
      items.filter((i) => !i.codeOk).map(itemRef),
      `Các hạng mục này không đối chiếu được với master quy đổi lý do (${perStore(items.filter((i) => !i.codeOk)) || 'không có'}).`
    );
    add(
      'E07', 'error', 'Hạn phản hồi trước ngày gửi yêu cầu',
      requests.filter((r) => r.sentDate && r.deadline && r.deadline < r.sentDate).map(reqRef),
      'Hạn phản hồi được ghi sớm hơn ngày gửi, cần kiểm tra lại dữ liệu.'
    );

    // Cảnh báo
    const overdue = requests.filter((r) => r.overdueDays > 0);
    const maxOverdue = overdue.reduce((m, r) => Math.max(m, r.overdueDays), 0);
    add(
      'W01', 'warning', 'Yêu cầu quá hạn phản hồi',
      overdue.map(reqRef),
      `Đã qua hạn phản hồi và chưa đóng. Quá hạn lâu nhất: ${maxOverdue} ngày.`
    );
    add(
      'W02', 'warning', 'Trạng thái xử lý chưa chuẩn hoá',
      requests.filter((r) => r.state === 'unknown').map(reqRef),
      'Không nhận diện được trạng thái, tạm tính là đang mở. Nên ghi theo mẫu: "Đang xử lý", "Đã xử lý", "Không thuộc phạm vi BH".'
    );
    add(
      'W03', 'warning', 'Hạng mục chưa đối soát với master lý do',
      items.filter((i) => i.reasonSource !== 'master').map(itemRef),
      `Chỉ có nhóm đầu việc, chưa có nội dung hư hỏng chi tiết (${perStore(items.filter((i) => i.reasonSource !== 'master')) || 'không có'}).`
    );
    add(
      'W04', 'warning', 'Cửa hàng thiếu miền hoặc nhà thầu',
      stores.filter((s) => !s.contractor || !s.region).map((s) => `${s.code} · nhà thầu: ${s.contractor || 'chưa có'} · miền: ${s.region || 'chưa có'}`),
      'Không xác định được nhà thầu và kỹ thuật phụ trách để gửi thông tin.'
    );
    add(
      'W05', 'warning', 'Yêu cầu đang mở nhưng bảo hành đã hết',
      requests.filter((r) => {
        const s = storeMap.get(r.storeCode);
        return r.isOpen && s && s.warrantyEnd && s.warrantyEnd < asOf;
      }).map(reqRef),
      'Cần xác định ai chịu chi phí vì đã ngoài thời hạn bảo hành.'
    );
    add(
      'W06', 'warning', 'Yêu cầu đang mở chưa có nội dung trả lời',
      requests.filter((r) => r.isOpen && !r.response).map(reqRef),
      'Chưa ghi phương án hoặc thời gian cam kết xử lý.'
    );
    add(
      'W07', 'warning', 'Ngày bảo hành không phải 12 tháng từ ngày KT',
      stores.filter((s) => s.handover && s.warrantyEnd && s.warrantyEnd !== addYears(s.handover, 1)).map(
        (s) => `${s.code} · KT ${formatDate(s.handover)} · hết BH ${formatDate(s.warrantyEnd)}`
      ),
      'Thời hạn bảo hành khác 12 tháng. Nếu đúng theo hợp đồng thì bỏ qua, nếu sai thì sửa Excel.'
    );
    add(
      'W08', 'warning', 'Cảnh báo khi đọc file Excel',
      model.etlWarnings,
      'Ô ngày hoặc dòng dữ liệu không đọc được khi chuyển đổi file. Kiểm tra lại file gốc.'
    );

    // Ghi chú
    add(
      'I01', 'info', 'Hạng mục thiếu khối lượng CV',
      items.filter((i) => i.qty === null || i.qty === undefined).map(itemRef),
      `Chưa có khối lượng công việc (${perStore(items.filter((i) => i.qty == null)) || 'không có'}).`
    );
    add(
      'I02', 'info', 'Hạng mục chưa có PIC hoặc trạng thái',
      items.filter((i) => !i.pic || !i.status).map(itemRef),
      'Sheet BOQ không có cột PIC và trạng thái, nên chưa biết ai đang phụ trách từng hạng mục.'
    );
    add(
      'I03', 'info', 'Hạng mục chưa có nội dung hư hỏng',
      items.filter((i) => !i.reason).map(itemRef),
      'Không chọn được "nội dung hư hỏng" cho hạng mục này khi tra cứu.'
    );

    return out;
  }

  // ---------- Tổng hợp theo cửa hàng ----------
  function storeSummary(model, store) {
    const warranty = warrantyInfo(store.handover, store.warrantyEnd, model.asOf);
    const reqs = model.requests.filter((r) => r.storeCode === store.code);
    return {
      ...store,
      warranty,
      requestCount: reqs.length,
      openCount: reqs.filter((r) => r.isOpen).length,
      overdueCount: reqs.filter((r) => r.overdueDays > 0).length,
    };
  }

  // ---------- Tra cứu ----------
  function caseFor(model, item) {
    const store = model.storeMap.get(item.storeCode);
    return {
      item,
      store,
      warranty: warrantyInfo(store.handover, store.warrantyEnd, model.asOf),
      requests: model.requests.filter((r) => r.storeCode === item.storeCode && r.code && r.code === item.code),
    };
  }

  /** filter: { storeCode, category, item, reason } — bỏ trống thì không lọc theo trường đó. */
  function searchCases(model, filter = {}) {
    const f = {
      storeCode: filter.storeCode || '',
      category: filter.category || '',
      item: normKey(filter.item),
      reason: normKey(filter.reason),
    };
    return model.items
      .filter(
        (i) =>
          (!f.storeCode || i.storeCode === f.storeCode) &&
          (!f.category || i.category === f.category) &&
          (!f.item || normKey(i.item) === f.item) &&
          (!f.reason || normKey(i.reason) === f.reason)
      )
      .map((i) => caseFor(model, i));
  }

  /**
   * Lựa chọn cho từng ô, lọc theo cửa hàng và nhóm đang chọn.
   * Nội dung hư hỏng không lọc theo hạng mục để người dùng vẫn chọn được nội dung khác master;
   * khi đó confirmCase sẽ cảnh báo, thay vì ẩn lựa chọn.
   */
  function facetOptions(model, filter = {}) {
    const f = { storeCode: filter.storeCode || '', category: filter.category || '' };
    const uniqSorted = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    const byStore = model.items.filter((i) => !f.storeCode || i.storeCode === f.storeCode);
    const byCategory = byStore.filter((i) => !f.category || i.category === f.category);
    return {
      stores: model.stores.map((s) => ({ code: s.code, name: s.storeName || '' })),
      categories: uniqSorted(byStore.map((i) => i.category)),
      items: uniqSorted(byCategory.map((i) => i.item)),
      reasons: uniqSorted(byCategory.map((i) => i.reason)),
    };
  }

  /** Xác nhận một trường hợp cụ thể: cửa hàng + hạng mục (+ nội dung hư hỏng) có còn được bảo hành không. */
  function confirmCase(model, { storeCode, item, reason } = {}) {
    if (!storeCode || !item) return null;
    const store = model.storeMap.get(storeCode);
    if (!store) return { verdict: 'no_store', notes: ['Không tìm thấy mã cửa hàng trong BOQ.'] };
    const found = model.items.find((i) => i.storeCode === storeCode && normKey(i.item) === normKey(item));
    if (!found) return { verdict: 'no_item', store, notes: ['Hạng mục này không có trong BOQ của cửa hàng.'] };

    const warranty = warrantyInfo(store.handover, store.warrantyEnd, model.asOf);
    const verdict = warranty.status === 'expired' ? 'expired' : warranty.status === 'unknown' ? 'unknown' : 'covered';
    const notes = [];
    if (reason && normKey(reason) !== normKey(found.reason)) {
      notes.push(`Nội dung hư hỏng "${reason}" khác với master của hạng mục ("${found.reason || 'chưa có'}"). Kiểm tra lại trước khi gửi yêu cầu.`);
    }
    if (found.reasonSource !== 'master') notes.push('Hạng mục chưa đối soát với master lý do, kết quả chỉ dựa trên nhóm đầu việc.');
    if (!found.codeOk) notes.push(`Mã đầu việc "${found.code || 'trống'}" không đúng chuẩn BHXDA###, chưa đối chiếu được với yêu cầu.`);
    return {
      verdict,
      store,
      item: found,
      warranty,
      notes,
      requests: model.requests.filter((r) => r.storeCode === storeCode && r.code && r.code === found.code),
    };
  }

  // ---------- Dashboard ----------
  function buildDashboard(model) {
    const summaries = model.stores.map((s) => storeSummary(model, s));
    const withDays = (s) => s.warranty.status !== 'expired' && s.warranty.status !== 'unknown';
    const covered = summaries.filter(withDays).sort((a, b) => a.warranty.daysLeft - b.warranty.daysLeft);
    const expiring = summaries.filter((s) => ['warn', 'critical'].includes(s.warranty.status));
    const open = model.requests
      .filter((r) => r.isOpen)
      .sort((a, b) => b.overdueDays - a.overdueDays || String(a.sentDate).localeCompare(String(b.sentDate)));
    const closed = model.requests
      .filter((r) => !r.isOpen)
      .sort((a, b) => String(b.sentDate).localeCompare(String(a.sentDate)));

    const byCategory = {};
    for (const r of model.requests) {
      const row = (byCategory[r.category] = byCategory[r.category] || { category: r.category, total: 0, open: 0 });
      row.total += 1;
      if (r.isOpen) row.open += 1;
    }

    const checkOf = (sev) => model.checks.filter((c) => c.severity === sev && c.count > 0);
    return {
      kpi: {
        stores: summaries.length,
        covered: covered.length,
        expiring: expiring.length,
        expired: summaries.filter((s) => s.warranty.status === 'expired').length,
        open: open.length,
        overdue: open.filter((r) => r.overdueDays > 0).length,
        closed: closed.length,
        errors: checkOf('error').length,
        warnings: checkOf('warning').length,
      },
      stores: summaries,
      covered,
      expiring,
      open,
      closed,
      checks: [...model.checks].sort(
        (a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity) || b.count - a.count
      ),
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    };
  }

  // ---------- Email: người nhận lấy từ danh bạ, mailto có sẵn nội dung ----------
  const GROUP_LABEL = {
    contractor: 'Nhà thầu',
    team: 'Kỹ thuật',
    staff: 'Nhân viên kỹ thuật',
    store: 'Cửa hàng',
  };
  const GROUP_ORDER = ['contractor', 'team', 'staff', 'store'];

  /** Danh sách người nhận từ danh bạ. Mỗi mục có id ổn định, nhãn hiển thị và email (có thể trống). */
  function recipientOptions(contacts = {}) {
    const opts = [];
    const add = (group, name, email, region) => {
      const tags = [name, region ? `· ${region}` : '', email ? '' : '· chưa có email'].filter(Boolean);
      opts.push({
        id: `${group}:${name}`,
        group,
        name,
        region: region || null,
        email: email || '',
        label: tags.join(' '),
      });
    };
    for (const c of contacts.contractors || []) add('contractor', c.name, c.email);
    for (const t of contacts.technicalTeams || []) add('team', t.name, t.email, t.region);
    for (const t of contacts.technicians || []) add('staff', t.name, t.email, t.region);
    for (const [code, s] of Object.entries(contacts.stores || {})) add('store', code, s && s.email);
    return opts;
  }

  /**
   * Người nhận được chọn sẵn cho một nhóm, theo cửa hàng.
   * Nhà thầu và cửa hàng khớp đúng tên hoặc mã. Kỹ thuật khớp theo miền, không có thì lấy người không ghi miền.
   * Không khớp thì trả về null để người dùng tự chọn, không tự gán người sai.
   */
  function defaultRecipientId(store, group, options) {
    const inGroup = options.filter((o) => o.group === group);
    let pick = null;
    if (group === 'contractor') pick = inGroup.find((o) => o.name === store.contractor);
    else if (group === 'store') pick = inGroup.find((o) => o.name === store.code);
    else pick = inGroup.find((o) => o.region && o.region === store.region) || inGroup.find((o) => !o.region);
    return pick ? pick.id : null;
  }

  /**
   * recipient: mục lấy từ recipientOptions, hoặc null khi chưa chọn người.
   * ctx: { store, item?, request?, warranty?, items? }  contacts: danh bạ.
   */
  function buildMail(recipient, ctx, contacts = {}) {
    const { store, item, request } = ctx;
    const names = ctx.items || [];
    const options = recipientOptions(contacts);
    const group = recipient ? recipient.group : 'none';
    const warranty = ctx.warranty || warrantyInfo(store.handover, store.warrantyEnd, ctx.asOf || todayIso());
    const reason = (request && request.reasonText) || (item && item.reason) || '';
    const itemName = item
      ? item.item
      : request?.detail || (names.length ? `${names.length} hạng mục` : '(chưa chọn hạng mục)');
    // Gửi theo cả cửa hàng: liệt kê tối đa 15 hạng mục để nội dung email không quá dài
    const listLines =
      !item && names.length
        ? [
            ...names.slice(0, 15).map((n) => `  • ${n}`),
            ...(names.length > 15 ? [`  • và ${names.length - 15} hạng mục khác`] : []),
          ]
        : [];

    // Nhà thầu và cửa hàng được CC cho đội kỹ thuật cùng miền
    const teamId = defaultRecipientId(store, 'team', options);
    const teamEmail = teamId ? options.find((o) => o.id === teamId).email : '';
    const cc = (group === 'contractor' || group === 'store') && teamEmail && recipient.email !== teamEmail ? teamEmail : '';

    const greeting = {
      contractor: () => `Nhà thầu ${recipient.name}`,
      team: () => recipient.name,
      staff: () => recipient.name,
      store: () => `Cửa hàng ${store.code}${store.storeName ? ' - ' + store.storeName : ''}`,
      none: () => 'Anh/Chị',
    }[group]();
    const ask = {
      contractor: request?.deadline
        ? `Đề nghị nhà thầu xác nhận phương án xử lý và thời gian cam kết hoàn thành, phản hồi trước ngày ${formatDate(request.deadline)}.`
        : 'Đề nghị nhà thầu xác nhận phương án xử lý và thời gian cam kết hoàn thành.',
      store: 'Đề nghị cửa hàng phối hợp để nhà thầu/kỹ thuật vào kiểm tra và xử lý, đồng thời xác nhận lịch hẹn.',
      team: 'Đề nghị kỹ thuật kiểm tra, xác nhận nguyên nhân và hướng xử lý.',
      staff: 'Đề nghị kiểm tra, xác nhận nguyên nhân và hướng xử lý.',
      none: 'Đề nghị xem và phản hồi.',
    }[group];

    const warrantyLine =
      warranty.status === 'expired'
        ? `đã hết ngày ${formatDate(warranty.endDate)}`
        : warranty.daysLeft === null
          ? 'chưa rõ'
          : `còn ${warranty.daysLeft} ngày (đến ${formatDate(warranty.endDate)})`;

    const subject = `[Bảo hành] ${store.code} - ${itemName}${reason ? ' - ' + reason : ''}`;
    const lines = [
      `Kính gửi ${greeting},`,
      '',
      'Thông tin hạng mục bảo hành:',
      `- Cửa hàng: ${store.code}${store.storeName ? ' - ' + store.storeName : ''}`,
      `- Miền: ${store.region || '—'}`,
      `- Nhà thầu: ${store.contractor || '—'}`,
      `- Hạng mục (BOQ): ${itemName}`,
      ...listLines,
      `- Mã đầu việc BH: ${item?.code || '—'}`,
      `- Nội dung hư hỏng: ${reason || '—'}`,
      `- Thời hạn bảo hành: ${warrantyLine}`,
    ];
    if (request) {
      lines.push(
        '',
        'Yêu cầu hiện tại:',
        ...(request.detail ? [`- Mô tả: ${request.detail}`] : []),
        `- Ngày gửi: ${formatDate(request.sentDate)}`,
        `- Hạn phản hồi: ${formatDate(request.deadline)}${request.overdueDays > 0 ? ` (quá hạn ${request.overdueDays} ngày)` : ''}`,
        `- Trạng thái: ${request.statusText || '—'}`,
        `- Phản hồi gần nhất: ${request.response || '—'}`
      );
    }
    lines.push('', ask, '', 'Trân trọng,', contacts.sender || '[Tên người gửi]');
    const body = lines.join('\n');

    const to = recipient ? recipient.email : '';
    const params = [];
    if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
    params.push(`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`);
    const href = `mailto:${to.split(',').map((a) => encodeURIComponent(a.trim())).filter(Boolean).join(',')}?${params.join('&')}`;
    return { group, label: GROUP_LABEL[group] || '', to, cc, subject, body, href };
  }

  return {
    CONFIG,
    STATUS_LABEL,
    GROUP_LABEL,
    GROUP_ORDER,
    parseIso,
    daysBetween,
    todayIso,
    addYears,
    formatDate,
    normKey,
    warrantyInfo,
    classifyStatus,
    buildModel,
    runChecks,
    storeSummary,
    searchCases,
    facetOptions,
    confirmCase,
    buildDashboard,
    recipientOptions,
    defaultRecipientId,
    buildMail,
  };
});
