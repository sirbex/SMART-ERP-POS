import { useState, useEffect } from 'react';
import { BUSINESS_TIMEZONE } from '../utils/businessDate';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export default function ServerClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs tabular-nums select-none" title={`Business timezone: ${BUSINESS_TIMEZONE}`}>
      <span className="text-gray-500 hidden sm:inline">{dateFmt.format(now)}</span>
      <span className="font-medium text-gray-700">{timeFmt.format(now)}</span>
    </div>
  );
}
