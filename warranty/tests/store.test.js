// Chạy: node --test warranty/tests/store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require(path.join(__dirname, '..', '..', 'docs', 'js', 'store.js'));

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('Không có db thì dùng bộ nhớ trình duyệt, không ném lỗi', async () => {
  const store = await S.openStore({ claude: undefined, storage: memoryStorage() });
  assert.equal(store.mode, 'local');
});

test('claude.use("db") trả null thì dùng bộ nhớ trình duyệt', async () => {
  const claude = { use: async () => null };
  const store = await S.openStore({ claude, storage: memoryStorage() });
  assert.equal(store.mode, 'local');
});

test('Chế độ local: tạo sự vụ và sự kiện, đăng ký nhận được cập nhật', async () => {
  const store = await S.openStore({ claude: undefined, storage: memoryStorage() });
  const seen = [];
  const unsub = store.subscribe((st) => seen.push(st));
  await store.createTicket({ id: 'SV-2610-AAAA', storeCode: '2CAO' });
  await store.addEvent({ id: 'EV1', ticketId: 'SV-2610-AAAA', type: 'create', status: 'Mới' });
  const last = seen[seen.length - 1];
  assert.equal(last.tickets.length, 1);
  assert.equal(last.events.length, 1);
  unsub();
});

test('Chế độ shared: ghi và đọc qua db, đăng ký đúng hai collection', async () => {
  const docs = { tickets: new Map(), events: new Map() };
  const listeners = { tickets: null, events: null };
  const makeCollection = (name) => ({
    onSnapshot(next) {
      listeners[name] = next;
      next({ docs: [...docs[name].values()].map((d) => ({ exists: true, data: () => d })) });
      return () => {};
    },
    doc(id) {
      return { set: async (body) => { docs[name].set(id, body); listeners[name] && listeners[name]({ docs: [...docs[name].values()].map((d) => ({ exists: true, data: () => d })) }); } };
    },
  });
  const db = { collection: makeCollection };
  const claude = { use: async (name) => (name === 'db' ? db : null) };
  const store = await S.openStore({ claude, storage: memoryStorage() });
  assert.equal(store.mode, 'shared');
  let latest = null;
  store.subscribe((st) => { latest = st; });
  await store.createTicket({ id: 'SV-2610-BBBB', storeCode: '2CBA' });
  await store.addEvent({ id: 'EV2', ticketId: 'SV-2610-BBBB', type: 'create', status: 'Mới' });
  assert.equal(latest.tickets[0].id, 'SV-2610-BBBB');
  assert.equal(latest.events[0].id, 'EV2');
});
