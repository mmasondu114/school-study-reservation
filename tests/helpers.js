const { execute } = require('../cloudfunctions/study/service');
const NOW = Date.parse('2026-10-19T09:05:00+08:00');
const person = (id, role = 'student') => ({ id, role, authSource: role === 'student' ? 'school' : 'local', name: id, weeks: {}, active: [], mustChangePassword: false, password: { digest: 'old' } });
function fixture() {
  let records = new Map();
  let lock = Promise.resolve();
  const key = (kind, id) => kind + ':' + id;
  const put = (kind, id, value) => records.set(key(kind, id), structuredClone(value));
  const get = (kind, id) => structuredClone(records.get(key(kind, id)) || null);
  put('settings', 'main', { id: 'main', seatCount: 20, openSlot: 16, closeSlot: 44, notice: '请安静自习' });
  for (const id of ['alice', 'bob', 'carol']) put('users', id, person(id));
  put('users', 'admin', person('admin', 'admin')); put('users', 'reviewer', person('reviewer', 'reviewer'));
  const run = (actor, action, input = {}, now = NOW) => {
    const result = lock.then(async () => {
      const snapshot = structuredClone(records);
      const tx = { get: async (kind, id) => snapshot.get(key(kind, id)) || null, put: (kind, id, value) => snapshot.set(key(kind, id), structuredClone(value)) };
      const result = await execute(tx, actor, action, input, now, { hashPassword: async password => ({ digest: password }), hashSchoolPassword: async password => ({ digest: password }), verifyPassword: async (pass, stored) => pass === stored.digest });
      records = snapshot;
      return structuredClone(result);
    });
    lock = result.catch(() => {});
    return result;
  };
  return { put, get, run, all: kind => [...records.entries()].filter(([key]) => key.startsWith(kind + ':')).map(([, value]) => structuredClone(value)) };
}
const booking = (seat = 1, start = 20, end = 22, date = '2026-10-19') => ({ seat, start, end, date });
async function reportFixture(fx, { reporter = 'bob', seat = 1, now = NOW + 2 * 3600000 } = {}) {
  fx.put('evidence', 'photo-' + reporter, { id: 'photo-' + reporter, ownerId: reporter, fileID: 'cloud://private/' + reporter + '.jpg' });
  return fx.run(reporter, 'report', { ...booking(seat), reason: '现场持续大声交谈影响自习', photos: ['photo-' + reporter] }, now);
}
module.exports = { NOW, person, fixture, booking, reportFixture };
