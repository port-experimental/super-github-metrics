import { jest, describe, it, expect } from '@jest/globals';

describe('Basic Test Setup', () => {
  it('should work with basic Jest functionality', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with Jest mocks', () => {
    const mockFn = jest.fn().mockReturnValue('test');
    expect(mockFn()).toBe('test');
  });

  it('should work with basic math', () => {
    expect(2 * 3).toBe(6);
    expect(10 - 5).toBe(5);
    expect(15 / 3).toBe(5);
  });

  it('should work with strings', () => {
    expect('hello' + ' world').toBe('hello world');
    expect('test'.length).toBe(4);
  });

  it('should work with arrays', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr[0]).toBe(1);
  });
}); 