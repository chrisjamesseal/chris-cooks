/** Tiny inline SVG icons — crisp and identical on every device, unlike emoji. */

/** Rounded-rect calendar with header bar and a highlighted day. */
export function CalendarIcon({ className = 'calendar-icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="17.5" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" stroke="currentColor" strokeWidth="2" />
      <line x1="7.5" y1="2" x2="7.5" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16.5" y1="2" x2="16.5" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="6.5" y="13" width="5" height="5" rx="1.2" fill="currentColor" />
    </svg>
  )
}

/** Filled heart for favourites. */
export function HeartIcon({ className = 'heart-icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21c-.4 0-.8-.14-1.1-.42C6.6 16.9 2.5 13.3 2.5 9.3 2.5 6.4 4.8 4 7.7 4c1.7 0 3.3.8 4.3 2.1C13 4.8 14.6 4 16.3 4c2.9 0 5.2 2.4 5.2 5.3 0 4-4.1 7.6-8.4 11.28-.3.28-.7.42-1.1.42z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Miniature Apple-Reminders-style glyph for the shopping list button. */
export function RemindersIcon() {
  return (
    <svg className="reminders-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#fff" />
      <circle cx="6.2" cy="7" r="1.9" fill="#ff9500" />
      <rect x="10" y="5.9" width="9" height="2.2" rx="1.1" fill="#c7c7cc" />
      <circle cx="6.2" cy="12" r="1.9" fill="#007aff" />
      <rect x="10" y="10.9" width="9" height="2.2" rx="1.1" fill="#c7c7cc" />
      <circle cx="6.2" cy="17" r="1.9" fill="#34c759" />
      <rect x="10" y="15.9" width="9" height="2.2" rx="1.1" fill="#c7c7cc" />
    </svg>
  )
}
