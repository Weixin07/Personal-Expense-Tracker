import { useEffect, useState } from 'react';

/**
 * The latest `value` once it has stopped changing for `delayMs`. A change
 * arriving before the delay elapses replaces the pending one, so a rapid
 * sequence settles once rather than for every step, and a value cleared while
 * one is pending never lands afterwards.
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
};
