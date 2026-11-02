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

  /** Bỏ giá trị undefined, đổi NaN/Infinity thành null: db chỉ nhận JSON hợp lệ. */
  function toPlain(doc) {
    return JSON.parse(JSON.stringify(doc));
  }

  /** Thông báo tiếng Việt cho lỗi ghi db, kèm mã lỗi để dễ tra. */
  function writeErrorMessage(err) {
    const code = (err && err.code) || 'lỗi';
    const why = {
      invalid_argument: 'Tài khoản không có quyền ghi hoặc dữ liệu không hợp lệ (cần quyền Contributor trở lên).',
      quota_exceeded: 'Cơ sở dữ liệu đã đầy.',
      resource_exhausted: 'Ghi quá nhanh, chờ vài giây rồi thử lại.',
      revoked: 'Quyền truy cập vừa bị thu hồi, tải lại trang.',
      not_granted: 'Trang chưa được cấp quyền lưu dữ liệu.',
    }[code];
    return `Chưa lưu được vào cơ sở dữ liệu (${code}). ${why || 'Thử lại sau giây lát.'}`;
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
        state.tickets.push(toPlain(ticket));
        if (!write(state)) throw new Error('Trình duyệt không lưu được sự vụ. Kiểm tra quyền lưu dữ liệu của trình duyệt.');
        emit();
      },
      async addEvent(event) {
        const state = read();
        state.events.push(toPlain(event));
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

    /** Ghi một tài liệu, lỗi tạm thời (unavailable) thì thử lại một lần. Sau khi ghi xong cập nhật ngay. */
    async function write(collection, doc, mergeKey) {
      const plain = toPlain(doc);
      const ref = db.collection(collection).doc(String(plain.id));
      try {
        try {
          await ref.set(plain);
        } catch (e) {
          if (!e || e.code !== 'unavailable') throw e;
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
          await ref.set(plain);
        }
      } catch (e) {
        const err = new Error(writeErrorMessage(e));
        err.code = e && e.code;
        throw err;
      }
      // Không chờ onSnapshot: dashboard cập nhật ngay, snapshot sau đó sẽ thay bằng dữ liệu db
      state = { ...state, [mergeKey]: [...state[mergeKey].filter((x) => x.id !== plain.id), plain] };
      emit();
    }

    return {
      mode: 'shared',
      subscribe(fn) {
        listeners.add(fn);
        fn({ ...state, error: loadError });
        return () => listeners.delete(fn);
      },
      async createTicket(ticket) {
        await write(TICKETS, ticket, 'tickets');
      },
      async addEvent(event) {
        await write(EVENTS, event, 'events');
      },
    };
  }

  /**
   * Chọn chế độ lưu. claude.use("db") trả null khi không được cấp quyền, khi đó dùng bộ nhớ trình duyệt.
   * Trả về Promise, không bao giờ ném lỗi.
   */
  async function openStore({ claude = GLOBAL.claude, storage = safeLocalStorage() } = {}) {
    const inViewer = Boolean(claude && typeof claude.use === 'function');
    try {
      if (inViewer) {
        const db = await claude.use('db');
        if (db) return sharedStore(db);
      }
    } catch (e) {
      // Không có db: tiếp tục sang chế độ trình duyệt
    }
    // dbMissing: đang mở trên claude.ai nhưng không có db, sự vụ KHÔNG vào cơ sở dữ liệu dùng chung
    return { ...localStore(storage), dbMissing: inViewer };
  }

  return { openStore, localStore, sharedStore, safeLocalStorage, toPlain, writeErrorMessage, TICKETS, EVENTS };
});
