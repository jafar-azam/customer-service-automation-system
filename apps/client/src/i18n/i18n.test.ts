import { describe, expect, it } from 'vitest';
import { MESSAGE_AUTHORS, PRIORITIES, TICKET_STATUSES } from '@csas/shared';
import { toKey } from '../screens/History.js';
import { chooseLocale, createI18n, resources } from './index.js';

describe('choosing the opening language', () => {
  it('prefers a stored choice over everything', () => {
    expect(chooseLocale('en-LB', ['ar'])).toBe('en-LB');
  });

  /* By primary subtag: someone whose browser says `ar-SY` reads Arabic. The
     region decides which Arabic, and this product has one. */
  it('matches the browser by language, not by exact tag', () => {
    expect(chooseLocale(undefined, ['ar-SY', 'fr'])).toBe('ar-LB');
    expect(chooseLocale(undefined, ['en-US'])).toBe('en-LB');
  });

  it('falls back to Arabic, because the customers are in Lebanon', () => {
    expect(chooseLocale(undefined, ['fr-FR', 'de'])).toBe('ar-LB');
    expect(chooseLocale(undefined, [])).toBe('ar-LB');
  });
});

describe('MSG-02 — Arabic plural categories', () => {
  const t = createI18n('ar-LB').getFixedT('ar-LB');

  /* All six, from the research's test specification. A binary plural is wrong
     for five of them, and the shape of the counted noun changes with the
     category — `3 طلبات` but `11 طلبًا`. */
  const cases: readonly [number, string][] = [
    [0, 'لا توجد طلبات دعم'],
    [1, 'طلب دعم واحد'],
    [2, 'طلبا دعم'],
    [3, '3 طلبات دعم'],
    [10, '10 طلبات دعم'],
    [11, '11 طلبًا للدعم'],
    [99, '99 طلبًا للدعم'],
    [100, 'عدد طلبات الدعم: 100'],
    [101, 'عدد طلبات الدعم: 101'],
  ];

  for (const [count, expected] of cases) {
    it(`renders ${String(count)} as its own category`, () => {
      expect(t('ticket.count', { count })).toBe(expected);
    });
  }

  it('is not a binary singular/plural', () => {
    const rendered = new Set(cases.map(([count]) => t('ticket.count', { count })));
    expect(rendered.size).toBeGreaterThan(2);
  });

  it('uses the runtime CLDR categories rather than a hand-written list', () => {
    expect(new Intl.PluralRules('ar-LB').resolvedOptions().pluralCategories).toEqual(
      expect.arrayContaining(['zero', 'one', 'two', 'few', 'many', 'other']),
    );
  });
});

describe('MSG-03 — the catalogues agree', () => {
  interface Tree {
    [key: string]: string | Tree;
  }

  const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? { ...all, [path]: value }
        : { ...all, ...flatten(value, path) };
    }, {});

  const ar = flatten(resources['ar-LB'].translation);
  const en = flatten(resources['en-LB'].translation);

  /* Plural suffixes legitimately differ — Arabic has six categories and
     English two — so keys are compared with the suffix stripped. */
  const base = (keys: string[]) =>
    new Set(keys.map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')));

  it('has the same keys in both languages', () => {
    expect([...base(Object.keys(ar))].sort()).toEqual([...base(Object.keys(en))].sort());
  });

  it('has no empty string in either', () => {
    for (const [key, value] of [...Object.entries(ar), ...Object.entries(en)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  /* An interpolation variable present in one language and missing in the
     other renders a number nowhere, or `{{count}}` to a customer. */
  it('uses the same interpolation variables for the same message', () => {
    const variables = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

    for (const [key, english] of Object.entries(en)) {
      const arabicKeys = Object.keys(ar).filter(
        (candidate) =>
          candidate === key ||
          candidate.replace(/_(zero|one|two|few|many|other)$/, '') ===
            key.replace(/_(zero|one|two|few|many|other)$/, ''),
      );
      expect(arabicKeys.length, `${key} has no Arabic counterpart`).toBeGreaterThan(0);

      /* `count_other` in English carries {{count}}; Arabic's `_zero` form is
         a complete sentence with no number in it, which is correct and is why
         this checks the union rather than each form. */
      if (variables(english).includes('count')) {
        const anyArabicUsesCount = arabicKeys.some((candidate) =>
          variables(ar[candidate] ?? '').includes('count'),
        );
        expect(anyArabicUsesCount, `${key} never interpolates count in Arabic`).toBe(true);
      }
    }
  });
});

/**
 * Every enum value a screen renders must have a label.
 *
 * Found by looking at the running app, not by a test: the ticket page showed
 * `awaiting_customer` in raw English snake_case inside an Arabic page, because
 * `t()` was called with a `defaultValue` of the enum value itself. A fallback
 * that renders the key is indistinguishable from a translation until someone
 * reads the screen — which is precisely what a missing-key test is for.
 *
 * `defaultValue` is still the right call at the call site: a status added
 * tomorrow should render *something*. This test is what stops that something
 * from shipping.
 */
describe('every value a screen renders has a label', () => {
  const locales = Object.keys(resources) as (keyof typeof resources)[];

  it.each(locales)('%s names every ticket status', (locale) => {
    const strings = resources[locale].translation as { status: Record<string, string> };
    const missing = TICKET_STATUSES.filter((status) => strings.status[toKey(status)] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(locales)('%s names every message author', (locale) => {
    const strings = resources[locale].translation as { chat: Record<string, string> };
    const missing = MESSAGE_AUTHORS.filter((author) => strings.chat[author] === undefined);
    expect(missing).toEqual([]);
  });

  /* Priorities were missed by the first version of this test, and had the
     same fault: the labels read `low/normal/high/urgent` while the enum is
     `low/medium/high/urgent`, so every medium-priority ticket rendered the raw
     word "medium" and the `normal` label was dead. */
  it.each(locales)('%s names every priority', (locale) => {
    const strings = resources[locale].translation as { priority: Record<string, string> };
    expect(PRIORITIES.filter((value) => strings.priority[value] === undefined)).toEqual([]);
  });

  it.each(locales)('%s has no label for a priority that does not exist', (locale) => {
    const strings = resources[locale].translation as { priority: Record<string, string> };
    const known = new Set<string>(PRIORITIES);
    expect(Object.keys(strings.priority).filter((key) => !known.has(key))).toEqual([]);
  });

  /* The other direction: a label for a status that does not exist is a
     leftover, and the two that were here (`new`, `pending`) had never been
     statuses of this system. */
  it.each(locales)('%s has no label for a status that does not exist', (locale) => {
    const strings = resources[locale].translation as { status: Record<string, string> };
    const known = new Set(TICKET_STATUSES.map(toKey));
    expect(Object.keys(strings.status).filter((key) => !known.has(key))).toEqual([]);
  });
});
