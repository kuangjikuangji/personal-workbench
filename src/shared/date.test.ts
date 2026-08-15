import { describe, expect, test } from 'vitest';
import { localDateValue } from './date';

describe('localDateValue', () => {
  test('formats the calendar date in local time instead of slicing UTC', () => {
    const localMidnight = new Date(2026, 7, 10, 0, 30);
    expect(localDateValue(localMidnight)).toBe('2026-08-10');
  });
});
