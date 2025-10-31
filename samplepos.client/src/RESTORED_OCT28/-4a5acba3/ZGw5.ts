import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('adds numbers correctly', () => {
    const add = (a: number, b: number) => a + b;
    expect(add(2, 3)).toBe(5);
  });
});
