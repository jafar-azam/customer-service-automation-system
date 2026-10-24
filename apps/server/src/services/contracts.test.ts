import type { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Contract, Customer } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { checkEntitlement } from './contracts.js';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

const DAY = 86_400_000;

async function makeCustomer() {
  return Customer.create({
    name: 'Rania Haddad',
    phoneHash: `hash-${String(Math.random())}`,
    phoneEncrypted: 'iv.ciphertext.tag',
  });
}

async function addContract(
  customerId: Types.ObjectId,
  fromDays: number,
  toDays: number,
  status: 'active' | 'pending' | 'cancelled' | 'expired' = 'active',
) {
  return Contract.create({
    customerId,
    reference: `CT-${String(Math.random()).slice(2, 10)}`,
    tier: 'premium',
    status,
    startDate: new Date(Date.now() + fromDays * DAY),
    endDate: new Date(Date.now() + toDays * DAY),
  });
}

describe('the entitlement check', () => {
  it('reports an in-date contract as active, with its tier', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -30, 30);

    const entitlement = await checkEntitlement(customer._id);
    expect(entitlement.status).toBe('active');
    expect(entitlement.tier).toBe('premium');
    expect(entitlement.contractId).toBeDefined();
  });

  it('reports no contract at all', async () => {
    const customer = await makeCustomer();
    expect((await checkEntitlement(customer._id)).status).toBe('none');
  });

  it('reports a lapsed contract as expired, and says when it ended', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -400, -10);

    const entitlement = await checkEntitlement(customer._id);
    expect(entitlement.status).toBe('expired');
    expect(entitlement.endDate?.getTime()).toBeLessThan(Date.now());
  });

  /* Telling someone whose contract starts on Monday that they are "not
     covered" sends them to support to argue about something nobody can fix. */
  it('separates a contract that has not started from one that has expired', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, 10, 400);

    const entitlement = await checkEntitlement(customer._id);
    expect(entitlement.status).toBe('not_started');
    expect(entitlement.startDate?.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * `status` is maintained by a nightly job, so it is a cache of a fact that
   * changes on its own at midnight. A contract that lapsed an hour ago still
   * reads `active` until the job runs.
   */
  it('reads the dates rather than the stored status', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -400, -1, 'active');

    expect((await checkEntitlement(customer._id)).status).toBe('expired');
  });

  it('still honours a contract whose status has not caught up yet', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -5, 5, 'pending');

    expect((await checkEntitlement(customer._id)).status).toBe('active');
  });

  /* Cancellation is a decision, not a date, so it is the one case where the
     field wins. */
  it('ignores a cancelled contract even if its dates still cover today', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -5, 5, 'cancelled');

    expect((await checkEntitlement(customer._id)).status).toBe('none');
  });

  it('prefers the live contract when a customer has several', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -400, -10);
    await addContract(customer._id, -5, 5);

    expect((await checkEntitlement(customer._id)).status).toBe('active');
  });

  it('names the most recent lapse when every contract has ended', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, -800, -400);
    const recent = await addContract(customer._id, -200, -10);

    const entitlement = await checkEntitlement(customer._id);
    expect(entitlement.contractId).toBe(String(recent._id));
  });

  it('prefers the soonest upcoming contract', async () => {
    const customer = await makeCustomer();
    await addContract(customer._id, 200, 400);
    const soonest = await addContract(customer._id, 10, 100);

    expect((await checkEntitlement(customer._id)).contractId).toBe(String(soonest._id));
  });

  it('does not see another customer contract', async () => {
    const [mine, theirs] = await Promise.all([makeCustomer(), makeCustomer()]);
    await addContract(theirs._id, -5, 5);

    expect((await checkEntitlement(mine._id)).status).toBe('none');
  });

  it('accepts a supplied moment, so the boundary can be tested exactly', async () => {
    const customer = await makeCustomer();
    const contract = await addContract(customer._id, -10, 1);

    const endDate = contract.endDate;
    const justAfter = new Date(endDate.getTime() + 1000);
    expect((await checkEntitlement(customer._id, justAfter)).status).toBe('expired');

    const justBefore = new Date(endDate.getTime() - 1000);
    expect((await checkEntitlement(customer._id, justBefore)).status).toBe('active');
  });
});
