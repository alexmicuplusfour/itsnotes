// Express handlers for the built-in MCP endpoint (Streamable HTTP transport).
// Runs stateless: a fresh server + transport per request, so there's no session
// state to leak between the multiple AI clients that may connect concurrently.

const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { buildMcpServer } = require('./tools');
const Note = require('../models/Note');
const Tag = require('../models/Tag');

// In-process data access — calls the same models the REST API uses.
const deps = {
  searchNotes: async (query, limit) => {
    const [notes, totalCount] = await Promise.all([
      Note.search(query, 1, limit, 'updatedAt_desc', true, 601, {}),
      Note.getSearchCount(query, {}),
    ]);
    return { totalCount, notes };
  },
  getNote: (id) => Note.findById(id, true),
  listNotes: async (limit, archived) => {
    const [notes, totalCount] = await Promise.all([
      Note.findAll({
        page: 1,
        limit,
        archived,
        deleted: false,
        includeDetails: true,
        truncateContent: true,
        contentLimit: 601,
      }),
      Note.getCount({ archived, deleted: false }),
    ]);
    return { totalCount, notes };
  },
  listTags: () => Tag.findAllWithCounts(),
};

async function handleMcpPost(req, res) {
  // Stateless: tie the server/transport lifetime to this single request.
  const server = buildMcpServer(deps);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

// Stateless server has no sessions to GET a stream from or DELETE.
function handleMcpUnsupported(req, res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed; this MCP endpoint is stateless (use POST).' },
    id: null,
  });
}

module.exports = { handleMcpPost, handleMcpUnsupported, deps };
