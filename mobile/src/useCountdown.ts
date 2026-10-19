import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (ISO string), or null when there is no clock. */
export function useCountdown(deadline: string | null | undefined): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null;
}
