// Number of rows shown in each homepage feed (latest blocks / transactions).
// Shared by the server render (page.tsx) and the polling refresh (/api/latest)
// so the feed length stays consistent across updates.
export const HOME_FEED_LIMIT = 30;
