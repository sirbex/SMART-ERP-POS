/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Check if a string is a date-only format (YYYY-MM-DD)
 */
function isDateOnly(dateString: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

/**
 * Parse a date string safely.
 * For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift.
 * For timestamps (ISO 8601), use standard Date parsing.
 */
function safeParseDate(dateString: string): Date {
  if (isDateOnly(dateString)) {
    // Parse YYYY-MM-DD as local midnight (not UTC) to avoid timezone shift
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateString);
}

/**
 * Format date and time for display
 */
export function formatDateTime(dateString: string): string {
  if (isDateOnly(dateString)) {
    // Date-only strings should display as date only, not with time
    return safeParseDate(dateString).toLocaleDateString();
  }
  return new Date(dateString).toLocaleString();
}

/**
 * Format date only
 */
export function formatDate(dateString: string): string {
  return safeParseDate(dateString).toLocaleDateString();
}

/**
 * Format time only
 */
export function formatTime(dateString: string): string {
  if (isDateOnly(dateString)) {
    return ''; // No time component for date-only strings
  }
  return new Date(dateString).toLocaleTimeString();
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = safeParseDate(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  } else {
    return formatDate(dateString);
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Format file extension
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || '';
}

/**
 * Format MIME type to friendly name
 */
export function getMimeTypeName(mimeType: string): string {
  const mimeTypeMap: Record<string, string> = {
    'application/pdf': 'PDF Document',
    'image/jpeg': 'JPEG Image',
    'image/png': 'PNG Image',
    'image/gif': 'GIF Image',
    'image/webp': 'WebP Image',
    'text/plain': 'Text File',
    'application/msword': 'Word Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.ms-excel': 'Excel Spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  };

  return mimeTypeMap[mimeType] || mimeType.split('/')[1].toUpperCase();
}