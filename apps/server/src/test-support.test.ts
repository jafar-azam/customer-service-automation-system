import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from './db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './db/test-db.js';
import { otpCodeFor } from './test-support.js';

beforeAll(async () => {
  await startTestDatabase();
}, 180_000);
afterAll(async () => {
  await stopTestDatabase();
});

/**
 * The fixture bug that made two security tests flaky.
 *
 * Eight test files each read "the newest OTP notification" and assumed it was
 * theirs. `createdAt` is millisecond-resolution, so two sign-ins in the same
 * millisecond made the sort a coin flip and the second customer could verify
 * with the first customer's code — failing, and running the rest of the test
 * unauthenticated.
 *
 * It surfaced as the two cross-customer authorization tests failing roughly
 * once in six full-suite runs. That is the worst place for a flake: the honest
 * reading of a red isolation test is that isolation broke, and the trained
 * response to a flaky one is to run it again.
 */
describe('the OTP lookup under a same-millisecond tie', () => {
  it('reads the code sent to the number asked for, not the newest one', async () => {
    await clearTestDatabase();
    const at = new Date();

    /* Two codes written with an identical `createdAt` — what two sign-ins
       landing in the same millisecond produce.

       Inserted through the driver rather than `Model.create`: `createdAt` is
       immutable under Mongoose timestamps, so a value passed to `create` is
       dropped without complaint. The first version of this test did exactly
       that, the two rows got different timestamps, and it passed without ever
       creating the tie it exists to test. `tsc` caught it at the commit hook;
       the test itself could not. */
    const rows = [
      { masked: '+961***001', preview: 'code 111111', key: 'a' },
      { masked: '+961***002', preview: 'code 222222', key: 'b' },
    ].map((row) => ({
      kind: 'otp',
      channel: 'whatsapp',
      recipientMasked: row.masked,
      templateKey: 'otp.send',
      preview: row.preview,
      status: 'sent',
      idempotencyKey: row.key,
      createdAt: at,
      updatedAt: at,
    }));
    await Notification.collection.insertMany(rows);

    /* The tie is real, not assumed. */
    /* Read through the driver too: `createdAt` is added by the timestamps
       plugin and is not on the record interface. */
    const stored = await Notification.collection
      .find({ kind: 'otp' }, { projection: { createdAt: 1 } })
      .toArray();
    expect(stored).toHaveLength(2);
    expect(stored[0]?.['createdAt']).toEqual(stored[1]?.['createdAt']);

    /* The old helper: "the newest OTP", whoever it belongs to. */
    const newest = await Notification.findOne({ kind: 'otp' }).sort({ createdAt: -1 }).lean();
    const oldWay = /\b(\d{6})\b/.exec(String(newest?.preview))?.[1];

    expect(await otpCodeFor('+96170100001')).toBe('111111');
    expect(await otpCodeFor('+96171100002')).toBe('222222');

    /* The old way returns one of the two arbitrarily — so for one of these
       customers it was the wrong code. */
    expect(['111111', '222222']).toContain(oldWay);
  });
});
