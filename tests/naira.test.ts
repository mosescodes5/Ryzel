import { describe, expect, it } from 'vitest';
import { parseNairaPerUnit, toNaira, PricingConfigError } from '../src/modules/numbers/lib/naira';

describe('parseNairaPerUnit', () => {
  it('fails closed when the rate is missing, empty, zero, negative or not a number', () => {
    for (const bad of [undefined, null, '', '0', '-5', 'abc', 'NaN', 'Infinity']) {
      expect(() => parseNairaPerUnit(bad as string | undefined)).toThrow(PricingConfigError);
    }
  });
  it('accepts a positive number', () => {
    expect(parseNairaPerUnit('18.5')).toBe(18.5);
  });
});

describe('toNaira', () => {
  it('rounds UP to whole naira so we never undercharge', () => {
    expect(toNaira(1.6, 18.5)).toBe(30); // 29.6 -> 30
    expect(toNaira(2, 18.5)).toBe(37);
    expect(toNaira(0.001, 18.5)).toBe(1); // never zero for a real price
  });
  it('does not add a naira because of float noise', () => {
    expect(toNaira(0.1, 30)).toBe(3); // 0.1*30 = 3.0000000000000004 in floats
  });
  it('rejects invalid provider prices', () => {
    expect(() => toNaira(-1, 18)).toThrow(PricingConfigError);
    expect(() => toNaira(Number.NaN, 18)).toThrow(PricingConfigError);
  });
  it('a free price stays free', () => {
    expect(toNaira(0, 18)).toBe(0);
  });
});
