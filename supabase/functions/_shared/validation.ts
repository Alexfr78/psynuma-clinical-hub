/**
 * Shared input validation utilities for edge functions.
 * Prevents malformed data from reaching the database.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

/** Validate email format. Returns true if valid. */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length <= 255 && EMAIL_REGEX.test(trimmed);
}

/** Validate date format YYYY-MM-DD and that it represents a real date. */
export function isValidDate(date: string): boolean {
  if (!date || typeof date !== 'string') return false;
  if (!DATE_REGEX.test(date)) return false;
  // Verify it's a real date
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

/** Validate time format HH:MM (24h). */
export function isValidTime(time: string): boolean {
  if (!time || typeof time !== 'string') return false;
  if (!TIME_REGEX.test(time)) return false;
  const [h, m] = time.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Validate a trimmed string has reasonable length. */
export function isValidName(name: string, maxLength = 100): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}
