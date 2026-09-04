// Date formatting and date divider helpers for Messenger-ko

export function formatMessageTime(dateStringOrObj) {
  if (!dateStringOrObj) return '';
  const date = new Date(dateStringOrObj);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatFullDateTime(dateStringOrObj) {
  if (!dateStringOrObj) return '';
  const date = new Date(dateStringOrObj);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getDateDividerLabel(dateStringOrObj) {
  if (!dateStringOrObj) return '';
  const date = new Date(dateStringOrObj);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const msgDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  if (msgDateOnly.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  } else if (msgDateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday at ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
    return `${dateStr}, ${timeStr}`;
  }
}

/**
 * Determines if a date divider should be rendered between two messages.
 * Note: In inverted list, `currentMsg` is rendered below `olderMsg`.
 * So we compare `currentMsg.createdAt` with `olderMsg.createdAt`.
 */
export function shouldShowDateHeader(currentMsgDate, olderMsgDate) {
  if (!olderMsgDate) return true; // Oldest message always gets a date header at top
  const curr = new Date(currentMsgDate);
  const prev = new Date(olderMsgDate);
  if (isNaN(curr.getTime()) || isNaN(prev.getTime())) return false;

  // Show header if messages are more than 20 minutes apart or on different days
  const isDifferentDay =
    curr.getFullYear() !== prev.getFullYear() ||
    curr.getMonth() !== prev.getMonth() ||
    curr.getDate() !== prev.getDate();

  const diffMinutes = Math.abs((curr.getTime() - prev.getTime()) / (1000 * 60));
  return isDifferentDay || diffMinutes > 20;
}

/**
 * Format last active relative time string (e.g. "Active 5m ago", "Active 2h ago", "Active yesterday")
 */
export function formatLastActiveTime(dateOrTimestamp) {
  if (!dateOrTimestamp) return 'Offline';
  const date = new Date(dateOrTimestamp);
  if (isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Active just now';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'Active just now';
  } else if (diffMinutes < 60) {
    return `Active ${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  } else if (diffDays === 1) {
    return `Active yesterday`;
  } else {
    return `Active ${diffDays}d ago`;
  }
}
