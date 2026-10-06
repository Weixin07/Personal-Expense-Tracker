import { outboundFlowActive, withOutboundFlow } from '../outboundFlow';

describe('withOutboundFlow', () => {
  it('is active only while the hand-off is pending', async () => {
    let activeDuring: boolean | undefined;
    const result = await withOutboundFlow(async () => {
      activeDuring = outboundFlowActive();
      return 'picked';
    });
    expect(activeDuring).toBe(true);
    expect(result).toBe('picked');
    expect(outboundFlowActive()).toBe(false);
  });

  it('is released when the hand-off rejects', async () => {
    await expect(
      withOutboundFlow(async () => {
        throw new Error('cancelled');
      }),
    ).rejects.toThrow('cancelled');
    expect(outboundFlowActive()).toBe(false);
  });

  it('stays active until the outermost of nested hand-offs settles', async () => {
    let activeBetween: boolean | undefined;
    await withOutboundFlow(async () => {
      await withOutboundFlow(async () => undefined);
      activeBetween = outboundFlowActive();
    });
    expect(activeBetween).toBe(true);
    expect(outboundFlowActive()).toBe(false);
  });
});
