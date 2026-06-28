const cron = require('node-cron');
const axios = require('axios');
const Reminder = require('../models/Reminder');
const Note = require('../models/Note');
const { RRule } = require('rrule');

class SchedulerService {
    constructor() {
        this.cronTask = null;
    }

    init(io) {
        console.log('SchedulerService: Initializing...');
        this.io = io;
        // Run every minute
        this.cronTask = cron.schedule('* * * * *', () => {
            this.checkReminders();
        });

        // Periodically purge empty notes (blank title/content, no attachments).
        // Defaults to a daily 3 AM sweep; opt out with EMPTY_NOTE_CLEANUP_ENABLED=false.
        if (process.env.EMPTY_NOTE_CLEANUP_ENABLED !== 'false') {
            const cleanupCron = process.env.EMPTY_NOTE_CLEANUP_CRON || '0 3 * * *';
            this.cleanupTask = cron.schedule(cleanupCron, () => {
                this.cleanupEmptyNotes();
            });
            // Clear any existing backlog shortly after startup.
            this.cleanupEmptyNotes();
        }

        // Periodically purge notes that have sat in the trash past a retention
        // window. The cron is always scheduled; the enabled flag is checked at
        // sweep time so the Maintenance settings toggle takes effect without a
        // server restart. Defaults to a daily 3 AM sweep.
        const trashCron = process.env.TRASH_CLEANUP_CRON || '0 3 * * *';
        this.trashCleanupTask = cron.schedule(trashCron, () => {
            this.cleanupOldTrash();
        });
        // Clear any existing backlog shortly after startup.
        this.cleanupOldTrash();

        // Periodically archive notes that haven't been edited in a long time.
        // Same live-toggle approach as trash cleanup. Disabled by default.
        const archiveCron = process.env.AUTO_ARCHIVE_CRON || '0 3 * * *';
        this.autoArchiveTask = cron.schedule(archiveCron, () => {
            this.archiveOldNotes();
        });
        this.archiveOldNotes();
    }

    async cleanupOldTrash() {
        try {
            // Opt out with TRASH_CLEANUP_ENABLED=false. Unset means enabled.
            if (process.env.TRASH_CLEANUP_ENABLED === 'false') return;

            const olderThanDays = parseInt(process.env.TRASH_CLEANUP_AGE_DAYS) || 30;
            const deletedIds = await Note.deleteOldTrashed({ olderThanDays });

            if (deletedIds.length > 0) {
                console.log(`SchedulerService: Permanently deleted ${deletedIds.length} trashed notes`);
                if (this.io) {
                    deletedIds.forEach(id => this.io.emit('note_deleted', id));
                }
            }
        } catch (error) {
            console.error('SchedulerService: Error cleaning up old trash:', error);
        }
    }

    async archiveOldNotes() {
        try {
            // Off by default; enable with AUTO_ARCHIVE_ENABLED=true.
            if (process.env.AUTO_ARCHIVE_ENABLED !== 'true') return;

            const olderThanDays = parseInt(process.env.AUTO_ARCHIVE_AGE_DAYS) || 365;
            const archivedIds = await Note.archiveOldNotes({ olderThanDays });

            if (archivedIds.length > 0) {
                console.log(`SchedulerService: Auto-archived ${archivedIds.length} stale notes`);
                if (this.io) {
                    // Emit the full note so clients move it out of the active
                    // list (and into the archive view) live.
                    for (const id of archivedIds) {
                        try {
                            const fullNote = await Note.findById(id, true);
                            if (fullNote) this.io.emit('note_updated', fullNote);
                        } catch (err) {
                            console.error(`SchedulerService: Failed to emit note_updated for ${id}`, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('SchedulerService: Error auto-archiving notes:', error);
        }
    }

    async cleanupEmptyNotes() {
        try {
            const olderThanMinutes = parseInt(process.env.EMPTY_NOTE_CLEANUP_AGE_MINUTES) || 1440;
            const deletedIds = await Note.deleteEmpty({ olderThanMinutes });

            if (deletedIds.length > 0) {
                console.log(`SchedulerService: Removed ${deletedIds.length} empty notes`);
                if (this.io) {
                    deletedIds.forEach(id => this.io.emit('note_deleted', id));
                }
            }
        } catch (error) {
            console.error('SchedulerService: Error cleaning up empty notes:', error);
        }
    }

    async checkReminders() {
        try {
            const now = new Date();
            // console.log('SchedulerService: Checking reminders at', now.toISOString());

            const dueReminders = await Reminder.getDueReminders();

            if (dueReminders.length > 0) {
                console.log(`SchedulerService: Found ${dueReminders.length} due reminders`);
            }

            for (const reminder of dueReminders) {
                await this.processReminder(reminder);
            }
        } catch (error) {
            console.error('SchedulerService: Error checking reminders:', error);
        }
    }

    async processReminder(reminder) {
        try {
            console.log(`SchedulerService: Processing reminder ${reminder.id} for note ${reminder.note_id}`);

            // 1. Pin the note
            console.log(`SchedulerService: Pinning note ${reminder.note_id}`);
            await Note.update(reminder.note_id, { is_pinned: true });

            // 2. Fetch Note Title for Notification
            const note = await Note.findById(reminder.note_id);
            const title = note ? (note.title || 'Untitled Note') : 'Reminder';

            // 3. Emit Socket Event for Browser Notification
            if (this.io) {
                console.log(`SchedulerService: Emitting reminder_triggered and note_updated for note ${reminder.note_id}`);
                this.io.emit('reminder_triggered', {
                    noteId: reminder.note_id,
                    title: title,
                    message: `Reminder: ${title}`
                });

                // ALSO emit standard note_updated event so the list updates
                // We need the full note object ideally, but providing ID and partial update might work 
                // depending on client listener. Let's fetch the full note to be safe.
                try {
                    const fullNote = await Note.findById(reminder.note_id, true);
                    if (fullNote) {
                        this.io.emit('note_updated', fullNote);
                    }
                } catch (err) {
                    console.error("SchedulerService: Failed to emit note_updated", err);
                }
            }

            // 4. Send Notification (Pushover/Pushbullet)
            await this.sendNotification(reminder, title);

            // 3. Handle Recurrence
            if (reminder.rrule) {
                try {
                    const currentNextRun = new Date(reminder.next_run_at);
                    // Anchor DTSTART to the previous scheduled time so INTERVAL-based
                    // rules advance from the original series, not "now". Mirrors the
                    // skip route's behavior.
                    const dtstart = currentNextRun.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                    const rule = RRule.fromString(`DTSTART:${dtstart}\n${reminder.rrule}`);
                    const nextRun = rule.after(currentNextRun, false);

                    if (nextRun) {
                        console.log(`SchedulerService: Updating recurring reminder ${reminder.id} to next run at ${nextRun.toISOString()}`);
                        await Reminder.update(reminder.id, {
                            next_run_at: nextRun,
                            updated_at: new Date()
                        });
                    } else {
                        console.log(`SchedulerService: No further occurrences for reminder ${reminder.id}, deleting.`);
                        await Reminder.delete(reminder.id);
                    }
                } catch (rruleError) {
                    console.error(`SchedulerService: Error processing RRULE for reminder ${reminder.id}:`, rruleError);
                    // Safety fallback: don't delete, but maybe log warning? 
                    // Or if invalid, maybe delete? Let's keep it but log error to prevent data loss.
                }
            } else {
                // One-time reminder
                console.log(`SchedulerService: Deleting one-time reminder ${reminder.id}`);
                await Reminder.delete(reminder.id);
            }

        } catch (error) {
            console.error(`SchedulerService: Error processing reminder ${reminder.id}:`, error);
        }
    }

    async sendNotification(reminder, title) {
        // Only send if keys are configured
        const pushoverUser = process.env.PUSHOVER_USER;
        const pushoverToken = process.env.PUSHOVER_TOKEN;
        const pushbulletToken = process.env.PUSHBULLET_TOKEN;

        let message = '';
        let displayTitle = 'itsnotes Reminder'; // Changed from "Keep Clone Reminder"

        // Logic to determine message content based on Title vs Content
        const note = await Note.findById(reminder.note_id);
        const noteTitle = note?.title?.trim();

        // Helper to strip HTML and get plain text (roughly)
        const getPlainText = (html) => {
            if (!html) return '';
            return html.replace(/<[^>]*>/g, ' ') // Replace tags with space
                .replace(/\s+/g, ' ')     // Collapse whitespace
                .trim();
        };

        if (noteTitle) {
            message = `Reminder: ${noteTitle}`;
        } else if (note && note.content) {
            // Fallback to content if title is missing
            // We strip HTML tags to get the "intention"
            let plainContent = getPlainText(note.content);

            // The content might start with "🔔 ". Let's keep it or clean it? User seems to like the bell.
            // Truncate if too long (e.g. 100 chars)
            if (plainContent.length > 100) {
                plainContent = plainContent.substring(0, 97) + '...';
            }

            message = plainContent || 'Reminder';
        } else {
            message = 'Reminder';
        }

        if (pushoverUser && pushoverToken) {
            try {
                await axios.post('https://api.pushover.net/1/messages.json', {
                    token: pushoverToken,
                    user: pushoverUser,
                    message: message,
                    title: displayTitle
                });
                console.log('SchedulerService: Sent Pushover notification');
            } catch (e) {
                console.error('SchedulerService: Pushover failed', e.message);
            }
        }

        if (pushbulletToken) {
            try {
                await axios.post('https://api.pushbullet.com/v2/pushes', {
                    type: 'note',
                    title: displayTitle,
                    body: message
                }, {
                    headers: { 'Access-Token': pushbulletToken }
                });
                console.log('SchedulerService: Sent Pushbullet notification');
            } catch (e) {
                console.error('SchedulerService: Pushbullet failed', e.message);
            }
        }

        // ntfy notification
        const ntfyServer = process.env.NTFY_SERVER;
        const ntfyTopic = process.env.NTFY_TOPIC || 'itsnotes-reminders';

        if (ntfyServer) {
            try {
                await axios.post(`${ntfyServer}/${ntfyTopic}`, message, {
                    headers: {
                        'Title': displayTitle,
                        'Priority': '3'
                    }
                });
                console.log('SchedulerService: Sent ntfy notification');
            } catch (e) {
                console.error('SchedulerService: ntfy failed', e.message);
            }
        }
    }
}

module.exports = new SchedulerService();
