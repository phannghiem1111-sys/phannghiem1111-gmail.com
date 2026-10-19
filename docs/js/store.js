/*
 * Lưu trữ sự vụ. Có hai chế độ:
 * - shared: dùng capability "db" của artifact, mọi người có quyền cùng thấy và ghi.
 * - local: lưu trong trình duyệt, chỉ dùng được trên máy này (trang tĩnh, hoặc khi db không được cấp).
 *
 * Hai chế độ có cùng giao diện: subscribe(fn), createTicket(ticket), addEvent(event).
 * Dữ liệu trả về cho fn là { tickets: [...], events: [...] }.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarrantyStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const GLOBAL = typeof window !== 'undefined' ? window : globalThis;
  const TICKETS = 'tickets';
  const EVENTS = 'events';
  const LOCAL_KEY = 'wcm-warranty-tickets-v1';

  function emptyState() {
    return { tickets: [], events: [] };
  }

  /** Bộ nhớ tạm khi trình duyệt chặn localStorage: vẫn dùng được trong phiên mở trang. */
  function memoryStorage() {
    const data = {};
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
    };
  }

  /** Đọc window.localStorage có thể ném lỗi (iframe sandbox, chặn cookie), nên phải bọc lại. */
  function safeLocalStorage() {
    try {
      const s = GLOBAL.localStorage;
      return s && typeof s.getItem === 'function' ? s : null;
    } catch (e) {
      return null;
    }
  }

  function localStore(storage) {
    storage = storage || memoryStorage();
    const read = () => {
      try {
        const parsed = JSON.parse(storage.getItem(LOCAL_KEY));
        return parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.events) ? parsed : emptyState();
      } catch (e) {
        return emptyState();
      }
    };
    const write = (state) => {
      try {
        storage.setItem(LOCAL_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    };
    const listeners = new Set();
    const emit = () => listeners.forEach((fn) => fn(read()));
    // Tab khác của cùng trình duyệt lưu sự vụ: cập nhật luôn tab này (dashboard đang mở chẳng hạn)
    if (typeof GLOBAL.addEventListener === 'function') {
      GLOBAL.addEventListener('storage', (e) => {
        if (e.key === LOCAL_KEY || e.key === null) emit();
      });
    }
    return {
      mode: 'local',
      subscribe(fn) {
        listeners.add(fn);
        fn(read());
        return () => listeners.delete(fn);
      },
      async createTicket(ticket) {
        const state = read();
        state.tickets.push(ticket);
        if (!write(state)) throw new Error('Trình duyệt không lưu được sự vụ. Kiểm tra quyền lưu dữ liệu của trình duyệt.');
        emit();
      },
      async addEvent(event) {
        const state = read();
        state.events.push(event);
        if (!write(state)) throw new Error('Trình duyệt không lưu được cập nhật. Kiểm tra quyền lưu dữ liệu của trình duyệt.');
        emit();
      },
    };
  }

  /**
   * db là namespace của capability "db" (đã qua claude.use). Mỗi sự vụ và mỗi sự kiện là một tài liệu riêng,
   * nên hai người ghi cùng lúc không ghi đè nhau. Đăng ký lắng nghe đúng một lần khi mở trang.
   */
  function sharedStore(db) {
    let state = emptyState();
    let loadError = null;
    const listeners = new Set();
    const emit = () => listeners.forEach((fn) => fn({ ...state, error: loadError }));
    const toRows = (snap) => snap.docs.filter((d) => d.exists).map((d) => d.data()).filter(Boolean);

    db.collection(TICKETS).onSnapshot(
      (snap) => {
        state = { ...state, tickets: toRows(snap) };
        emit();
      },
      (err) => {
        loadError = err;
        emit();
      }
    );
    db.collection(EVENTS).onSnapshot(
      (snap) => {
        state = { ...state, events: toRows(snap) };
        emit();
      },
      (err) => {
        loadError = err;
        emit();
      }
    );

    return {
      mode: 'shared',
      subscribe(fn) {
        listeners.add(fn);
        fn({ ...state, error: loadError });
        return () => listeners.delete(fn);
      },
      async createTicket(ticket) {
        await db.collection(TICKETS).doc(ticket.id).set(ticket);
      },
      async addEvent(event) {
        await db.collection(EVENTS).doc(event.id).set(event);
      },
    };
  }

  /**
   * Chọn chế độ lưu. claude.use("db") trả null khi không được cấp quyền, khi đó dùng bộ nhớ trình duyệt.
   * Trả về Promise, không bao giờ ném lỗi.
   */
  async function openStore({ claude = GLOBAL.claude, storage = safeLocalStorage() } = {}) {
    try {
      if (claude && typeof claude.use === 'function') {
        const db = await claude.use('db');
        if (db) return sharedStore(db);
      }
    } catch (e) {
      // Không có db: tiếp tục sang chế độ trình duyệt
    }
    return localStore(storage);
  }

  return { openStore, localStore, sharedStore, safeLocalStorage, TICKETS, EVENTS };
});
