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
    reqTab: 'open',
    dash: null,
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
        ${v.item ? `<div class="actions">${mailComposer({ store: v.store, item: v.item, request: openReq, warranty: v.warranty })}</div>` : ''}
      </section>`;
  }

  /** Hạng mục gom theo nhóm, mỗi nhóm là một mục có thể mở. Dùng chung cho tra cứu và dashboard. */
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
            const cases = A.searchCases(state.model, { storeCode: s.code });
            const groups = categoryGroupsHtml(cases);
            return `
              <article class="store-row">
                <div class="store-row-top">
                  <div><span class="code">${esc(s.code)}</span> <span class="sname">${esc(s.storeName || '')}</span></div>
                  ${warrantyBadge(w)}
                </div>
                <div class="muted small">${esc(s.region || 'Chưa có miền')} · ${esc(s.contractor || 'Chưa có nhà thầu')} · ${s.itemCount} hạng mục · ${s.openCount} yêu cầu mở</div>
                <div class="progress" role="img" aria-label="Đã dùng ${pct}% thời hạn bảo hành"><i style="width:${pct}%"></i></div>
                <div class="muted small">Ngày KT ${fmt(s.handover)} → hết BH ${fmt(s.warrantyEnd)} (đã dùng ${pct}%)</div>
                <details class="store-items">
                  <summary>Xem ${cases.length} hạng mục theo ${groups.groupCount} nhóm</summary>
                  ${groups.html}
                </details>
              </article>`;
          })
          .join('')
      : '<p class="empty">Không có cửa hàng nào còn bảo hành.</p>';
    $('#store-list').innerHTML = rows;
  }

  function requestRow(r, model) {
    const detail = r.detail && r.detail !== r.reasonText ? r.detail : '';
    return `
      <tr>
        <td data-label="Cửa hàng"><span class="code">${esc(r.storeCode)}</span></td>
        <td data-label="Nội dung"><div class="cell-title">${esc(r.reasonText || r.detail || 'Yêu cầu bảo hành')}</div>${detail ? `<div class="muted small">${esc(detail)}</div>` : ''}</td>
        <td data-label="Mã BH">${esc(r.code || '—')}</td>
        <td data-label="Gửi → hạn" class="nowrap">${fmt(r.sentDate)} → ${fmt(r.deadline)}</td>
        <td data-label="Trạng thái">${requestBadge(r)}${r.statusText ? `<div class="muted small">${esc(r.statusText)}</div>` : ''}</td>
        <td data-label="Phản hồi gần nhất">${esc(r.response || '—')}</td>
        <td data-label="Gửi email"><div class="mail-cell">${mailComposer(requestContext(model, r))}</div></td>
      </tr>`;
  }

  /** Bảng yêu cầu, chuyển giữa đang xử lý và đã đóng. Trên điện thoại mỗi dòng thành một thẻ có nhãn. */
  function renderRequests() {
    const d = state.dash;
    const isOpen = state.reqTab === 'open';
    const list = isOpen ? d.open : d.closed;
    document.querySelectorAll('[data-req]').forEach((b) => {
      const on = b.dataset.req === state.reqTab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#open-count').textContent = d.open.length;
    $('#closed-count').textContent = d.closed.length;
    $('#req-meta').textContent = isOpen
      ? 'Sắp xếp: quá hạn lâu nhất lên đầu.'
      : 'Sắp xếp: yêu cầu gửi gần nhất lên đầu.';
    $('#req-wrap').innerHTML = list.length
      ? `<table class="req-table">
          <thead><tr>
            <th>Cửa hàng</th><th>Nội dung</th><th>Mã BH</th><th>Gửi → hạn</th>
            <th>Trạng thái</th><th>Phản hồi gần nhất</th><th>Gửi email</th>
          </tr></thead>
          <tbody>${list.map((r) => requestRow(r, state.model)).join('')}</tbody>
        </table>`
      : `<p class="empty">${isOpen ? 'Không có yêu cầu nào đang mở.' : 'Chưa có yêu cầu nào đã đóng.'}</p>`;
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
    state.dash = d;
    renderRequests();
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

    document.querySelectorAll('[data-req]').forEach((b) =>
      b.addEventListener('click', () => {
        state.reqTab = b.dataset.req;
        renderRequests();
      })
    );

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
        })
        .catch((err) => console.error('Khởi tạo sự vụ lỗi:', err));
    }
  }

  init();
})();
