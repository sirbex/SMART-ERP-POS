import { amountToWords } from './amountToWords.js';

describe('amountToWords', () => {
  it('converts zero', () => {
    expect(amountToWords(0)).toBe('Zero Uganda Shillings Only');
  });

  it('converts single digits', () => {
    expect(amountToWords(5)).toBe('Five Uganda Shillings Only');
  });

  it('converts teens', () => {
    expect(amountToWords(17)).toBe('Seventeen Uganda Shillings Only');
  });

  it('converts tens', () => {
    expect(amountToWords(40)).toBe('Forty Uganda Shillings Only');
  });

  it('converts tens with ones', () => {
    expect(amountToWords(93)).toBe('Ninety-Three Uganda Shillings Only');
  });

  it('converts hundreds', () => {
    expect(amountToWords(500)).toBe('Five Hundred Uganda Shillings Only');
  });

  it('converts hundreds with remainder', () => {
    expect(amountToWords(215)).toBe('Two Hundred Fifteen Uganda Shillings Only');
  });

  it('converts thousands', () => {
    expect(amountToWords(1000)).toBe('One Thousand Uganda Shillings Only');
  });

  it('converts large amounts typical for UGX', () => {
    expect(amountToWords(1234567)).toBe(
      'One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Uganda Shillings Only'
    );
  });

  it('converts millions', () => {
    expect(amountToWords(5000000)).toBe('Five Million Uganda Shillings Only');
  });

  it('ignores decimals (UGX has no cents)', () => {
    expect(amountToWords(1500.75)).toBe(
      'One Thousand Five Hundred Uganda Shillings Only'
    );
  });

  it('handles string input', () => {
    expect(amountToWords('25000')).toBe(
      'Twenty-Five Thousand Uganda Shillings Only'
    );
  });

  it('handles negative amounts (uses absolute value)', () => {
    expect(amountToWords(-3000)).toBe(
      'Three Thousand Uganda Shillings Only'
    );
  });

  it('uses custom currency code', () => {
    expect(amountToWords(100, 'USD')).toBe('One Hundred US Dollars Only');
  });

  it('uses currency code as label for unknown codes', () => {
    expect(amountToWords(100, 'XYZ')).toBe('One Hundred XYZ Only');
  });

  it('converts billions', () => {
    expect(amountToWords(2000000000)).toBe(
      'Two Billion Uganda Shillings Only'
    );
  });
});
