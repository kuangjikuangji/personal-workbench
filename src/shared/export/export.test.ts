import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { makeCsv } from './csv';
import { makeXlsx } from './xlsx';

describe('tabular exports', () => {
  test('adds a UTF-8 BOM and quotes Chinese CSV cells safely', () => {
    const bytes = makeCsv(
      [{ key: 'name', label: '姓名' }, { key: 'note', label: '备注' }],
      [{ name: '张老师', note: '参会,正常' }],
    );

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('姓名,备注\r\n张老师,"\u53c2\u4f1a,\u6b63\u5e38"');
  });

  test('escapes quotes and line breaks without losing nullish cells', () => {
    const bytes = makeCsv(
      [{ key: 'note', label: '备注' }, { key: 'missing', label: '缺失' }],
      [{ note: '他说"\u597d"\n下次见', missing: null }],
    );

    expect(new TextDecoder().decode(bytes)).toContain('"\u4ed6\u8bf4""\u597d""\n\u4e0b\u6b21\u89c1",');
  });

  test('creates a readable xlsx workbook with stable Chinese headers', async () => {
    const buffer = await makeXlsx(
      '教师汇总',
      [{ key: 'name', label: '教师姓名' }, { key: 'state', label: '状态' }],
      [{ name: '张老师', state: '已填报' }],
    );

    const workbook = XLSX.read(buffer);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['教师汇总'])).toEqual([
      { 教师姓名: '张老师', 状态: '已填报' },
    ]);
  });
});
