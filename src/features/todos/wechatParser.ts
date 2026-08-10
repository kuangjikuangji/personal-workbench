import type { TodoInput } from '../../db/repositories';
import type { Role } from '../../domain/entities';

export interface ParsedTodo extends TodoInput {
  originalText: string;
  needsDateConfirmation: boolean;
}

const ROLE_MARKERS: Array<{ pattern: RegExp; role: Role }> = [
  { pattern: /@院长助理/g, role: 'dean' },
  { pattern: /@系主任/g, role: 'head' },
  { pattern: /@个人/g, role: 'personal' },
];

type ParsedDate = { date: string; matchedText: string };
type ParsedTime = { start: string; end: string | null; matchedText: string };

export function parseWeChatText(text: string, now = new Date()): ParsedTodo[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseLine(line, now));
}

function parseLine(line: string, now: Date): ParsedTodo {
  const roleMarker = ROLE_MARKERS.find(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  });
  const role = roleMarker?.role ?? 'personal';
  const date = parseDate(line, now);
  const time = parseTime(line);
  const startTime = time?.start ?? '09:00';
  const startAt = date ? `${date.date}T${startTime}` : null;
  const endAt = date && time?.end ? `${date.date}T${time.end}` : null;

  let title = line;
  for (const { pattern } of ROLE_MARKERS) {
    pattern.lastIndex = 0;
    title = title.replace(pattern, ' ');
  }
  if (date) title = title.replace(date.matchedText, ' ');
  if (time) title = title.replace(time.matchedText, ' ');
  title = title.replace(/\s+/g, ' ').trim();

  return {
    title: title || line,
    description: '',
    role,
    startAt,
    endAt,
    remindAt: null,
    priority: 'normal',
    status: 'open',
    sourceType: null,
    sourceId: null,
    originalText: line,
    needsDateConfirmation: !date,
  };
}

function parseDate(text: string, now: Date): ParsedDate | null {
  const relative = text.match(/(?:今天|今日|明天|明日|后天)/);
  if (relative) {
    const offset = /(?:明天|明日)/.test(relative[0]) ? 1 : relative[0] === '后天' ? 2 : 0;
    const target = new Date(now);
    target.setDate(target.getDate() + offset);
    return { date: formatDate(target), matchedText: relative[0] };
  }

  const full = text.match(/(\d{4})[\-/.\u5e74](\d{1,2})[\-/.\u6708](\d{1,2})(?:日|号)?/);
  if (full) {
    const date = validatedDate(Number(full[1]), Number(full[2]), Number(full[3]));
    return date ? { date, matchedText: full[0] } : null;
  }

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})(?:日|号)?/);
  if (!monthDay) return null;

  let year = now.getFullYear();
  let date = validatedDate(year, Number(monthDay[1]), Number(monthDay[2]));
  if (date && new Date(`${date}T23:59:59`) < now) {
    year += 1;
    date = validatedDate(year, Number(monthDay[1]), Number(monthDay[2]));
  }
  return date ? { date, matchedText: monthDay[0] } : null;
}

function parseTime(text: string): ParsedTime | null {
  const range = text.match(/((?:上午|下午|晚上)?\s*\d{1,2}(?::\d{2}|点半?|点\d{1,2}分?))\s*[-~至到—]\s*((?:上午|下午|晚上)?\s*\d{1,2}(?::\d{2}|点半?|点\d{1,2}分?))/);
  if (range) {
    const start = normalizeTime(range[1]);
    const end = normalizeTime(range[2]);
    if (start && end) return { start, end, matchedText: range[0] };
  }

  const single = text.match(/(?:上午|下午|晚上)?\s*\d{1,2}(?::\d{2}|点半?|点\d{1,2}分?)/);
  if (!single) return null;
  const start = normalizeTime(single[0]);
  return start ? { start, end: null, matchedText: single[0] } : null;
}

function normalizeTime(value: string): string | null {
  const compact = value.replace(/\s/g, '');
  const period = compact.match(/^上午|下午|晚上/)?.[0];
  const digits = compact.replace(/^(?:上午|下午|晚上)/, '');
  const match = digits.match(/^(\d{1,2})(?::(\d{2})|点(半|\d{1,2})?(?:分)?)$/);
  if (!match) return null;

  let hour = Number(match[1]);
  let minute = match[2] ? Number(match[2]) : match[3] === '半' ? 30 : Number(match[3] ?? 0);
  if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
  if (period === '上午' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validatedDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
