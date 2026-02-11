// utils/dateUtils.ts

// This helper handles various date formats that can come from Firestore or other sources,
// ensuring consistent Date object creation across different environments.
// It can parse: Firestore Timestamps, ISO date strings, native Date objects, and YYYY-MM-DD strings.

type FirestoreTimestamp = { seconds: number; nanoseconds?: number; toDate?: () => Date };

const isFirestoreTimestamp = (v: any): v is FirestoreTimestamp => {
  return v && (typeof v.seconds === 'number' || typeof v.toDate === 'function');
};

/**
 * Parses a value from various formats into a Date object.
 * @param value The value to parse (Firestore Timestamp, ISO string, Date object, YYYY-MM-DD string, number).
 * @param asEndOfDay If true and the value is a 'YYYY-MM-DD' string, sets the time to 23:59:59.999.
 * @returns A Date object or null if parsing fails.
 */
export function parseToDate(value: any, asEndOfDay = false): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  // Handle Firestore Timestamp objects
  if (isFirestoreTimestamp(value)) {
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }
    const milliseconds = (value.seconds ?? 0) * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6);
    return new Date(milliseconds);
  }
  
  // Handle numbers (seconds or milliseconds)
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000; // Assume seconds if small, ms if large
    return new Date(ms);
  }

  // Handle native Date objects
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Handle string formats
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    // Handle 'YYYY-MM-DD' strings specifically for start/end of day
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return asEndOfDay 
        ? new Date(y, m - 1, d, 23, 59, 59, 999) 
        : new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    // Handle 'YYYY-MM-DD HH:mm(:ss)?' -> treat as local time
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        const isoish = s.replace(' ', 'T');
        const dt = new Date(isoish);
        return isNaN(dt.getTime()) ? null : dt;
    }

    // Handle standard ISO strings etc.
    const date = new Date(s);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}
