import { describe, expect, it } from 'vitest';

import { fmt, titleFor } from './format';

describe('fmt', () => {
  it('renders small numbers as plain integers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(42)).toBe('42');
    expect(fmt(999)).toBe('999');
    expect(fmt(12.7)).toBe('12'); // floored
  });

  it('uses named short-scale suffixes', () => {
    expect(fmt(1000)).toBe('1.00K');
    expect(fmt(1500)).toBe('1.50K');
    expect(fmt(1_000_000)).toBe('1.00M');
    expect(fmt(2.5e9)).toBe('2.50B');
    expect(fmt(1e12)).toBe('1.00T');
    expect(fmt(1e33)).toBe('1.00Dc');
  });

  it('falls back to scientific notation past Decillion', () => {
    expect(fmt(1e36)).toBe('1.00e36');
    expect(fmt(1.5e45)).toBe('1.50e45');
    expect(fmt(9.99e120)).toBe('9.99e120');
  });

  it('handles negatives and non-finite values without crashing', () => {
    expect(fmt(-1500)).toBe('-1.50K');
    expect(fmt(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(fmt(Number.NaN)).toBe('0');
  });
});

describe('titleFor', () => {
  it('embeds the formatted BP', () => {
    expect(titleFor(0)).toBe('0 BP · Booty Clicker');
    expect(titleFor(1500)).toBe('1.50K BP · Booty Clicker');
  });
});
