const { db } = require('../knex');

class NoteLink {
  // Atomically replaces all links for a note. Returns newly inserted rows (for async preview fetch).
  static async syncNoteLinks(noteId, urls) {
    if (!urls || urls.length === 0) {
      await db('note_links').where('note_id', noteId).del();
      return [];
    }

    const existing = await db('note_links').where('note_id', noteId).select('id', 'url', 'fetched_at');
    const existingByUrl = {};
    existing.forEach(l => { existingByUrl[l.url] = l; });

    const toRemove = existing.filter(l => !urls.includes(l.url));
    const toAdd = urls.filter(url => !existingByUrl[url]);

    if (toRemove.length > 0) {
      await db('note_links').whereIn('id', toRemove.map(l => l.id)).del();
    }

    let newRows = [];
    if (toAdd.length > 0) {
      // onConflict/ignore guards against a race (e.g. concurrent workers) inserting
      // the same (note_id, url): the conflicting row is skipped and excluded from
      // the returned set, so we never double-insert or refetch a preview twice.
      newRows = await db('note_links')
        .insert(toAdd.map(url => ({ note_id: noteId, url })))
        .onConflict(['note_id', 'url'])
        .ignore()
        .returning('*');
    }

    return newRows;
  }

  static async updatePreview(id, { title, description, image_url, favicon_url }) {
    return db('note_links').where('id', id).update({
      title: title || null,
      description: description || null,
      image_url: image_url || null,
      favicon_url: favicon_url || null,
      fetched_at: new Date(),
    });
  }
}

module.exports = NoteLink;
