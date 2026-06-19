import { toError, toErrorMessage } from '../errors';

describe('error utilities', () => {
  describe('toErrorMessage', () => {
    it('returns the message for an Error that has a message', () => {
      expect(toErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the raw string for a string input', () => {
      expect(toErrorMessage('disk full')).toBe('disk full');
    });

    it('returns the fallback for an Error with an empty message', () => {
      expect(toErrorMessage(new Error(''))).toBe('Unexpected error occurred');
    });
  });

  describe('toError', () => {
    it('wraps a non-Error value into an Error carrying the fallback message', () => {
      const result = toError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Unexpected error occurred');
    });

    it('returns the same Error instance unchanged', () => {
      const original = new Error('boom');
      expect(toError(original)).toBe(original);
    });
  });
});
