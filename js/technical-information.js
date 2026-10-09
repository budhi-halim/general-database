const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Normalize portal dates without depending on browser locale or local time zone. */
export function technicalDate(value) {
  const text = String(value ?? '').trim();
  let iso = text;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
    if (!month) return '';
    iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

/** Decode lists from the portal; malformed text remains available instead of disappearing. */
export function requestedDocuments(value) {
  let decoded = value;
  for (let depth = 0; depth < 2 && typeof decoded === 'string'; depth++) {
    const text = decoded.trim();
    if (!text) return [];
    try { decoded = JSON.parse(text); }
    catch { decoded = text; break; }
  }
  if (decoded === null || decoded === undefined) return [];
  const entries = Array.isArray(decoded) ? decoded : [decoded];
  return entries.map(entry => typeof entry === 'string' ? entry.trim() : entry == null ? '' : JSON.stringify(entry)).filter(Boolean);
}
