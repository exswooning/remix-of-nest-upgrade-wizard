
import { format } from "date-fns";

// Helper to parse date from string in DD/MM/YYYY format
export function parseDate(dateStr: string): Date | null {
  if (!dateStr.trim()) return null;
  
  // Primary format: DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyPattern = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
  const match = dateStr.match(ddmmyyyyPattern);
  
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // JS months are 0-indexed
    const year = parseInt(match[3]);
    
    // Validate the date components
    if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1900 || year > 2100) {
      return null;
    }
    
    const date = new Date(year, month, day);
    // Verify the date is valid (handles invalid dates like 31/02/2024)
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date;
    }
  }
  
  // Do NOT fall back to new Date() as it uses MM/DD/YYYY format in some locales
  return null;
}

export function formatDate(date: Date) {
  return format(date, "dd/MM/yyyy");
}
