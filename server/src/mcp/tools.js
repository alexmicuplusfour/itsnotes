// Read-only MCP tool definitions for itsnotes. Kept free of DB/HTTP details:
// data access is injected (`deps`) so the same tools can run in-process against
// the models or be exercised with fakes in tests.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tagNames(note) {
  if (!Array.isArray(note.tags) || note.tags.length === 0) return '';
  return note.tags.map((t) => `#${t.name}`).join(' ');
}

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatNoteSummary(note) {
  const lines = [`[${note.id}] ${note.title || '(untitled)'}`];
  const snippet = note.plain_content ? note.plain_content : stripHtml(note.content);
  if (snippet) lines.push(snippet.length > 280 ? `${snippet.slice(0, 280)}…` : snippet);
  const updated = isoDate(note.updated_at);
  const meta = [
    tagNames(note),
    note.color && note.color !== 'default' ? `color:${note.color}` : '',
    updated ? `updated:${updated.toISOString().slice(0, 10)}` : '',
  ]
    .filter(Boolean)
    .join('  ');
  if (meta) lines.push(meta);
  return lines.join('\n');
}

const asText = (text) => ({ content: [{ type: 'text', text }] });
const asError = (err) => ({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });

/**
 * Build a configured (but not yet connected) McpServer instance.
 * @param {object} deps
 * @param {(query: string, limit: number) => Promise<{totalCount:number, notes:any[]}>} deps.searchNotes
 * @param {(id: string) => Promise<any|null>} deps.getNote
 * @param {(limit: number, archived: boolean) => Promise<{totalCount:number, notes:any[]}>} deps.listNotes
 * @param {() => Promise<any[]>} deps.listTags
 */
function buildMcpServer(deps) {
  const server = new McpServer({ name: 'itsnotes', version: '0.1.0' });

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Search the user\'s notes by text and operators. Supports: plain words (AND), '
        + '"quoted phrases", #tag (matches subtags), $color, yr:2025 or yr:2025:jun, '
        + 'OR between terms, and -word / -#tag / -$color to exclude. Returns matching '
        + 'notes with id, title, a snippet, tags, and last-updated date.',
      inputSchema: {
        query: z.string().min(1).describe('Search query, e.g. "dentist", #recipes, $red yr:2024'),
        limit: z.number().int().min(1).max(80).optional().describe('Max results (default 20)'),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const { totalCount, notes } = await deps.searchNotes(query, limit);
        if (!notes || notes.length === 0) return asText(`No notes matched "${query}".`);
        const header = `Found ${totalCount} note(s) for "${query}" (showing ${notes.length}):\n`;
        return asText(header + '\n' + notes.map(formatNoteSummary).join('\n\n'));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    'get_note',
    {
      title: 'Get note',
      description: 'Fetch the full plain-text content of a single note by its id, including tags and metadata.',
      inputSchema: {
        id: z.string().min(1).describe('The note id (UUID), e.g. from search_notes results'),
      },
    },
    async ({ id }) => {
      try {
        const note = await deps.getNote(id);
        if (!note) return asText(`No note found with id ${id}.`);
        const body = note.plain_content || stripHtml(note.content) || '(empty note)';
        const created = isoDate(note.created_at);
        const updated = isoDate(note.updated_at);
        const meta = [
          `Title: ${note.title || '(untitled)'}`,
          tagNames(note) ? `Tags: ${tagNames(note)}` : null,
          note.color && note.color !== 'default' ? `Color: ${note.color}` : null,
          note.is_pinned ? 'Pinned: yes' : null,
          note.is_archived ? 'Archived: yes' : null,
          created ? `Created: ${created.toISOString()}` : null,
          updated ? `Updated: ${updated.toISOString()}` : null,
        ]
          .filter(Boolean)
          .join('\n');
        return asText(`${meta}\n\n---\n\n${body}`);
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    'list_notes',
    {
      title: 'List recent notes',
      description: 'List the most recently updated notes (active notes by default, newest first).',
      inputSchema: {
        limit: z.number().int().min(1).max(80).optional().describe('Max notes (default 20)'),
        archived: z.boolean().optional().describe('List archived notes instead of active ones'),
      },
    },
    async ({ limit = 20, archived = false }) => {
      try {
        const { totalCount, notes } = await deps.listNotes(limit, archived);
        if (!notes || notes.length === 0) return asText(archived ? 'No archived notes.' : 'No notes yet.');
        const header = `${totalCount} ${archived ? 'archived ' : ''}note(s) total (showing ${notes.length}):\n`;
        return asText(header + '\n' + notes.map(formatNoteSummary).join('\n\n'));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'List all tags/labels with how many notes use each. Useful before searching by #tag.',
      inputSchema: {},
    },
    async () => {
      try {
        const tags = await deps.listTags();
        const list = (tags || []).filter((t) => !t.is_folder);
        if (list.length === 0) return asText('No tags defined.');
        const lines = list.map((t) => `#${t.name}${t.note_count != null ? `  (${t.note_count})` : ''}`);
        return asText(`Tags:\n${lines.join('\n')}`);
      } catch (err) {
        return asError(err);
      }
    },
  );

  return server;
}

module.exports = { buildMcpServer, stripHtml, formatNoteSummary };
