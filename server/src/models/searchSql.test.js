'use strict';

// SQL-EXECUTION harness for Note.search / Note.getSearchCount.
//
// Unlike searchParse.test.js (pure, DB-free), this exercises the actual SQL the
// query builder emits against a real Postgres — the only way to verify ILIKE,
// the `~*` adjacency regex, EXTRACT(year/month), tag joins with subtag
// expansion, and the standard "not deleted / not empty" filter.
//
// SAFETY: it runs against a throwaway database (itsnotes_search_test) created
// and dropped here. It never touches the real `itsnotes` data.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TEST_DB = 'itsnotes_search_test';
const ADMIN_DB = process.env.DB_NAME || 'itsnotes';
const conn = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'itsnotesuser',
  password: process.env.DB_PASSWORD || 'keeppassword',
};

let db;
let Note;
const ORIGINAL_DB_NAME = process.env.DB_NAME; // restored in afterAll (workers are reused)

// The search code is very chatty; keep test output readable.
beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => { console.log.mockRestore && console.log.mockRestore(); });

// Map search results to a stable, comparable shape (sorted titles).
const titles = (rows) => rows.map((r) => r.title).sort();
const found = async (query) => titles(await Note.search(query));

async function withAdmin(fn) {
  const client = new Client({ ...conn, database: ADMIN_DB });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seed() {
  // Tags (note the subtag pair book + book/fiction)
  const tagNames = ['work', 'important', 'personal', 'book', 'book/fiction', 'holidays'];
  const tagId = {};
  for (const name of tagNames) {
    const [row] = await db('tags').insert({ name }).returning('id');
    tagId[name] = row.id;
  }

  // Notes. content is non-empty (satisfies the standard filter); plain_content
  // is what the text/phrase/wildcard SQL actually searches.
  const notes = [
    { title: 'Alpha',   plain_content: 'quarterly meeting about budget', color: 'red',    created_at: '2024-03-15T10:00:00Z', tags: ['work', 'important'] },
    { title: 'Bravo',   plain_content: 'zoom call notes',                color: 'blue',   created_at: '2023-06-01T10:00:00Z', tags: ['work'] },
    { title: 'Charlie', plain_content: 'teams sync cancelled',           color: 'red',    created_at: '2024-12-20T10:00:00Z', tags: ['personal'] },
    { title: 'Delta',   plain_content: 'marketing growth strategy',      color: 'green',  created_at: '2022-01-10T10:00:00Z', tags: ['book/fiction'] },
    { title: 'Echo',    plain_content: 'marketing strategy',             color: 'green',  created_at: '2025-05-05T10:00:00Z', tags: ['book'] },
    { title: 'Foxtrot', plain_content: 'holiday plans for december',     color: 'yellow', created_at: '2024-12-25T10:00:00Z', tags: ['holidays'] },
    // Deleted note containing "meeting" — must never appear in results.
    { title: 'Golf',    plain_content: 'deleted secret meeting',         color: 'red',    created_at: '2024-03-15T10:00:00Z', tags: [], is_deleted: true },
  ];

  for (const n of notes) {
    const [row] = await db('notes').insert({
      title: n.title,
      content: `<p>${n.plain_content}</p>`,
      plain_content: n.plain_content,
      color: n.color,
      created_at: n.created_at,
      updated_at: n.created_at,
      is_deleted: n.is_deleted || false,
    }).returning('id');

    for (const t of n.tags) {
      await db('note_tags').insert({ note_id: row.id, tag_id: tagId[t] });
    }
  }
}

beforeAll(async () => {
  // 1. Fresh throwaway database.
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  });

  // 2. Point the app's knex at it, then require knex/Note (they read env on load).
  process.env.DB_NAME = TEST_DB;
  db = require('../knex').db;
  Note = require('./Note');

  // 3. Apply the real production schema — every migration in order, same as a
  // fresh install — then seed. (Baseline alone is not enough: the search path
  // reads tables added by later migrations, e.g. note_sketches from 0009.)
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    await db.raw(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await seed();
}, 60000);

afterAll(async () => {
  if (db) await db.destroy();
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  });
  // Don't leak the test DB name into other test files sharing this worker.
  if (ORIGINAL_DB_NAME === undefined) delete process.env.DB_NAME;
  else process.env.DB_NAME = ORIGINAL_DB_NAME;
});

describe('Note.search - basic & standard filters', () => {
  test('AND text: both words must appear', async () => {
    expect(await found('marketing strategy')).toEqual(['Delta', 'Echo']);
  });
  test('deleted notes are excluded (Golf has "meeting" but is trashed)', async () => {
    expect(await found('meeting')).toEqual(['Alpha']);
  });
});

describe('Note.search - phrases & exclusion', () => {
  test('exact phrase matches only the exact ordering', async () => {
    // Delta is "marketing growth strategy" — not the exact phrase.
    expect(await found('"marketing strategy"')).toEqual(['Echo']);
  });
  test('-word excludes', async () => {
    expect(await found('marketing -growth')).toEqual(['Echo']);
  });
});

describe('Note.search - tags (with subtag expansion)', () => {
  test('#tag', async () => {
    expect(await found('#work')).toEqual(['Alpha', 'Bravo']);
  });
  test('#parent matches parent and child tags', async () => {
    // #book matches "book" (Echo) and "book/fiction" (Delta).
    expect(await found('#book')).toEqual(['Delta', 'Echo']);
  });
  test('-#tag excludes tagged notes', async () => {
    expect(await found('-#work')).toEqual(['Charlie', 'Delta', 'Echo', 'Foxtrot']);
  });
});

describe('Note.search - colors', () => {
  test('$color', async () => {
    expect(await found('$red')).toEqual(['Alpha', 'Charlie']);
  });
  test('$color combined with -#tag', async () => {
    expect(await found('$red -#personal')).toEqual(['Alpha']);
  });
});

describe('Note.search - year/month', () => {
  test('yr:YYYY', async () => {
    expect(await found('yr:2024')).toEqual(['Alpha', 'Charlie', 'Foxtrot']);
  });
  test('yr:YYYY:MMM', async () => {
    expect(await found('yr:2024:dec')).toEqual(['Charlie', 'Foxtrot']);
  });
});

describe('Note.search - OR', () => {
  test('a OR b', async () => {
    expect(await found('zoom OR teams')).toEqual(['Bravo', 'Charlie']);
  });
});

// ---------------------------------------------------------------------------
// The two operators fixed in this session, verified end-to-end against SQL.
// ---------------------------------------------------------------------------
describe('Note.search - parentheses (fixed)', () => {
  test('(zoom OR teams) notes -> only the note with both', async () => {
    // Bravo: "zoom call notes" matches the group AND "notes".
    // Charlie: "teams sync cancelled" matches the group but lacks "notes".
    // Pre-fix this returned nothing (searched literal "(zoom" / "teams)").
    expect(await found('(zoom OR teams) notes')).toEqual(['Bravo']);
  });
});

describe('Note.search - spaced adjacency wildcard (fixed)', () => {
  test('"marketing * strategy" requires exactly one word between', async () => {
    // Delta: "marketing growth strategy" matches. Echo: "marketing strategy"
    // (zero words between) does NOT.
    expect(await found('marketing * strategy')).toEqual(['Delta']);
  });
});

describe('Note.search - combined query', () => {
  test('text + tag + color + year', async () => {
    expect(await found('marketing #book $green yr:2025')).toEqual(['Echo']);
  });
});

describe('Note.getSearchCount', () => {
  test('count matches result length for a tag search', async () => {
    expect(await Note.getSearchCount('#work')).toBe(2);
  });
  test('count for combined query', async () => {
    expect(await Note.getSearchCount('marketing #book $green yr:2025')).toBe(1);
  });
});
