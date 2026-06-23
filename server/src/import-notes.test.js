const { usecToIso } = require('./import-notes');

// import-notes pulls in the shared Knex instance on require; close its pool so
// Jest exits cleanly. (No queries run in these tests, so no connection opens.)
afterAll(async () => {
  await require('./knex').db.destroy();
});

describe('usecToIso', () => {
  it('converts Keep microsecond timestamps to ISO', () => {
    expect(usecToIso(1700000000000000)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('falls back to the provided ISO when the value is missing', () => {
    expect(usecToIso(undefined, '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });

  it('falls back to the provided ISO when the value is non-numeric', () => {
    expect(usecToIso('not-a-number', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });

  it('falls back to a valid ISO timestamp ("now") when nothing is provided', () => {
    const out = usecToIso(undefined);
    expect(() => new Date(out).toISOString()).not.toThrow();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('does not throw on a NaN-producing input (the original bug)', () => {
    // new Date(NaN).toISOString() throws RangeError; the guard must not.
    expect(() => usecToIso(NaN)).not.toThrow();
  });
});
