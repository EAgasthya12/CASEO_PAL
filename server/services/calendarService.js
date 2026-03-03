const { google } = require('googleapis');

const addEventToCalendar = async (user, eventDetails) => {
    console.log('\n[CalendarService] ========================');
    console.log('[CalendarService] addEventToCalendar called');
    console.log('[CalendarService] User ID:', user?._id);
    console.log('[CalendarService] User Email:', user?.email);
    console.log('[CalendarService] Has accessToken:', !!user?.accessToken);
    console.log('[CalendarService] Has refreshToken:', !!user?.refreshToken);
    console.log('[CalendarService] Event Details received:', JSON.stringify(eventDetails, null, 2));

    try {
        // Step 1: Validate user tokens
        if (!user.accessToken) {
            console.error('[CalendarService] FAILED: No access token found for user');
            throw new Error('No access token found for user');
        }

        // Step 2: Build OAuth2 client (created here so env vars are guaranteed to be loaded)
        console.log('[CalendarService] Step 2: Building OAuth2 client...');
        console.log('[CalendarService] GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
        console.log('[CalendarService] GOOGLE_CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);
        console.log('[CalendarService] GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        // Step 3: Set credentials
        console.log('[CalendarService] Step 3: Setting credentials...');
        oauth2Client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken || null
        });
        console.log('[CalendarService] Credentials set successfully');

        // Step 4: Format date
        console.log('[CalendarService] Step 4: Formatting date from:', eventDetails.date);
        const dateObj = new Date(eventDetails.date);
        if (isNaN(dateObj.getTime())) {
            console.error('[CalendarService] FAILED: Invalid date -', eventDetails.date);
            throw new Error(`Invalid date provided: ${eventDetails.date}`);
        }
        const dateString = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        console.log('[CalendarService] Formatted date string:', dateString);

        // Step 5: Build event object
        // NOTE: For all-day events using `date` (not `dateTime`),
        // the `timeZone` field must NOT be included — Google API returns 400 if it is.
        const event = {
            summary: eventDetails.summary,
            description: eventDetails.description,
            start: {
                date: dateString,   // all-day event format
            },
            end: {
                date: dateString,   // same day for single-day deadline
            }
        };
        console.log('[CalendarService] Step 5: Event object built:', JSON.stringify(event, null, 2));

        // Step 6: Insert event via Google Calendar API
        console.log('[CalendarService] Step 6: Calling Google Calendar API...');
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const result = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        console.log('[CalendarService] SUCCESS! Event inserted.');
        console.log('[CalendarService] Event ID:', result.data.id);
        console.log('[CalendarService] Event Link:', result.data.htmlLink);
        console.log('[CalendarService] ========================\n');

        return result.data;
    } catch (error) {
        console.error('[CalendarService] *** ERROR adding event to calendar ***');
        console.error('[CalendarService] Error message:', error.message);
        console.error('[CalendarService] Error code:', error.code);
        console.error('[CalendarService] Error status:', error.status);
        if (error.response) {
            console.error('[CalendarService] Google API response status:', error.response.status);
            console.error('[CalendarService] Google API response data:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('[CalendarService] ========================\n');
        throw error;
    }
};

module.exports = { addEventToCalendar };
