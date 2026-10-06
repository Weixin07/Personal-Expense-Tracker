let activeFlows = 0;

/**
 * Marks the app as handing off to another app (a picker, Google sign-in) while
 * `run` is pending. Nestable; released however `run` settles.
 */
export const withOutboundFlow = async <T>(
  run: () => Promise<T>,
): Promise<T> => {
  activeFlows += 1;
  try {
    return await run();
  } finally {
    activeFlows -= 1;
  }
};

/** Whether a hand-off is in flight. */
export const outboundFlowActive = (): boolean => activeFlows > 0;
