// Month bucketing for the notes list. Both layouts (grid and stacked) render
// unpinned notes under month-of-creation separators, so the grouping lives here
// rather than being duplicated in each one.

export const MONTH_SHORT_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

/**
 * Bucket notes by their creation month, newest month first by default.
 * Groups carry everything the separators and the sticky header need:
 * { label, year, month, monthShort, notes, timestamp }.
 * Only meaningful when the list itself is in creation-date order.
 */
export function groupNotesByMonth(notes, { oldestFirst = false } = {}) {
  const grouped = {};

  notes.forEach(note => {
    const date = new Date(note.created_at);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthYearKey = `${year}-${month}`;

    if (!grouped[monthYearKey]) {
      grouped[monthYearKey] = {
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        year,
        month,
        monthShort: MONTH_SHORT_NAMES[month - 1],
        notes: [],
        timestamp: date.getTime()
      };
    }
    grouped[monthYearKey].notes.push(note);
  });

  // Month groups follow the list direction.
  return Object.values(grouped).sort((a, b) =>
    oldestFirst ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
  );
}
