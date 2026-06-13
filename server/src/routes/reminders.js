const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');
const SchedulerService = require('../services/scheduler'); // To trigger immediate check if needed? Not really.
const settingsService = require('../services/settings');
const { combinePrompts } = require('../constants/aiPrompts');
const { getAIProvider, getDefaultModel } = require('../services/aiProvider');

router.post('/create', async (req, res) => {
    try {
        const { noteId, noteContent, timezone = 'UTC' } = req.body;

        if (!noteId || !noteContent) {
            return res.status(400).json({ error: 'Note ID and content are required' });
        }

        console.log(`Reminders: Analyzing content for note ${noteId}...`);

        // Calculate current time in user's timezone for accurate relative parsing
        const nowLocalized = new Date().toLocaleString('en-US', { timeZone: timezone });

        // Combine core reminder prompt with custom additions from settings
        const corePrompt = process.env.AI_PROMPT_REMINDER || '';
        const customAdditions = process.env.AI_PROMPT_REMINDER_CUSTOM || '';
        const basePrompt = combinePrompts(corePrompt, customAdditions);

        const prompt = `
      User's Timezone: ${timezone}
      Current Time in User's Timezone: ${nowLocalized}

      ${basePrompt}

      Text: "${noteContent}"
    `;

        const provider = getAIProvider();
        const model = process.env.AI_MODEL_REMINDER || getDefaultModel('reminder');
        const content = await provider.chat({
            messages: [{ role: 'user', content: prompt }],
            model,
            jsonResponse: true,
        });
        let result;
        try {
            result = JSON.parse(content);
        } catch (e) {
            console.error("Reminders: Failed to parse AI response:", content);
            return res.status(500).json({ error: "Invalid response from AI" });
        }

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // Create Reminder
        console.log('Reminders: Creating reminder:', result);
        const reminderData = {
            note_id: noteId,
            rrule: result.rrule,
            next_run_at: result.next_run_at,
            timezone: timezone,
        };

        const reminder = await Reminder.create(reminderData);

        res.json({
            reminder,
            matched_text: result.matched_text,
            reformatted_content: result.reformatted_content,
            schedule_summary: result.schedule_summary // Return the summary
        });

    } catch (error) {
        console.error('Reminders: Error creating reminder:', error);
        if (error.status === 401) {
            return res.status(500).json({ error: 'Invalid API key' });
        }
        res.status(500).json({ error: 'Failed to create reminder' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Reminder ID is required' });
        }

        console.log(`Reminders: Deleting reminder ${id}...`);
        await Reminder.delete(id);
        res.json({ success: true, message: 'Reminder deleted' });
    } catch (error) {
        console.error('Reminders: Error deleting reminder:', error);
        res.status(500).json({ error: 'Failed to delete reminder' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const reminder = await Reminder.findById(id);
        if (!reminder) {
            return res.status(404).json({ error: 'Reminder not found' });
        }
        res.json(reminder);
    } catch (error) {
        console.error('Reminders: Error fetching reminder:', error);
        res.status(500).json({ error: 'Failed to fetch reminder' });
    }
});

router.patch('/:id/skip', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`Reminders: Skipping reminder ${id}...`);

        const reminder = await Reminder.findById(id);
        if (!reminder) {
            return res.status(404).json({ error: 'Reminder not found' });
        }

        // Only recurring reminders can be skipped
        if (!reminder.rrule) {
            return res.status(400).json({ error: 'Cannot skip a one-time reminder' });
        }

        const { RRule } = require('rrule');

        try {
            const currentNextRun = new Date(reminder.next_run_at);

            console.log(`Reminders: Current next_run_at: ${currentNextRun.toISOString()}`);
            console.log(`Reminders: RRULE: ${reminder.rrule}`);

            // Parse the RRULE to create a rule with DTSTART set to the current next_run_at
            // This ensures intervals are calculated from the current scheduled time
            const rruleWithDtstart = `DTSTART:${currentNextRun.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${reminder.rrule}`;
            const rule = RRule.fromString(rruleWithDtstart);

            // Get the next occurrence after the current next_run_at
            const newNextRun = rule.after(currentNextRun, false);

            if (!newNextRun) {
                return res.status(400).json({ error: 'No further occurrences available' });
            }

            console.log(`Reminders: Skipping from ${currentNextRun.toISOString()} to ${newNextRun.toISOString()}`);

            const updatedReminder = await Reminder.update(id, {
                next_run_at: newNextRun
            });

            res.json(updatedReminder);
        } catch (rruleError) {
            console.error('Reminders: Error parsing RRULE:', rruleError);
            return res.status(500).json({ error: 'Invalid recurrence rule' });
        }
    } catch (error) {
        console.error('Reminders: Error skipping reminder:', error);
        res.status(500).json({ error: 'Failed to skip reminder' });
    }
});

module.exports = router;
