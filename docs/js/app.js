/* Giao diện: tab Tra cứu. Tab Sự vụ và Dashboard (phân tích sự vụ) nằm trong js/tickets-ui.js. */
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

  /** Ô gửi email: chọn nhóm nhận, người nhận được chọn sẵn theo cửa hàng, địa chỉ hiện sẵn để sao chép. */
  const composerCtx = new Map();
  let composerSeq = 0;

  function recipientOptionsHtml(group, selectedId) {
    const list = A.recipientOptions(CONTACTS).filter((o) => o.group === group);
    if (!list.length) return '<option value="">Chưa có trong danh bạ</option>';
    // Không có người nào khớp thì hiện lựa chọn trống, không để trình duyệt chọn người đầu danh sách
    const placeholder = selectedId ? '' : '<option value="" selected>— Chọn người nhận —</option>';
    return (
      placeholder +
      list.map((o) => `<option value="${esc(o.id)}"${o.id === selectedId ? ' selected' : ''}>${esc(o.label)}</option>`).join('')
    );
  }

  /** Dòng địa chỉ hiển thị: rõ ràng khi chưa chọn người hoặc người được chọn chưa có email. */
  function addressText(mail) {
    if (mail.group === 'none') return 'Chọn người nhận';
    return mail.to || 'Chưa có email';
  }

  function groupOptionsHtml(selected) {
    return A.GROUP_ORDER.map((g) => `<option value="${g}"${g === selected ? ' selected' : ''}>${esc(A.GROUP_LABEL[g])}</option>`).join('');
  }

  function mailComposer(ctx) {
    const id = ++composerSeq;
    composerCtx.set(id, ctx);
    const group = 'contractor';
    const options = A.recipientOptions(CONTACTS);
    const picked = A.defaultRecipientId(ctx.store, group, options);
    const mail = A.buildMail(options.find((o) => o.id === picked) || null, ctx, CONTACTS);
    return `
      <div class="composer" data-composer="${id}">
        <div class="cp-row">
          <label class="cp-field"><span>Nhóm nhận</span><select data-role="group">${groupOptionsHtml(group)}</select></label>
          <label class="cp-field"><span>Người nhận</span><select data-role="person">${recipientOptionsHtml(group, picked)}</select></label>
        </div>
        <div class="cp-addr-row">
          <span class="cp-addr">${esc(addressText(mail))}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-copy>Sao chép</button>
        </div>
        <div class="cp-cc muted small" ${mail.cc ? '' : 'hidden'}>${mail.cc ? `CC: ${esc(mail.cc)}` : ''}</div>
        <a class="btn btn-mail btn-sm" data-mail href="${esc(mail.href)}"><i class="fa-solid fa-envelope" aria-hidden="true"></i>Mở email</a>
      </div>`;
  }

  function refreshComposer(root, picked) {
    const ctx = composerCtx.get(Number(root.dataset.composer));
    if (!ctx) return;
    const mail = A.buildMail(picked, ctx, CONTACTS);
    root.querySelector('.cp-addr').textContent = addressText(mail);
    const cc = root.querySelector('.cp-cc');
    cc.textContent = mail.cc ? `CC: ${mail.cc}` : '';
    cc.hidden = !mail.cc;
    root.querySelector('[data-mail]').href = mail.href;
  }

  function onComposerChange(e) {
    const root = e.target.closest('.composer');
    if (!root) return;
    const ctx = composerCtx.get(Number(root.dataset.composer));
    if (!ctx) return;
    const groupSel = root.querySelector('[data-role="group"]');
    const personSel = root.querySelector('[data-role="person"]');
    const options = A.recipientOptions(CONTACTS);
    if (e.target === groupSel) {
      const auto = A.defaultRecipientId(ctx.store, groupSel.value, options);
      personSel.innerHTML = recipientOptionsHtml(groupSel.value, auto);
    }
    refreshComposer(root, options.find((o) => o.id === personSel.value) || null);
  }

  function onComposerCopy(e) {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.closest('.composer').querySelector('.cp-addr').textContent.trim();
    if (!text || text === 'Chưa có email' || text === 'Chọn người nhận') return;
    const flash = (msg) => {
      btn.textContent = msg;
      setTimeout(() => (btn.textContent = 'Sao chép'), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flash('Đã sao chép'),
        () => flash('Hãy chọn và sao chép')
      );
    } else {
      flash('Hãy chọn và sao chép');
    }
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
        ${v.item && window.WarrantyTicketsUI && WarrantyTicketsUI.canWrite() ? `<div class="actions"><button type="button" class="btn btn-primary" data-open-ticket>Tạo sự vụ cho hạng mục này</button></div>` : ''}
        ${v.item ? `<div class="actions">${mailComposer({ store: v.store, item: v.item, request: openReq, warranty: v.warranty })}</div>` : ''}
      </section>`;
  }

  /** Hạng mục gom theo nhóm, mỗi nhóm là một mục có thể mở. Dùng trong tra cứu. */
  function categoryGroupsHtml(cases) {
    const groups = new Map();
    for (const c of cases) {
      if (!groups.has(c.item.category)) groups.set(c.item.category, []);
      groups.get(c.item.category).push(c);
    }
    // Chỉ có một nhóm thì mở sẵn, nhiều nhóm thì thu gọn để trang ngắn
    const openByDefault = groups.size === 1 ? ' open' : '';
    const row = (c) => {
      const open = c.requests.filter((r) => r.isOpen).map((r) => requestBadge(r)).join('');
      return `
        <li class="row">
          <div class="row-main">
            <span class="row-item">${esc(c.item.item)}</span>
            ${c.item.reason ? `<span class="row-meta">${esc(c.item.reason)}</span>` : ''}
          </div>
          <div class="row-side"><span class="row-code">${esc(c.item.code || '—')}</span>${open}</div>
        </li>`;
    };
    const html = [...groups.entries()]
      .map(
        ([category, list]) => `
          <details class="cat-group"${openByDefault}>
            <summary><span class="cat-name">${esc(category)}</span><span class="cat-count">${list.length} hạng mục</span></summary>
            <ul class="rows">${list.map(row).join('')}</ul>
          </details>`
      )
      .join('');
    return { html, groupCount: groups.size };
  }

  /** Một thẻ cho mỗi cửa hàng: thông tin và nút gửi email một lần, hạng mục gom theo nhóm. */
  function storeGroupCard(store, cases) {
    const warranty = A.warrantyInfo(store.handover, store.warrantyEnd, state.asOf);
    const openReqs = state.model.requests.filter((r) => r.storeCode === store.code && r.isOpen);
    const { html, groupCount } = categoryGroupsHtml(cases);
    return `
      <article class="case-group">
        <header class="case-head">
          <div class="store-id"><span class="code">${esc(store.code)}</span><span class="sname">${esc(store.storeName || '')}</span></div>
          ${warrantyBadge(warranty)}
        </header>
        <p class="muted small">${esc(store.region || 'Chưa có miền')} · ${esc(store.contractor || 'Chưa có nhà thầu')} · ${cases.length} hạng mục trong ${groupCount} nhóm · ${openReqs.length} yêu cầu đang mở</p>
        ${html}
        <div class="actions">${mailComposer({
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

  // ---------- Khởi tạo và sự kiện ----------
  function rebuild() {
    state.model = A.buildModel(DATA, state.asOf);
    $('#asof').value = state.asOf;
    $('#as-of-label').textContent = `Tính đến ${fmt(state.asOf)}`;
    renderLookup();
    if (window.WarrantyTicketsUI) window.WarrantyTicketsUI.refresh();
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
    $('#verdict').addEventListener('click', (e) => {
      if (!e.target.closest('[data-open-ticket]') || !window.WarrantyTicketsUI) return;
      WarrantyTicketsUI.openCreate({ storeCode: state.storeCode, item: state.item, reason: state.reason });
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

    document.addEventListener('change', onComposerChange);
    document.addEventListener('click', onComposerCopy);

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
    if (window.WarrantyTicketsUI) {
      window.WarrantyTicketsUI
        .init({
          A,
          T: window.WarrantyTickets,
          P: window.WarrantyPdf,
          getModel: () => state.model,
          getAsOf: () => state.asOf,
          getContacts: () => CONTACTS,
          esc,
          fmt,
          showTab,
        })
        .catch((err) => console.error('Khởi tạo sự vụ lỗi:', err));
    }
  }

  init();
})();
