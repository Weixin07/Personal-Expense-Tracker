import { bankersRound, sum } from '../math';

describe('math utilities', () => {
  describe('bankersRound', () => {
    describe('standard rounding (non-0.5 cases)', () => {
      it('should round down when fractional part < 0.5', () => {
        expect(bankersRound(2.4, 0)).toBe(2);
        expect(bankersRound(2.44, 1)).toBe(2.4);
        expect(bankersRound(2.444, 2)).toBe(2.44);
      });

      it('should round up when fractional part > 0.5', () => {
        expect(bankersRound(2.6, 0)).toBe(3);
        expect(bankersRound(2.56, 1)).toBe(2.6);
        expect(bankersRound(2.556, 2)).toBe(2.56);
      });
    });

    describe('bankers rounding (0.5 cases)', () => {
      it('should round to nearest even number when fractional part is exactly 0.5', () => {
        expect(bankersRound(0.5, 0)).toBe(0);
        expect(bankersRound(1.5, 0)).toBe(2);
        expect(bankersRound(2.5, 0)).toBe(2);
        expect(bankersRound(3.5, 0)).toBe(4);
        expect(bankersRound(4.5, 0)).toBe(4);
        expect(bankersRound(5.5, 0)).toBe(6);
      });

      it('should apply bankers rounding at specified decimal places', () => {
        expect(bankersRound(2.45, 1)).toBe(2.4);
        expect(bankersRound(2.55, 1)).toBe(2.6);
        expect(bankersRound(2.445, 2)).toBe(2.44);
        expect(bankersRound(2.455, 2)).toBe(2.46);
      });
    });

    describe('default 2 decimal places', () => {
      it('should default to 2 decimal places when decimals not specified', () => {
        expect(bankersRound(123.456)).toBe(123.46);
        expect(bankersRound(123.454)).toBe(123.45);
        expect(bankersRound(123.455)).toBe(123.46);
      });
    });

    describe('various decimal places', () => {
      it('should round to 0 decimal places', () => {
        expect(bankersRound(123.456, 0)).toBe(123);
        expect(bankersRound(123.6, 0)).toBe(124);
      });

      it('should round to 1 decimal place', () => {
        expect(bankersRound(123.456, 1)).toBe(123.5);
        expect(bankersRound(123.44, 1)).toBe(123.4);
      });

      it('should round to 3 decimal places', () => {
        expect(bankersRound(123.4567, 3)).toBe(123.457);
        expect(bankersRound(123.4564, 3)).toBe(123.456);
      });

      it('should round to 6 decimal places (FX rate precision)', () => {
        expect(bankersRound(1.2345678, 6)).toBe(1.234568);
        expect(bankersRound(1.2345674, 6)).toBe(1.234567);
      });
    });

    describe('edge cases', () => {
      it('should handle zero', () => {
        expect(bankersRound(0, 0)).toBe(0);
        expect(bankersRound(0, 2)).toBe(0);
      });

      it('should handle negative numbers', () => {
        expect(bankersRound(-2.5, 0)).toBe(-2);
        expect(bankersRound(-3.5, 0)).toBe(-4);
        expect(bankersRound(-2.45, 1)).toBe(-2.4);
        expect(bankersRound(-2.55, 1)).toBe(-2.6);
      });

      it('should handle very large numbers', () => {
        expect(bankersRound(999999.995, 2)).toBe(1000000);
        expect(bankersRound(123456.785, 2)).toBe(123456.78);
      });

      it('should handle very small numbers', () => {
        expect(bankersRound(0.00001, 4)).toBe(0);
        expect(bankersRound(0.00005, 4)).toBe(0);
        expect(bankersRound(0.00015, 4)).toBe(0.0002);
      });

      it('should handle Infinity as 0', () => {
        expect(bankersRound(Infinity, 2)).toBe(0);
        expect(bankersRound(-Infinity, 2)).toBe(0);
      });

      it('should handle NaN as 0', () => {
        expect(bankersRound(NaN, 2)).toBe(0);
      });
    });

    describe('floating point precision', () => {
      it('should handle floating point arithmetic correctly', () => {
        expect(bankersRound(0.1 + 0.2, 2)).toBe(0.3);
        expect(bankersRound(0.3 - 0.1, 2)).toBe(0.2);
      });

      it('should handle values very close to 0.5', () => {
        expect(bankersRound(2.51, 0)).toBe(3);
        expect(bankersRound(2.49, 0)).toBe(2);
      });
    });
  });

  describe('sum', () => {
    it('should sum an array of positive numbers', () => {
      expect(sum([1, 2, 3, 4, 5])).toBe(15);
      expect(sum([10, 20, 30])).toBe(60);
      expect(sum([100])).toBe(100);
    });

    it('should sum an array of negative numbers', () => {
      expect(sum([-1, -2, -3])).toBe(-6);
      expect(sum([-10, -20])).toBe(-30);
    });

    it('should sum mixed positive and negative numbers', () => {
      expect(sum([10, -5, 3, -2])).toBe(6);
      expect(sum([100, -50, 25, -25])).toBe(50);
    });

    it('should handle an empty array', () => {
      expect(sum([])).toBe(0);
    });

    it('should handle an array with zeros', () => {
      expect(sum([0, 0, 0])).toBe(0);
      expect(sum([1, 0, 2, 0, 3])).toBe(6);
    });

    it('should handle decimal numbers', () => {
      expect(sum([1.5, 2.5, 3.0])).toBe(7.0);
      expect(sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6, 10);
    });

    it('should handle very large numbers', () => {
      expect(sum([1000000, 2000000, 3000000])).toBe(6000000);
    });

    it('should handle very small numbers', () => {
      expect(sum([0.0001, 0.0002, 0.0003])).toBeCloseTo(0.0006, 10);
    });

    it('should work with readonly arrays', () => {
      const readonlyArray: readonly number[] = [1, 2, 3];
      expect(sum(readonlyArray)).toBe(6);
    });

    it('should handle single element array', () => {
      expect(sum([42])).toBe(42);
      expect(sum([-42])).toBe(-42);
      expect(sum([0])).toBe(0);
    });

    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 10000 }, (_, index) => index + 1);
      const expectedSum = (10000 * 10001) / 2;
      expect(sum(largeArray)).toBe(expectedSum);
    });
  });
});
