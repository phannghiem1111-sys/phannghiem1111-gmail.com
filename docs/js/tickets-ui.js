/*
 * Giao diện trên dashboard: kiểm tra bảo hành, tạo sự vụ gửi nhà thầu, ghi nhận tình trạng, xuất biên bản PDF.
 * Logic nằm trong tickets.js (nghiệp vụ), store.js (lưu trữ), pdf.js (biên bản). File này chỉ lo hiển thị và sự kiện.
 */
(function () {
  'use strict';

  let D = null; // phụ thuộc từ app.js: A, T, S, P, getModel, getAsOf, getContacts, esc, fmt
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
    check: { storeCode: '', item: '', reason: '' },
    msg: { form: '', detail: '', check: '' },
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
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
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
      ...values.map((v) => `<option value="${esc(v.value ?? v)}"${(v.value ?? v) === current ? ' selected' : ''}>${esc(labelOf(v))}</option>`),
    ].join('');
    sel.value = current || '';
  }

  // ---------- Kiểm tra bảo hành ----------
  function renderCheck() {
    const model = D.getModel();
    const c = S.check;
    const stores = model.stores.map((s) => ({ value: s.code, label: `${s.code} · ${s.storeName || ''}` }));
    fillSelect('k-store', '— Chọn cửa hàng —', stores, c.storeCode, (v) => v.label);
    const f = c.storeCode ? D.A.facetOptions(model, { storeCode: c.storeCode }) : { items: [], reasons: [] };
    if (c.item && !f.items.includes(c.item)) c.item = '';
    if (c.reason && !f.reasons.includes(c.reason)) c.reason = '';
    fillSelect('k-item', c.storeCode ? '— Chọn hạng mục —' : 'Chọn cửa hàng trước', f.items, c.item);
    fillSelect('k-reason', '— Không chọn —', f.reasons, c.reason);
    el('k-item').disabled = !c.storeCode;
    el('k-reason').disabled = !c.storeCode;
    renderCheckVerdict();
  }

  function renderCheckVerdict() {
    const box = el('k-verdict');
    const model = D.getModel();
    const c = S.check;
    if (!c.storeCode || !c.item) {
      box.innerHTML = `<p class="muted small">${c.storeCode ? 'Chọn hạng mục để kiểm tra.' : 'Chọn cửa hàng và hạng mục để kiểm tra bảo hành.'}</p>`;
      return;
    }
    const v = D.A.confirmCase(model, c);
    const end = v.store ? fmt(v.store.warrantyEnd) : '—';
    const copy = {
      covered: () => ['v-ok', 'fa-circle-check', 'CÒN BẢO HÀNH', `Hạng mục thuộc phạm vi bảo hành, còn ${v.warranty.daysLeft} ngày (đến ${end}).`],
      expired: () => ['v-err', 'fa-circle-xmark', 'HẾT BẢO HÀNH', `Đã hết thời hạn bảo hành (${end}). Cần P.XD xác nhận trách nhiệm chi phí trước khi giao nhà thầu.`],
      unknown: () => ['v-warn', 'fa-circle-question', 'CHƯA XÁC NHẬN ĐƯỢC', 'Cửa hàng chưa có ngày hết bảo hành trong dữ liệu.'],
      no_item: () => ['v-warn', 'fa-circle-question', 'KHÔNG CÓ HẠNG MỤC NÀY', 'Hạng mục không nằm trong BOQ của cửa hàng đã chọn.'],
      no_store: () => ['v-warn', 'fa-circle-question', 'KHÔNG TÌM THẤY CỬA HÀNG', 'Mã cửa hàng không có trong dữ liệu.'],
    }[v.verdict]();
    const [cls, icon, title, text] = copy;
    const canCreate = v.item && S.canWrite;
    box.innerHTML = `
      <section class="verdict ${cls}" aria-live="polite">
        <div class="verdict-title"><i class="fa-solid ${icon}" aria-hidden="true"></i>${title}</div>
        <p>${esc(text)}</p>
        ${v.item ? `<div class="verdict-facts"><span>${esc(v.item.item)}</span><span>Mã ${esc(v.item.code || '—')}</span><span>${esc(v.item.reason || 'Chưa có nội dung hư hỏng')}</span></div>` : ''}
        ${v.notes.length ? `<ul class="notes">${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${canCreate ? `<div class="actions"><button type="button" class="btn btn-primary" data-k-ticket>Tạo sự vụ cho hạng mục này</button></div>` : ''}
      </section>`;
  }

  // ---------- Form tạo sự vụ ----------
  function renderTicketFormOptions() {
    const model = D.getModel();
    const storeSel = el('f-tk-store');
    const storeCode = storeSel.value || S.check.storeCode;
    fillSelect('f-tk-store', '— Chọn cửa hàng —', model.stores.map((s) => ({ value: s.code, label: `${s.code} · ${s.storeName || ''}` })), storeCode, (v) => v.label);
    const current = el('f-tk-item').value;
    const f = storeCode ? D.A.facetOptions(model, { storeCode }) : { items: [], reasons: [] };
    fillSelect('f-tk-item', storeCode ? '— Chọn hạng mục —' : 'Chọn cửa hàng trước', f.items, f.items.includes(current) ? current : '');
    const dl = el('dl-tk-reason');
    dl.innerHTML = f.reasons.map((r) => `<option value="${esc(r)}"></option>`).join('');
    const deadline = el('f-tk-deadline');
    if (!deadline.value) deadline.value = addDays(D.getAsOf(), 7);
    el('f-tk-by').disabled = !S.canWrite;
  }

  function codeFor(model, storeCode, item) {
    const found = model.items.find((i) => i.storeCode === storeCode && i.item === item);
    return found ? found.code || '' : '';
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
    const shared = S.mode === 'shared';
    const modeText = shared
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

  // ---------- Chi tiết sự vụ ----------
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
    const mail = D.A.buildMail(recipient, { store: st, item: { item: v.item, code: v.itemCode, reason: v.reason }, request: req, warranty: D.A.warrantyInfo(st.handover, st.warrantyEnd, asOf), asOf }, D.getContacts());

    const writeBlock = S.canWrite
      ? `
        <form id="tk-status-form" class="form-block" novalidate>
          <h3>Ghi nhận tình trạng nhà thầu báo về</h3>
          <div class="form-grid">
            <label class="field"><span>Tình trạng</span>
              <select id="f-st-status" required>${D.T.STATUSES.filter((s) => s !== 'Mới').map((s) => `<option value="${esc(s)}"${s === v.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Ngày nhà thầu báo</span><input id="f-st-date" type="date" value="${esc(asOf)}" required></label>
            <label class="field"><span>Người ghi nhận</span><input id="f-st-by" type="text" autocomplete="name" placeholder="Họ tên" required></label>
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
    el('f-st-by') && (el('f-st-by').value = S.msg.by || '');
  }

  function warrantyLine(v) {
    if (v.warrantyStatus === 'expired') return `Hết bảo hành ngày ${fmt(v.warrantyEnd)}`;
    if (v.warrantyDaysLeft === null || v.warrantyDaysLeft === undefined) return 'Chưa rõ';
    return `Còn bảo hành, còn ${v.warrantyDaysLeft} ngày (đến ${fmt(v.warrantyEnd)})`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return `${fmt(iso.slice(0, 10))}${iso.length > 10 ? ' ' + iso.slice(11, 16) : ''}`;
  }

  function setMsg(key, text) {
    S.msg[key] = text;
    if (key === 'detail') {
      const box = el('tk-status-msg');
      if (box) box.textContent = text;
    }
    if (key === 'form') el('tk-form-msg').textContent = text;
    if (key === 'check') el('k-check-msg') && (el('k-check-msg').textContent = text);
  }

  // ---------- Ghi nhận, tạo sự vụ, đóng ----------
  async function createTicketFromForm(e) {
    e.preventDefault();
    if (!S.canWrite) return;
    const model = D.getModel();
    const asOf = D.getAsOf();
    const input = {
      storeCode: el('f-tk-store').value,
      item: el('f-tk-item').value,
      itemCode: '',
      reason: el('f-tk-reason').value.trim(),
      detail: el('f-tk-detail').value,
      priority: el('f-tk-priority').value,
      deadline: el('f-tk-deadline').value,
      createdBy: el('f-tk-by').value,
      createdDate: asOf,
    };
    input.itemCode = codeFor(model, input.storeCode, input.item);
    if (!input.reason) {
      const found = model.items.find((i) => i.storeCode === input.storeCode && i.item === input.item);
      input.reason = found && found.reason ? found.reason : '';
    }
    const errors = D.T.validateTicketInput(input);
    if (errors.length) return setMsg('form', errors.join(' '));
    const st = model.storeMap.get(input.storeCode);
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
      setMsg('form', `Đã tạo sự vụ ${ticket.id}.`);
      renderTicketFormOptions();
      renderTickets();
      renderDetail();
      el('ticket-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setMsg('form', err.message || 'Không tạo được sự vụ.');
    }
  }

  async function saveStatusFromDetail(e) {
    e.preventDefault();
    const v = views().find((x) => x.id === S.selectedId);
    if (!v || !S.canWrite) return;
    const by = el('f-st-by').value;
    S.msg.by = by;
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
    const v = views().find((x) => x.id === S.selectedId);
    if (!v || !S.canWrite) return;
    const by = (el('f-st-by') && el('f-st-by').value) || '';
    try {
      const ev = D.T.buildEvent(v.id, type, { by: by || v.createdBy, atIso: nowFor(D.getAsOf()) });
      await store.addEvent(ev);
      S.confirmClose = false;
      setMsg('detail', type === 'close' ? 'Đã đóng sự vụ.' : 'Đã ghi nhận đã gửi nhà thầu.');
    } catch (err) {
      setMsg('detail', err.message || 'Không ghi nhận được.');
    }
  }

  // ---------- Xuất biên bản PDF ----------
  async function exportPdf() {
    const v = views().find((x) => x.id === S.selectedId);
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

  // ---------- Khởi tạo ----------
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
    const form = el('tk-form');
    const note = el('tk-readonly');
    if (form) form.hidden = !S.canWrite;
    if (note) note.hidden = S.canWrite;
  }

  function bindEvents() {
    el('k-store').addEventListener('change', (e) => {
      S.check.storeCode = e.target.value;
      S.check.item = '';
      S.check.reason = '';
      renderCheck();
    });
    el('k-item').addEventListener('change', (e) => {
      S.check.item = e.target.value;
      renderCheck();
    });
    el('k-reason').addEventListener('change', (e) => {
      S.check.reason = e.target.value;
      renderCheckVerdict();
    });
    el('k-verdict').addEventListener('click', (e) => {
      if (!e.target.closest('[data-k-ticket]')) return;
      el('f-tk-store').value = S.check.storeCode;
      renderTicketFormOptions();
      el('f-tk-item').value = S.check.item;
      const master = D.getModel().items.find((i) => i.storeCode === S.check.storeCode && i.item === S.check.item);
      el('f-tk-reason').value = S.check.reason || (master && master.reason) || '';
      el('new-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMsg('form', '');
    });

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

    el('tk-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tk]');
      if (!btn) return;
      S.selectedId = btn.dataset.tk;
      S.confirmClose = false;
      S.msg.detail = '';
      renderDetail();
      el('ticket-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  /** Gọi từ app.js khi dữ liệu kiểm tra thay đổi (đổi ngày tính). */
  function refresh() {
    if (!D || !D.getModel()) return;
    renderCheck();
    renderTicketFormOptions();
    renderTickets();
    renderDetail();
  }

  async function init(deps) {
    D = deps;
    S.check = { storeCode: '', item: '', reason: '' };
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

  window.WarrantyTicketsUI = { init, refresh };
})();
