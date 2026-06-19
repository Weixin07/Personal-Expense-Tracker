export const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unexpected error occurred';
};

export const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(toErrorMessage(error));
};
