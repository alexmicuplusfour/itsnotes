const { db } = require('../knex');

class Reminder {
    static createQuery() {
        return db('reminders');
    }

    static async create(data) {
        const [id] = await this.createQuery()
            .insert(data)
            .returning('id');
        return this.findById(id.id || id);
    }

    static async findById(id) {
        return this.createQuery().where({ id }).first();
    }

    static async findByNoteId(noteId) {
        return this.createQuery().where({ note_id: noteId }).first();
    }

    static async update(id, data) {
        await this.createQuery().where({ id }).update({
            ...data,
            updated_at: db.fn.now()
        });
        return this.findById(id);
    }

    static async delete(id) {
        return this.createQuery().where({ id }).del();
    }

    static async getDueReminders() {
        return this.createQuery()
            .where('next_run_at', '<=', db.fn.now())
            .orderBy('next_run_at', 'asc');
    }
}

module.exports = Reminder;
