export const bankersRound = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const epsilon = 1e-8;
  const isEven = (num: number) => Math.abs(num % 2) < epsilon;

  if (Math.abs(diff - 0.5) < epsilon) {
    const rounded = isEven(floor) ? floor : floor + 1;
    return Number((rounded / factor).toFixed(decimals));
  }

  const rounded = Math.round(scaled);
  return Number((rounded / factor).toFixed(decimals));
};

export const sum = (values: readonly number[]): number => {
  if (!values.length) {
    return 0;
  }
  return values.reduce((accumulator, current) => accumulator + current, 0);
};