/* Giao diện: tab Tra cứu và Dashboard. Toàn bộ tính toán nằm trong js/analysis.js. */
(function () {
  'use strict';

  const A = window.WarrantyAnalysis;
  const DATA = window.WARRANTY_DATA;
  const CONTACTS = window.WARRANTY_CONTACTS || {};

  const state = {
    asOf: A.todayIso(),
    storeCode: '',
    category: '',
    item: '',
    reason: '',
    model: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => A.formatDate(iso);
  const hasFilter = () => Boolean(state.storeCode || state.category || state.item || state.reason);

  const WARRANTY_BADGE = {
    ok: ['b-ok', 'Còn bảo hành'],
    warn: ['b-warn', 'Sắp hết BH'],
    critical: ['b-crit', 'Khẩn: sắp hết BH'],
    expired: ['b-gray', 'Hết bảo hành'],
    unknown: ['b-gray', 'Chưa rõ ngày BH'],
  };

  function warrantyBadge(w) {
    const [cls, label] = WARRANTY_BADGE[w.status];
    const days = w.status !== 'expired' && w.daysLeft !== null ? ` · còn ${w.daysLeft} ngày` : '';
    return `<span class="badge ${cls}">${label}${days}</span>`;
  }

  function requestBadge(r) {
    if (!r.isOpen) {
      return r.outcome === 'out_of_scope'
        ? '<span class="badge b-gray">Không thuộc BH</span>'
        : '<span class="badge b-ok">Đã xử lý</span>';
    }
    if (r.overdueDays > 0) return `<span class="badge b-err">Quá hạn ${r.overdueDays} ngày</span>`;
    return '<span class="badge b-warn">Đang mở</span>';
  }

  /** Nút gửi email cho nhà thầu, cửa hàng, kỹ thuật. Link mailto có sẵn nội dung, người gửi bấm Gửi. */
  function mailButtons(ctx) {
    const labels = { contractor: 'Mail nhà thầu', store: 'Mail cửa hàng', technician: 'Mail kỹ thuật' };
    return Object.keys(labels)
      .map((kind) => {
        const m = A.buildMail(kind, { ...ctx, asOf: state.asOf }, CONTACTS);
        const title = m.to ? `Gửi tới ${m.to}` : 'Chưa có email trong danh bạ, sẽ tự điền người nhận';
        return `<a class="btn btn-mail" href="${esc(m.href)}" title="${esc(title)}"><i class="fa-solid fa-envelope" aria-hidden="true"></i>${labels[kind]}</a>`;
      })
      .join('');
  }

  /** Bối cảnh email cho một yêu cầu: gộp các hạng mục cùng mã đầu việc. */
  function requestContext(model, r) {
    // Mã CH không có trong BOQ (lỗi E04): vẫn hiển thị, dùng thông tin trống thay vì làm hỏng trang.
    const store = model.storeMap.get(r.storeCode) || {
      code: r.storeCode, storeName: '', region: null, contractor: null, handover: null, warrantyEnd: null,
    };
    const matched = model.items.filter((i) => i.storeCode === r.storeCode && i.code === r.code);
    const names = matched.map((i) => i.item);
    const item = {
      item: names.length > 3 ? `${names.slice(0, 3).join('; ')}…` : names.join('; ') || r.detail || '',
      code: r.code,
      reason: r.reasonText,
    };
    return { store, item, request: r, warranty: A.warrantyInfo(store.handover, store.warrantyEnd, model.asOf) };
  }

  // ---------- Tra cứu ----------
  function renderStoreChips() {
    $('#store-chips').innerHTML = state.model.stores
      .map((s) => {
        const active = s.code === state.storeCode ? ' is-active' : '';
        return `<button type="button" class="chip${active}" data-store="${esc(s.code)}"><strong>${esc(s.code)}</strong><span>${esc(s.storeName || '')}</span></button>`;
      })
      .join('');
  }

  function renderStoreCard() {
    const el = $('#store-card');
    const s = state.model.storeMap.get(state.storeCode);
    if (!s) {
      el.innerHTML = '<p class="muted">Chưa chọn cửa hàng. Vẫn có thể tra cứu theo hạng mục hoặc nội dung hư hỏng.</p>';
      return;
    }
    const w = A.warrantyInfo(s.handover, s.warrantyEnd, state.asOf);
    const open = state.model.requests.filter((r) => r.storeCode === s.code && r.isOpen).length;
    el.innerHTML = `
      <div class="store-card">
        <div class="store-card-top"><strong>${esc(s.code)}</strong> ${esc(s.storeName || '')}</div>
        <div class="muted">${esc(s.region || 'Chưa có miền')} · ${esc(s.contractor || 'Chưa có nhà thầu')} · ${s.itemCount} hạng mục · ${open} yêu cầu đang mở</div>
        <div class="store-card-bottom">${warrantyBadge(w)}<span class="muted small">Hết BH ${fmt(s.warrantyEnd)}</span></div>
      </div>`;
  }

  /** Giữ lựa chọn còn hợp lệ, bỏ lựa chọn không còn khớp (theo thứ tự cửa hàng → nhóm → hạng mục → nội dung). */
  function syncFilters() {
    const m = state.model;
    let f = A.facetOptions(m, state);
    if (state.category && !f.categories.includes(state.category)) state.category = '';
    f = A.facetOptions(m, state);
    if (state.item && !f.items.includes(state.item)) state.item = '';
    f = A.facetOptions(m, state);
    if (state.reason && !f.reasons.includes(state.reason)) state.reason = '';
    f = A.facetOptions(m, state);
    fillSelect('#f-category', 'Tất cả nhóm', f.categories, state.category);
    fillSelect('#f-item', 'Tất cả hạng mục', f.items, state.item);
    fillSelect('#f-reason', 'Tất cả nội dung hư hỏng', f.reasons, state.reason);
  }

  function fillSelect(id, placeholder, values, current) {
    const el = $(id);
    el.innerHTML = [
      `<option value="">${esc(placeholder)} (${values.length})</option>`,
      ...values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`),
    ].join('');
    el.value = current || '';
  }

  function renderVerdict() {
    const el = $('#verdict');
    const v = state.storeCode && state.item ? A.confirmCase(state.model, state) : null;
    if (!v) {
      el.innerHTML = '';
      return;
    }
    const end = v.store ? fmt(v.store.warrantyEnd) : '—';
    const copy = {
      covered: () => ['v-ok', 'fa-circle-check', 'XÁC NHẬN: CÒN BẢO HÀNH', `Hạng mục thuộc phạm vi bảo hành, còn ${v.warranty.daysLeft} ngày (đến ${end}).`],
      expired: () => ['v-err', 'fa-circle-xmark', 'HẾT BẢO HÀNH', `Đã hết thời hạn bảo hành (${end}). Cần P.XD xác nhận trách nhiệm chi phí.`],
      unknown: () => ['v-warn', 'fa-circle-question', 'CHƯA XÁC NHẬN ĐƯỢC', 'Cửa hàng chưa có ngày hết bảo hành trong dữ liệu.'],
      no_item: () => ['v-warn', 'fa-circle-question', 'KHÔNG CÓ HẠNG MỤC NÀY', 'Hạng mục không nằm trong BOQ của cửa hàng đã chọn.'],
      no_store: () => ['v-warn', 'fa-circle-question', 'KHÔNG TÌM THẤY CỬA HÀNG', 'Mã cửa hàng không có trong dữ liệu.'],
    }[v.verdict]();
    const [cls, icon, title, text] = copy;
    const openReq = v.requests ? v.requests.find((r) => r.isOpen) : null;
    el.innerHTML = `
      <section class="verdict ${cls}" aria-live="polite">
        <div class="verdict-title"><i class="fa-solid ${icon}" aria-hidden="true"></i>${title}</div>
        <p>${esc(text)}</p>
        ${v.item ? `<div class="verdict-facts"><span>${esc(v.item.item)}</span><span>Mã ${esc(v.item.code || '—')}</span><span>${esc(v.item.reason || 'Chưa có nội dung hư hỏng')}</span></div>` : ''}
        ${v.notes.length ? `<ul class="notes">${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${v.item ? `<div class="actions">${mailButtons({ store: v.store, item: v.item, request: openReq, warranty: v.warranty })}</div>` : ''}
      </section>`;
  }

  /** Một thẻ cho mỗi cửa hàng: thông tin và nút gửi email một lần, các hạng mục hiển thị dạng dòng gọn. */
  function storeGroupCard(store, cases) {
    const warranty = A.warrantyInfo(store.handover, store.warrantyEnd, state.asOf);
    const openReqs = state.model.requests.filter((r) => r.storeCode === store.code && r.isOpen);
    const rows = cases
      .map((c) => {
        const open = c.requests.filter((r) => r.isOpen).map((r) => requestBadge(r)).join('');
        return `
          <li class="row">
            <div class="row-main">
              <span class="row-item">${esc(c.item.item)}</span>
              <span class="row-meta">${esc(c.item.category)}${c.item.reason ? ' · ' + esc(c.item.reason) : ''}</span>
            </div>
            <div class="row-side"><span class="row-code">${esc(c.item.code || '—')}</span>${open}</div>
          </li>`;
      })
      .join('');
    return `
      <article class="case-group">
        <header class="case-head">
          <div class="store-id"><span class="code">${esc(store.code)}</span><span class="sname">${esc(store.storeName || '')}</span></div>
          ${warrantyBadge(warranty)}
        </header>
        <p class="muted small">${esc(store.region || 'Chưa có miền')} · ${esc(store.contractor || 'Chưa có nhà thầu')} · ${cases.length} hạng mục · ${openReqs.length} yêu cầu đang mở</p>
        <ul class="rows">${rows}</ul>
        <div class="actions">${mailButtons({
          store,
          item: null,
          items: cases.map((c) => c.item.item),
          request: openReqs[0] || null,
          warranty,
        })}</div>
      </article>`;
  }

  function renderResults() {
    const el = $('#results');
    const count = $('#result-count');
    if (!hasFilter()) {
      count.textContent = '';
      el.innerHTML = '<p class="empty">Chọn cửa hàng, nhóm, hạng mục hoặc nội dung hư hỏng để tra cứu. Có thể chọn bất kỳ tiêu chí nào.</p>';
      return;
    }
    const cases = A.searchCases(state.model, state);
    count.textContent = `${cases.length} hạng mục khớp điều kiện`;
    if (!cases.length) {
      el.innerHTML = '<p class="empty">Không có hạng mục nào khớp. Thử bỏ bớt một tiêu chí.</p>';
      return;
    }
    const groups = new Map();
    for (const c of cases) {
      if (!groups.has(c.store.code)) groups.set(c.store.code, { store: c.store, cases: [] });
      groups.get(c.store.code).cases.push(c);
    }
    el.innerHTML = [...groups.values()].map((g) => storeGroupCard(g.store, g.cases)).join('');
  }

  /** Gợi ý nội dung hư hỏng theo master của hạng mục đang chọn, bấm một lần để áp dụng. */
  function renderReasonHint() {
    const el = $('#reason-hint');
    const item = state.item
      ? state.model.items.find((i) => i.item === state.item && (!state.storeCode || i.storeCode === state.storeCode))
      : null;
    if (!item) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const source = item.reasonSource === 'master' ? 'theo master' : item.reasonSource === 'group' ? 'theo nhóm đầu việc' : '';
    el.innerHTML = item.reason
      ? `<span>Gợi ý ${source}: <strong>${esc(item.reason)}</strong></span> <button type="button" data-use-reason="${esc(item.reason)}">Dùng gợi ý</button>`
      : '<span>Hạng mục này chưa có nội dung hư hỏng trong master.</span>';
  }

  function renderLookup() {
    renderStoreChips();
    renderStoreCard();
    syncFilters();
    renderReasonHint();
    renderVerdict();
    // Khi đã xác nhận một trường hợp cụ thể thì thẻ xác nhận là kết quả chính, không lặp danh sách.
    const confirmed = state.storeCode && state.item;
    $('#results-block').hidden = Boolean(confirmed);
    if (!confirmed) renderResults();
  }

  // ---------- Dashboard ----------
  function kpiTile(label, value, sub, tone) {
    return `<div class="kpi kpi-${tone}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div><div class="kpi-sub">${sub}</div></div>`;
  }

  function renderKpis(k) {
    $('#kpis').innerHTML = [
      kpiTile('Cửa hàng', k.stores, `${k.covered} còn bảo hành`, 'neutral'),
      kpiTile('Còn bảo hành', k.covered, `${k.expired} đã hết`, 'ok'),
      kpiTile('Sắp hết BH', k.expiring, `trong ${A.CONFIG.warnDays} ngày`, k.expiring ? 'warn' : 'neutral'),
      kpiTile('Yêu cầu đang mở', k.open, `${k.closed} đã xử lý / đóng`, k.open ? 'warn' : 'ok'),
      kpiTile('Quá hạn phản hồi', k.overdue, 'cần xử lý ngay', k.overdue ? 'err' : 'ok'),
      kpiTile('Lỗi kiểm tra', k.errors, `${k.warnings} cảnh báo`, k.errors ? 'err' : 'ok'),
    ].join('');
  }

  function renderWarnings(d) {
    const lines = [];
    if (d.expiring.length) {
      lines.push(
        ...d.expiring.map(
          (s) => `<li class="warn-line"><i class="fa-solid fa-clock" aria-hidden="true"></i><span><strong>${esc(s.code)}</strong> ${esc(s.storeName || '')}: hết BH ${fmt(s.warranty.endDate)}, còn ${s.warranty.daysLeft} ngày</span></li>`
        )
      );
    } else {
      const nearest = d.covered[0];
      lines.push(
        `<li class="ok-line"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Không có cửa hàng nào sắp hết bảo hành trong ${A.CONFIG.warnDays} ngày.${nearest ? ` Gần nhất: ${esc(nearest.code)}, còn ${nearest.warranty.daysLeft} ngày.` : ''}</span></li>`
      );
    }
    if (d.kpi.overdue) {
      const worst = d.open[0];
      lines.push(
        `<li class="err-line"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span><strong>${d.kpi.overdue} yêu cầu</strong> đã quá hạn phản hồi, lâu nhất ${worst.overdueDays} ngày (${esc(worst.storeCode)}).</span></li>`
      );
    }
    $('#warnings').innerHTML = `<h2>Cảnh báo bảo hành</h2><ul class="lines">${lines.join('')}</ul>`;
  }

  function renderStores(d) {
    const rows = d.covered.length
      ? d.covered
          .map((s) => {
            const w = s.warranty;
            const pct = w.progress ?? 0;
            return `
              <article class="store-row">
                <div class="store-row-top">
                  <div><span class="code">${esc(s.code)}</span> <span class="sname">${esc(s.storeName || '')}</span></div>
                  ${warrantyBadge(w)}
                </div>
                <div class="muted small">${esc(s.region || 'Chưa có miền')} · ${esc(s.contractor || 'Chưa có nhà thầu')} · ${s.itemCount} hạng mục · ${s.openCount} yêu cầu mở</div>
                <div class="progress" role="img" aria-label="Đã dùng ${pct}% thời hạn bảo hành"><i style="width:${pct}%"></i></div>
                <div class="muted small">Ngày KT ${fmt(s.handover)} → hết BH ${fmt(s.warrantyEnd)} (đã dùng ${pct}%)</div>
              </article>`;
          })
          .join('')
      : '<p class="empty">Không có cửa hàng nào còn bảo hành.</p>';
    $('#store-list').innerHTML = rows;
  }

  function requestCard(r, model) {
    const ctx = requestContext(model, r);
    const status = r.isOpen
      ? `<div class="req-status">${esc(r.statusText || 'Chưa có trạng thái')}</div>`
      : `<div class="req-status">${esc(r.statusText || '')}</div>`;
    const response = r.response ? `<div class="req-response"><span class="muted small">Phản hồi:</span> ${esc(r.response)}</div>` : '';
    return `
      <article class="req">
        <div class="req-head"><span class="code">${esc(r.storeCode)}</span>${requestBadge(r)}</div>
        <div class="req-title">${esc(r.reasonText || r.detail || 'Yêu cầu bảo hành')}</div>
        ${r.detail && r.detail !== r.reasonText ? `<div class="muted small">${esc(r.detail)}</div>` : ''}
        <dl class="mini">
          <div><dt>Ngày gửi</dt><dd>${fmt(r.sentDate)}</dd></div>
          <div><dt>Hạn phản hồi</dt><dd>${fmt(r.deadline)}</dd></div>
          <div><dt>Mã đầu việc</dt><dd>${esc(r.code || '—')}</dd></div>
          <div><dt>QLDA</dt><dd>${esc(r.pic || '—')}</dd></div>
        </dl>
        ${status}${response}
        <div class="actions">${mailButtons(ctx)}</div>
      </article>`;
  }

  function renderRequests(d) {
    $('#open-count').textContent = d.open.length;
    $('#closed-count').textContent = d.closed.length;
    $('#open-list').innerHTML = d.open.length
      ? d.open.map((r) => requestCard(r, state.model)).join('')
      : '<p class="empty">Không có yêu cầu nào đang mở.</p>';
    $('#closed-list').innerHTML = d.closed.length
      ? d.closed.map((r) => requestCard(r, state.model)).join('')
      : '<p class="empty">Chưa có yêu cầu nào đã xử lý.</p>';
  }

  function renderCategories(d) {
    const max = d.byCategory.reduce((m, c) => Math.max(m, c.total), 0) || 1;
    $('#category-bars').innerHTML = d.byCategory.length
      ? d.byCategory
          .map((c) => {
            const width = Math.round((c.total / max) * 100);
            const openShare = c.total ? Math.round((c.open / c.total) * 100) : 0;
            return `
              <div class="bar-row">
                <span class="bar-label">${esc(c.category)}</span>
                <div class="bar" style="width:${width}%" title="${c.open} đang mở / ${c.total} yêu cầu"><i style="width:${openShare}%"></i></div>
                <span class="bar-val">${c.open}/${c.total}</span>
              </div>`;
          })
          .join('')
      : '<p class="empty">Chưa có yêu cầu.</p>';
  }

  function checkItem(c) {
    const meta = {
      error: ['sev-err', 'fa-circle-xmark', 'Lỗi'],
      warning: ['sev-warn', 'fa-triangle-exclamation', 'Cảnh báo'],
      info: ['sev-info', 'fa-circle-info', 'Ghi chú'],
    }[c.severity];
    const shown = c.refs.slice(0, 20).map((r) => `<li>${esc(r)}</li>`).join('');
    const more = c.refs.length > 20 ? `<li>… và ${c.refs.length - 20} dòng nữa</li>` : '';
    return `
      <details class="check ${meta[0]}">
        <summary>
          <i class="fa-solid ${meta[1]}" aria-hidden="true"></i>
          <span class="check-title"><span class="sev">${meta[2]} ${esc(c.id)}</span> ${esc(c.title)}</span>
          <span class="count">${c.count}</span>
        </summary>
        <p>${esc(c.detail)}</p>
        <ul>${shown}${more}</ul>
      </details>`;
  }

  function renderChecks(d) {
    const failing = d.checks.filter((c) => c.count > 0);
    const passing = d.checks.filter((c) => c.count === 0);
    $('#checks').innerHTML = `
      <h2>Kiểm tra dữ liệu</h2>
      ${failing.length ? failing.map(checkItem).join('') : '<p class="empty">Không phát hiện lỗi nào.</p>'}
      ${passing.length ? `<details class="ok-list"><summary>${passing.length} kiểm tra không phát hiện lỗi</summary><ul>${passing.map((c) => `<li>${esc(c.id)} · ${esc(c.title)}</li>`).join('')}</ul></details>` : ''}`;
  }

  function renderDashboard() {
    const d = A.buildDashboard(state.model);
    renderKpis(d.kpi);
    renderWarnings(d);
    renderStores(d);
    renderRequests(d);
    renderCategories(d);
    renderChecks(d);
  }

  // ---------- Khởi tạo và sự kiện ----------
  function rebuild() {
    state.model = A.buildModel(DATA, state.asOf);
    $('#asof').value = state.asOf;
    $('#as-of-label').textContent = `Tính đến ${fmt(state.asOf)}`;
    renderLookup();
    renderDashboard();
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.view').forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });
    window.scrollTo({ top: 0 });
  }

  function bind() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

    $('#store-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-store]');
      if (!btn) return;
      state.storeCode = btn.dataset.store;
      $('#f-store').value = state.storeCode;
      renderLookup();
    });

    $('#f-store').addEventListener('input', (e) => {
      const v = e.target.value.trim().toUpperCase();
      const s = state.model.stores.find((x) => x.code.toUpperCase() === v);
      state.storeCode = s ? s.code : '';
      renderLookup();
    });

    $('#f-category').addEventListener('change', (e) => {
      state.category = e.target.value;
      state.item = '';
      state.reason = '';
      renderLookup();
    });
    $('#f-item').addEventListener('change', (e) => {
      state.item = e.target.value;
      renderLookup();
    });
    $('#f-reason').addEventListener('change', (e) => {
      state.reason = e.target.value;
      renderLookup();
    });
    $('#reason-hint').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-use-reason]');
      if (!btn) return;
      state.reason = btn.dataset.useReason;
      renderLookup();
    });

    $('#btn-clear').addEventListener('click', () => {
      Object.assign(state, { storeCode: '', category: '', item: '', reason: '' });
      $('#f-store').value = '';
      renderLookup();
    });

    $('#asof').addEventListener('change', (e) => {
      if (!e.target.value) return;
      state.asOf = e.target.value;
      rebuild();
    });
    $('#btn-today').addEventListener('click', () => {
      state.asOf = A.todayIso();
      rebuild();
    });
  }

  function showFatal(message) {
    document.querySelector('main').innerHTML = `<div class="card"><h2>Chưa tải được dữ liệu</h2><p>${esc(message)}</p></div>`;
  }

  function init() {
    if (!A) return showFatal('Thiếu js/analysis.js.');
    if (!DATA || !Array.isArray(DATA.boqRows)) {
      return showFatal('Thiếu data/warranty-data.js. Chạy: python3 warranty/tools/build_data.py');
    }
    const meta = DATA.meta || {};
    const genAt = meta.generatedAt ? meta.generatedAt.replace('T', ' ').slice(0, 16).split(' ') : null;
    $('#footer-source').textContent = `Nguồn: ${meta.sourceFile || '—'}${genAt ? ` · tạo lúc ${fmt(genAt[0])} ${genAt[1]}` : ''}`;
    bind();
    rebuild();
  }

  init();
})();
