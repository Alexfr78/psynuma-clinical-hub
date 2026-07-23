/**
 * Escapes a CSV field value according to RFC 4180
 * - If value contains comma, newline, or double quote, wrap in quotes
 * - Double quotes inside are escaped as ""
 */
function escapeCSVField(
  value: string | number | null | undefined,
  quoteAllText: boolean,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // Check if escaping is needed
  const needsEscape = (quoteAllText && typeof value === 'string') ||
                      stringValue.includes(',') ||
                      stringValue.includes('\n') || 
                      stringValue.includes('\r') || 
                      stringValue.includes('"');
  
  if (needsEscape) {
    // Escape double quotes by doubling them, then wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Builds a CSV string from an array of objects
 * - Adds UTF-8 BOM for Excel compatibility
 * - Uses comma as separator
 * - Decimal points (not commas)
 * - ISO date format (YYYY-MM-DD)
 */
export function buildCsv<T extends object>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>,
  options: { quoteAllText?: boolean } = {},
): string {
  // UTF-8 BOM for Excel Windows compatibility
  const BOM = '\ufeff';
  
  // Build header row
  const quoteAllText = options.quoteAllText === true;
  const headerRow = columns.map(col => escapeCSVField(col.header, quoteAllText)).join(',');
  
  // Build data rows
  const dataRows = rows.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      return escapeCSVField(value as string | number | null | undefined, quoteAllText);
    }).join(',');
  });
  
  return BOM + [headerRow, ...dataRows].join('\r\n');
}
