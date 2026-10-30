/*
 * Tab Sự vụ: tạo sự vụ gửi nhà thầu, danh sách, ghi nhận tình trạng, xuất biên bản PDF.
 * Dashboard dùng phần phân tích tổng hợp của cùng module (renderAnalysis).
 * Logic nghiệp vụ nằm trong tickets.js, lưu trữ trong store.js, biên bản trong pdf.js.
 */
(function () {
  'use strict';

  let D = null; // phụ thuộc từ app.js: A, T, P, getModel, getAsOf, getContacts, esc, fmt, showTab
  let store = null;
  const S = {
    tickets: [],
    events: [],
    error: null,
    mode: '',
    canWrite: true,
    filter: 'open',
    selectedId: null,
    confirmClose: false,
    by: '',
    msg: { form: '', detail: '' },
  };

  const el = (id) => document.getElementById(id);
  const esc = (v) => D.esc(v);
  const fmt = (iso) => D.fmt(iso);
  const STATUS_CLASS = {
    Mới: 'b-gray',
    'Đã gửi nhà thầu': 'b-info',
    'Nhà thầu đã phản hồi': 'b-info',
    'Đang xử lý': 'b-warn',
    'Đã xử lý': 'b-ok',
    'Đã đóng': 'b-gray',
  };
  const statusBadge = (status) => `<span class="badge ${STATUS_CLASS[status] || 'b-gray'}">${esc(status)}</span>`;

  /** Thời điểm ghi nhận: ngày đang xét + giờ hiện tại. */
  function nowFor(asOf) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${asOf}T${hh}:${mm}:00`;
  }

  function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  function views() {
    const asOf = D.getAsOf();
    return S.tickets
      .map((t) => D.T.ticketView(t, S.events, asOf))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function fillSelect(id, placeholder, values, current, labelOf = (v) => v) {
    const sel = el(id);
    sel.innerHTML = [
      `<option value="">${esc(placeholder)}</option>`,
      ...values.map((v) => {
        const value = v.value ?? v;
        return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(labelOf(v))}</option>`;
      }),
    ].join('');
    sel.value = current || '';
  }

  function setMsg(key, text) {
    S.msg[key] = text;
    const box = key === 'form' ? el('tk-form-msg') : el('tk-status-msg');
    if (box) box.textContent = text;
  }

  // ---------- Form tạo sự vụ ----------
  function renderTicketFormOptions() {
    const model = D.getModel();
    const storeCode = el('f-tk-store').value;
    fillSelect(
      'f-tk-store',
      '— Chọn cửa hàng —',
      model.stores.map((s) => ({ value: s.code, label: `${s.code} · ${s.storeName || ''}` })),
      storeCode,
      (v) => v.label
    );
    const current = el('f-tk-item').value;
    const f = storeCode ? D.A.facetOptions(model, { storeCode }) : { items: [], reasons: [] };
    fillSelect('f-tk-item', storeCode ? '— Chọn hạng mục —' : 'Chọn cửa hàng trước', f.items, f.items.includes(current) ? current : '');
    el('dl-tk-reason').innerHTML = f.reasons.map((r) => `<option value="${esc(r)}"></option>`).join('');
    const deadline = el('f-tk-deadline');
    if (!deadline.value) deadline.value = addDays(D.getAsOf(), 7);
    el('f-tk-by').disabled = !S.canWrite;
  }

  function codeFor(model, storeCode, item) {
    const found = model.items.find((i) => i.storeCode === storeCode && i.item === item);
    return found ? found.code || '' : '';
  }

  /** Mở tab Sự vụ với hạng mục đã chọn ở Tra cứu, điền sẵn form tạo sự vụ. */
  function openCreate(check = {}) {
    D.showTab('tickets');
    el('f-tk-store').value = check.storeCode || '';
    renderTicketFormOptions();
    el('f-tk-item').value = check.item || '';
    const model = D.getModel();
    const master = model.items.find((i) => i.storeCode === check.storeCode && i.item === check.item);
    el('f-tk-reason').value = check.reason || (master && master.reason) || '';
    setMsg('form', '');
    el('new-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function createTicketFromForm(e) {
    e.preventDefault();
    if (!S.canWrite) return;
    const model = D.getModel();
    const asOf = D.getAsOf();
    const storeCode = el('f-tk-store').value;
    const item = el('f-tk-item').value;
    const input = {
      storeCode,
      item,
      itemCode: codeFor(model, storeCode, item),
      reason: el('f-tk-reason').value.trim(),
      detail: el('f-tk-detail').value,
      priority: el('f-tk-priority').value,
      deadline: el('f-tk-deadline').value,
      createdBy: el('f-tk-by').value,
      createdDate: asOf,
    };
    if (!input.reason) {
      const found = model.items.find((i) => i.storeCode === storeCode && i.item === item);
      input.reason = found && found.reason ? found.reason : '';
    }
    const errors = D.T.validateTicketInput(input);
    if (errors.length) return setMsg('form', errors.join(' '));
    const st = model.storeMap.get(storeCode);
    const warranty = D.A.warrantyInfo(st.handover, st.warrantyEnd, asOf);
    const nowIso = nowFor(asOf);
    try {
      const ticket = D.T.buildTicket(input, st, warranty, { nowIso, createdDate: asOf });
      const ev = D.T.buildEvent(ticket.id, 'create', { atIso: nowIso, by: ticket.createdBy });
      await store.createTicket(ticket);
      await store.addEvent(ev);
      S.selectedId = ticket.id;
      S.confirmClose = false;
      el('tk-form').reset();
      el('f-tk-deadline').value = addDays(asOf, 7);
      renderTicketFormOptions();
      setMsg('form', `Đã tạo sự vụ ${ticket.id}.`);
      refresh();
      el('ticket-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setMsg('form', err.message || 'Không tạo được sự vụ.');
    }
  }

  // ---------- Danh sách sự vụ ----------
  function renderTickets() {
    const all = views();
    const sum = D.T.summarize(all);
    const counts = { open: sum.open, overdue: sum.overdue, closed: sum.closed, all: sum.total };
    document.querySelectorAll('[data-tkf]').forEach((b) => {
      const key = b.dataset.tkf;
      const on = key === S.filter;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.count').textContent = counts[key];
    });
    const modeText =
      S.mode === 'shared'
        ? 'Sự vụ dùng chung: mọi người có quyền xem đều thấy và cập nhật.'
        : 'Sự vụ chỉ lưu trên trình duyệt này. Mở bằng link claude.ai để nhiều người cùng dùng.';
    el('tk-mode').textContent = S.error ? `Không tải được sự vụ (${S.error.code || 'lỗi'}). ${modeText}` : modeText;

    const list = D.T.filterViews(all, S.filter);
    el('tk-list').innerHTML = list.length
      ? `<table class="req-table tk-table">
          <thead><tr><th>Mã</th><th>Cửa hàng</th><th>Hạng mục và nội dung</th><th>Nhà thầu</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${list.map(ticketRow).join('')}</tbody>
        </table>`
      : '<p class="empty">Chưa có sự vụ nào trong nhóm này.</p>';
  }

  function ticketRow(v) {
    const overdue = v.overdueDays > 0 ? ` <span class="badge b-err">Quá hạn ${v.overdueDays} ngày</span>` : '';
    return `
      <tr>
        <td data-label="Mã"><span class="code">${esc(v.id)}</span></td>
        <td data-label="Cửa hàng">${esc(v.storeCode)}${v.storeName ? ' · ' + esc(v.storeName) : ''}</td>
        <td data-label="Hạng mục"><div class="cell-title">${esc(v.item)}</div><div class="muted small">${esc(v.reason || '')}</div></td>
        <td data-label="Nhà thầu">${esc(v.contractor || '—')}</td>
        <td data-label="Hạn" class="nowrap">${fmt(v.deadline)}${overdue}</td>
        <td data-label="Trạng thái">${statusBadge(v.status)}</td>
        <td data-label=""><button type="button" class="btn btn-ghost btn-sm" data-tk="${esc(v.id)}">Xem</button></td>
      </tr>`;
  }

  // ---------- Chi tiết sự vụ và ghi nhận tình trạng ----------
  function warrantyLine(v) {
    if (v.warrantyStatus === 'expired') return `Hết bảo hành ngày ${fmt(v.warrantyEnd)}`;
    if (v.warrantyDaysLeft === null || v.warrantyDaysLeft === undefined) return 'Chưa rõ';
    return `Còn bảo hành, còn ${v.warrantyDaysLeft} ngày (đến ${fmt(v.warrantyEnd)})`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return `${fmt(iso.slice(0, 10))}${iso.length > 10 ? ' ' + iso.slice(11, 16) : ''}`;
  }

  function renderDetail() {
    const section = el('ticket-detail');
    const v = views().find((x) => x.id === S.selectedId);
    if (!v) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const model = D.getModel();
    const st = model.storeMap.get(v.storeCode) || { code: v.storeCode, storeName: v.storeName, contractor: v.contractor, region: v.region };
    const asOf = D.getAsOf();
    const lastNote = v.events.filter((e) => e.note).slice(-1)[0];
    const timeline = v.events.length
      ? v.events
          .map(
            (e) => `
              <li class="tl-item">
                <div class="tl-when">${fmt(e.reportedDate)}<span class="muted small">${esc((e.at || '').slice(11, 16))}</span></div>
                <div class="tl-body">
                  <div><strong>${esc(D.T.EVENT_TYPES[e.type] ? D.T.EVENT_TYPES[e.type].label : e.type)}</strong> ${statusBadge(e.status)}</div>
                  ${e.note ? `<div>${esc(e.note)}</div>` : ''}
                  <div class="muted small">Người ghi: ${esc(e.by)}</div>
                </div>
              </li>`
          )
          .join('')
      : '<li class="muted">Chưa có diễn biến.</li>';

    const recipient = D.A.recipientOptions(D.getContacts()).find((o) => o.group === 'contractor' && o.name === v.contractor) || null;
    const req = {
      reasonText: v.reason,
      detail: v.detail,
      sentDate: v.createdAt.slice(0, 10),
      deadline: v.deadline,
      overdueDays: v.overdueDays,
      statusText: v.status,
      response: lastNote ? lastNote.note : '',
    };
    const mail = D.A.buildMail(
      recipient,
      { store: st, item: { item: v.item, code: v.itemCode, reason: v.reason }, request: req, warranty: D.A.warrantyInfo(st.handover, st.warrantyEnd, asOf), asOf },
      D.getContacts()
    );

    const writeBlock = S.canWrite
      ? `
        <form id="tk-status-form" class="form-block" novalidate>
          <h3>Ghi nhận tình trạng nhà thầu báo về</h3>
          <div class="form-grid">
            <label class="field"><span>Tình trạng</span>
              <select id="f-st-status" required>${D.T.STATUSES.filter((s) => s !== 'Mới').map((s) => `<option value="${esc(s)}"${s === v.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Ngày nhà thầu báo</span><input id="f-st-date" type="date" value="${esc(asOf)}" required></label>
            <label class="field"><span>Người ghi nhận</span><input id="f-st-by" type="text" autocomplete="name" placeholder="Họ tên" value="${esc(S.by)}" required></label>
          </div>
          <label class="field"><span>Nội dung nhà thầu báo</span><textarea id="f-st-note" rows="3" placeholder="Ví dụ: đã cử nhân sự kiểm tra, chờ vật tư, hoàn thành ngày ..."></textarea></label>
          <div id="tk-status-msg" class="form-msg" role="status">${esc(S.msg.detail)}</div>
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">Lưu tình trạng</button>
            ${v.events.some((e) => e.type === 'sent') ? '' : '<button type="button" class="btn btn-ghost" data-tk-sent>Đánh dấu đã gửi nhà thầu</button>'}
          </div>
        </form>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-tk-pdf>Xuất biên bản PDF</button>
          <a class="btn btn-ghost" href="${esc(mail.href)}">Mở email gửi nhà thầu</a>
          ${v.open ? `<button type="button" class="btn ${S.confirmClose ? 'btn-danger' : 'btn-ghost'}" data-tk-close>${S.confirmClose ? 'Bấm lần nữa để đóng sự vụ' : 'Đóng sự vụ'}</button>` : ''}
        </div>`
      : `<p class="muted small">Tài khoản này chỉ xem được sự vụ. Cần quyền Contributor trở lên để ghi nhận tình trạng.</p>
         <div class="btn-row"><button type="button" class="btn btn-ghost" data-tk-pdf>Xuất biên bản PDF</button></div>`;

    el('tk-detail').innerHTML = `
      <div class="card-head">
        <div>
          <div class="tk-title"><span class="code">${esc(v.id)}</span> ${statusBadge(v.status)} <span class="badge b-gray">${esc(D.T.PRIORITIES[v.priority] || 'Thường')}</span></div>
          <div class="muted small">Lập lúc ${esc(fmtDateTime(v.createdAt))} bởi ${esc(v.createdBy)}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-tk-hide>Đóng chi tiết</button>
      </div>
      <dl class="kv">
        <div><dt>Cửa hàng</dt><dd>${esc(v.storeCode)}${v.storeName ? ' · ' + esc(v.storeName) : ''}</dd></div>
        <div><dt>Miền · Nhà thầu</dt><dd>${esc(v.region || '—')} · ${esc(v.contractor || 'Chưa có trong danh bạ')}</dd></div>
        <div><dt>Hạng mục</dt><dd>${esc(v.item)}</dd></div>
        <div><dt>Mã đầu việc BH</dt><dd>${esc(v.itemCode || '—')}</dd></div>
        <div><dt>Nội dung hư hỏng</dt><dd>${esc(v.reason || '—')}</dd></div>
        <div><dt>Mô tả</dt><dd>${esc(v.detail || '—')}</dd></div>
        <div><dt>Hạn phản hồi</dt><dd>${fmt(v.deadline)}${v.overdueDays > 0 ? ` <span class="badge b-err">Quá hạn ${v.overdueDays} ngày</span>` : ''}</dd></div>
        <div><dt>Bảo hành khi mở sự vụ</dt><dd>${esc(warrantyLine(v))}</dd></div>
      </dl>
      <h3>Diễn biến</h3>
      <ol class="timeline">${timeline}</ol>
      ${writeBlock}`;
  }

  function currentView() {
    return views().find((x) => x.id === S.selectedId);
  }

  async function saveStatusFromDetail(e) {
    e.preventDefault();
    const v = currentView();
    if (!v || !S.canWrite) return;
    const by = el('f-st-by').value;
    S.by = by;
    try {
      const ev = D.T.buildEvent(v.id, 'status', {
        status: el('f-st-status').value,
        note: el('f-st-note').value,
        by,
        atIso: nowFor(D.getAsOf()),
        reportedDate: el('f-st-date').value,
      });
      await store.addEvent(ev);
      setMsg('detail', 'Đã ghi nhận tình trạng.');
    } catch (err) {
      setMsg('detail', err.message || 'Không ghi nhận được tình trạng.');
    }
  }

  async function addSimpleEvent(type) {
    const v = currentView();
    if (!v || !S.canWrite) return;
    const by = (el('f-st-by') && el('f-st-by').value) || S.by || v.createdBy;
    try {
      const ev = D.T.buildEvent(v.id, type, { by, atIso: nowFor(D.getAsOf()) });
      await store.addEvent(ev);
      S.confirmClose = false;
      setMsg('detail', type === 'close' ? 'Đã đóng sự vụ.' : 'Đã ghi nhận đã gửi nhà thầu.');
    } catch (err) {
      setMsg('detail', err.message || 'Không ghi nhận được.');
    }
  }

  // ---------- Xuất biên bản PDF ----------
  async function exportPdf() {
    const v = currentView();
    if (!v) return;
    const model = D.getModel();
    const st = model.storeMap.get(v.storeCode) || { code: v.storeCode, storeName: v.storeName };
    if (!window.jspdf || !window.jspdf.jsPDF || !window.WARRANTY_FONTS) {
      return setMsg('detail', 'Chưa tải được thư viện PDF. Kiểm tra kết nối mạng rồi thử lại.');
    }
    let bytes;
    try {
      const meta = D.T.minutesModel(v, st, { sender: D.getContacts().sender, generatedAt: new Date().toISOString() });
      bytes = D.P.buildMinutesPdf(meta, { jsPDF: window.jspdf.jsPDF, fonts: window.WARRANTY_FONTS });
    } catch (err) {
      return setMsg('detail', `Không tạo được biên bản: ${err.message}`);
    }
    const filename = D.T.minutesFilename(v.id);

    // Trong artifact: trao file cho người xem qua capability downloads
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const dl = await window.claude.use('downloads');
        if (!dl) return setMsg('detail', 'Khung xem này không cho phép tải file. Mở link trong trình duyệt để tải biên bản.');
        await dl.save({ filename, data: bytes });
        return setMsg('detail', `Đã lưu biên bản ${filename}.`);
      } catch (err) {
        if (err && err.code === 'declined') return setMsg('detail', 'Bạn đã hủy lưu biên bản.');
        return setMsg('detail', `Không lưu được biên bản (${(err && err.code) || 'lỗi'}).`);
      }
    }

    // Trang tĩnh: tải trực tiếp bằng trình duyệt
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMsg('detail', `Đã tải biên bản ${filename}.`);
  }

  // ---------- Phân tích tổng hợp (dashboard) ----------
  function renderTicketKpis(all) {
    const sum = D.T.summarize(all);
    const tiles = [
      ['Sự vụ đã tạo', sum.total, 'tạo trên link claude.ai hoặc trang này', 'neutral'],
      ['Sự vụ đang mở', sum.open, `${sum.closed} đã đóng`, sum.open ? 'warn' : 'ok'],
      ['Sự vụ quá hạn', sum.overdue, 'cần nhà thầu phản hồi', sum.overdue ? 'err' : 'ok'],
      ['Đã đóng', sum.closed, 'đã xử lý xong', 'ok'],
    ];
    el('kpis-tk').innerHTML = tiles
      .map(([label, value, sub, tone]) => `<div class="kpi kpi-${tone}"><div class="kpi-value">${value}</div><div class="kpi-label">${esc(label)}</div><div class="kpi-sub">${esc(sub)}</div></div>`)
      .join('');
  }

  /** Cảnh báo sự vụ quá hạn trên dashboard. Bấm Xem sẽ mở tab Sự vụ tại sự vụ đó. */
  function renderAlerts(all) {
    const late = D.T.filterViews(all, 'overdue').sort((a, b) => b.overdueDays - a.overdueDays);
    const box = el('tk-alerts');
    if (!late.length) {
      box.innerHTML = all.some((v) => v.open)
        ? '<ul class="lines"><li class="ok-line"><span>Không có sự vụ nào quá hạn phản hồi.</span></li></ul>'
        : '';
      return;
    }
    box.innerHTML = `<ul class="lines">${late
      .slice(0, 5)
      .map(
        (v) => `<li class="err-line"><span><strong>${esc(v.id)}</strong> · ${esc(v.storeCode)} · ${esc(v.item)}: quá hạn ${v.overdueDays} ngày, nhà thầu ${esc(v.contractor || '—')}.</span><button type="button" class="btn btn-ghost btn-sm" data-tk="${esc(v.id)}">Xem</button></li>`
      )
      .join('')}${late.length > 5 ? `<li class="muted small">Còn ${late.length - 5} sự vụ quá hạn khác. Mở tab Sự vụ và lọc "Quá hạn" để xem.</li>` : ''}</ul>`;
  }

  /** Bảng phân tích: trạng thái, thời gian xử lý, theo tháng, theo cửa hàng và nhà thầu. */
  function renderAnalysis(all) {
    const sum = D.T.summarize(all);
    const statuses = D.T.STATUSES;
    const maxStatus = Math.max(1, ...statuses.map((s) => sum.byStatus[s] || 0));
    el('tk-status-bars').innerHTML = all.length
      ? statuses
          .map((s) => {
            const n = sum.byStatus[s] || 0;
            return `<div class="bar-row"><span class="bar-label">${esc(s)}</span><div class="bar" style="width:${Math.max(4, Math.round((n / maxStatus) * 100))}%"><i style="width:100%"></i></div><span class="bar-val">${n}</span></div>`;
          })
          .join('')
      : '<p class="empty">Chưa có sự vụ nào.</p>';

    const closed = all.filter((v) => !v.open);
    const days = closed
      .map((v) => {
        const close = v.events.find((e) => e.type === 'close') || v.events[v.events.length - 1];
        return close ? D.T.dayDiff(v.createdAt.slice(0, 10), close.at.slice(0, 10)) : null;
      })
      .filter((x) => x !== null && x >= 0);
    el('tk-avg').textContent = days.length
      ? `Trung bình ${(days.reduce((s, x) => s + x, 0) / days.length).toFixed(1)} ngày từ khi tạo đến khi đóng (${days.length} sự vụ đã đóng).`
      : 'Chưa có sự vụ đã đóng để tính thời gian xử lý.';

    const byMonth = {};
    all.forEach((v) => {
      const m = v.createdAt.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const months = Object.keys(byMonth).sort().slice(-6);
    const maxMonth = Math.max(1, ...months.map((m) => byMonth[m]));
    el('tk-by-month').innerHTML = months.length
      ? months
          .map((m) => {
            const [y, mm] = m.split('-');
            return `<div class="bar-row"><span class="bar-label">${mm}/${y}</span><div class="bar" style="width:${Math.max(4, Math.round((byMonth[m] / maxMonth) * 100))}%"><i style="width:100%"></i></div><span class="bar-val">${byMonth[m]}</span></div>`;
          })
          .join('')
      : '<p class="empty">Chưa có dữ liệu theo tháng.</p>';

    const group = (keyOf) => {
      const g = {};
      all.forEach((v) => {
        const k = keyOf(v);
        if (!g[k]) g[k] = { total: 0, open: 0, overdue: 0, closed: 0 };
        g[k].total += 1;
        if (v.open) g[k].open += 1;
        if (v.overdueDays > 0) g[k].overdue += 1;
        if (!v.open) g[k].closed += 1;
      });
      return Object.entries(g).sort((a, b) => b[1].total - a[1].total);
    };
    const table = (label, rows) =>
      rows.length
        ? `<table class="req-table"><thead><tr><th>${label}</th><th>Tổng</th><th>Đang mở</th><th>Quá hạn</th><th>Đã đóng</th></tr></thead><tbody>${rows
            .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.total}</td><td>${v.open}</td><td>${v.overdue}</td><td>${v.closed}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="empty">Chưa có sự vụ nào.</p>';
    el('tk-by-store').innerHTML = table(
      'Cửa hàng',
      group((v) => `${v.storeCode}${v.storeName ? ' · ' + v.storeName : ''}`)
    );
    el('tk-by-contractor').innerHTML = table('Nhà thầu', group((v) => v.contractor || 'Chưa có nhà thầu'));
  }

  // ---------- Khởi tạo và sự kiện ----------
  async function resolveWritePermission() {
    S.canWrite = true;
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const user = await window.claude.use('user');
        if (user && typeof user.can === 'function') {
          const ok = await user.can('data.write');
          if (ok === false) S.canWrite = false;
        }
      }
    } catch (e) {
      // Không biết quyền: giữ nguyên, lượt ghi sẽ tự báo lỗi nếu bị từ chối
    }
  }

  function applyWriteGate() {
    el('tk-form').hidden = !S.canWrite;
    el('tk-readonly').hidden = S.canWrite;
  }

  function bindEvents() {
    el('f-tk-store').addEventListener('change', () => renderTicketFormOptions());
    el('f-tk-item').addEventListener('change', (e) => {
      const model = D.getModel();
      const found = model.items.find((i) => i.storeCode === el('f-tk-store').value && i.item === e.target.value);
      if (found && found.reason && !el('f-tk-reason').value) el('f-tk-reason').value = found.reason;
    });
    el('tk-form').addEventListener('submit', createTicketFromForm);
    el('tk-reset').addEventListener('click', () => {
      el('tk-form').reset();
      el('f-tk-deadline').value = addDays(D.getAsOf(), 7);
      renderTicketFormOptions();
      setMsg('form', '');
    });

    document.querySelectorAll('[data-tkf]').forEach((b) =>
      b.addEventListener('click', () => {
        S.filter = b.dataset.tkf;
        renderTickets();
      })
    );

    const openTicket = (id) => {
      S.selectedId = id;
      S.confirmClose = false;
      S.msg.detail = '';
      renderDetail();
      el('ticket-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el('tk-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tk]');
      if (btn) openTicket(btn.dataset.tk);
    });
    el('tk-alerts').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tk]');
      if (!btn) return;
      D.showTab('tickets');
      openTicket(btn.dataset.tk);
    });

    el('tk-detail').addEventListener('click', (e) => {
      if (e.target.closest('[data-tk-hide]')) {
        S.selectedId = null;
        renderDetail();
        return;
      }
      if (e.target.closest('[data-tk-pdf]')) return exportPdf();
      if (e.target.closest('[data-tk-sent]')) return addSimpleEvent('sent');
      if (e.target.closest('[data-tk-close]')) {
        if (!S.confirmClose) {
          S.confirmClose = true;
          return renderDetail();
        }
        return addSimpleEvent('close');
      }
    });
    el('tk-detail').addEventListener('submit', (e) => {
      if (e.target.id === 'tk-status-form') saveStatusFromDetail(e);
    });
  }

  /** Vẽ lại toàn bộ phần sự vụ. Gọi khi dữ liệu db đổi, khi đổi ngày tính, hoặc khi báo cáo mở. */
  function refresh() {
    if (!D || !D.getModel()) return;
    renderTicketFormOptions();
    const all = views();
    renderTicketKpis(all);
    renderAlerts(all);
    renderAnalysis(all);
    renderTickets();
    renderDetail();
  }

  async function init(deps) {
    D = deps;
    bindEvents();
    refresh();
    await resolveWritePermission();
    applyWriteGate();
    store = await window.WarrantyStore.openStore({ claude: window.claude, storage: window.localStorage });
    S.mode = store.mode;
    store.subscribe((state) => {
      S.tickets = state.tickets || [];
      S.events = state.events || [];
      S.error = state.error || null;
      refresh();
    });
  }

  window.WarrantyTicketsUI = {
    init,
    refresh,
    openCreate,
    canWrite: () => S.canWrite,
  };
})();
