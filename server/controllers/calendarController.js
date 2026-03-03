const { addEventToCalendar } = require('../services/calendarService');

exports.addEvent = async (req, res) => {
    console.log('\n[CalendarController] POST /api/calendar/add-event received');
    console.log('[CalendarController] Is user authenticated?', !!req.user);

    if (!req.user) {
        console.error('[CalendarController] REJECTED: No user session found (401 Unauthorized)');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CalendarController] Authenticated user:', req.user?.email);
    console.log('[CalendarController] Request body:', JSON.stringify(req.body, null, 2));

    try {
        const eventDetails = req.body;
        // eventDetails should have: summary, description, and date
        if (!eventDetails.summary || !eventDetails.date) {
            console.error('[CalendarController] REJECTED: Missing required fields. summary:', eventDetails.summary, ', date:', eventDetails.date);
            return res.status(400).json({ error: 'Missing required event details (summary or date)' });
        }

        console.log('[CalendarController] Calling addEventToCalendar service...');
        const event = await addEventToCalendar(req.user, eventDetails);
        console.log('[CalendarController] SUCCESS: Event added, responding 200');
        res.json({ success: true, event });
    } catch (error) {
        console.error('[CalendarController] FAILED to add calendar event');
        console.error('[CalendarController] Error type:', error.constructor?.name);
        console.error('[CalendarController] Error message:', error.message);
        if (error.response?.data) {
            console.error('[CalendarController] Google API error details:', JSON.stringify(error.response.data, null, 2));
        }
        res.status(500).json({ error: 'Failed to add event to calendar' });
    }
};
