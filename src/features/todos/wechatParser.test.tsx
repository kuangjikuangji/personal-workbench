import { describe, expect, test } from 'vitest';
import { parseWeChatText } from './wechatParser';

describe('parseWeChatText', () => {
  test('marks an unresolved date for confirmation', () => {
    const [item] = parseWeChatText(
      '下次开会提交预算表 @院长助理',
      new Date('2026-08-10T08:00:00+08:00'),
    );

    expect(item).toMatchObject({
      title: '下次开会提交预算表',
      role: 'dean',
      needsDateConfirmation: true,
    });
    expect(item.startAt).toBeNull();
  });

  test('parses relative dates, a time range, and each non-empty line', () => {
    const items = parseWeChatText(
      '明天 14:30-16:00 院务会 @系主任\n\n2026-08-15 09:00 交材料',
      new Date('2026-08-10T08:00:00+08:00'),
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: '院务会',
      role: 'head',
      startAt: '2026-08-11T14:30',
      endAt: '2026-08-11T16:00',
      needsDateConfirmation: false,
    });
    expect(items[1]).toMatchObject({
      title: '交材料',
      role: 'personal',
      startAt: '2026-08-15T09:00',
      needsDateConfirmation: false,
    });
  });
});
