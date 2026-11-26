"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `endsAt` (a time on the server's clock).
 * `clockOffset` corrects for this device's clock being a little fast or slow.
 */
export function useCountdown(endsAt: number | undefined, clockOffset: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === undefined) return 0;
  return Math.max(0, endsAt - (now + clockOffset));
}
