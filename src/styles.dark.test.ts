import { afterEach, expect, test } from 'vitest';
import './styles.css';

function findRule(selector: string): CSSStyleRule | undefined {
  const visit = (rules: CSSRuleList): CSSStyleRule | undefined => {
    for (const rule of rules) {
      if ('selectorText' in rule && (rule as CSSStyleRule).selectorText.split(',').map((part) => part.trim()).includes(selector)) return rule as CSSStyleRule;
      if ('cssRules' in rule) {
        const nested = visit((rule as CSSGroupingRule).cssRules);
        if (nested) return nested;
      }
    }
  };
  for (const sheet of document.styleSheets) {
    const match = visit(sheet.cssRules);
    if (match) return match;
  }
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.replaceChildren();
});

test.each([
  'dialog', 'table-wrapper', 'todo-filters', 'research-filters', 'student-filters',
  'semester-list', 'calendar-surface', 'content-cards', 'idea-capture', 'todo-card',
])('uses a dark shared surface for %s', (className) => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const surface = document.createElement(className === 'semester-list' || className === 'content-cards' ? 'li' : 'section');
  if (className === 'semester-list' || className === 'content-cards') {
    const list = document.createElement('ul');
    list.className = className;
    list.append(surface);
    document.body.append(list);
  } else {
    surface.className = className;
    document.body.append(surface);
  }

  const style = getComputedStyle(surface);
  expect(style.backgroundColor).not.toBe('rgb(255, 255, 255)');
  expect(style.color).toBe('rgb(233, 239, 247)');
});

test('uses a readable dark warning surface for conflict items', () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const list = document.createElement('ul');
  list.className = 'conflict-list';
  const item = document.createElement('li');
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  item.append(title, detail); list.append(item); document.body.append(list);

  expect(getComputedStyle(item).backgroundColor).toBe('rgb(65, 45, 24)');
  expect(getComputedStyle(title).color).toBe('rgb(255, 237, 213)');
  expect(getComputedStyle(detail).color).toBe('rgb(253, 186, 116)');
});

test('keeps empty headings and table captions readable on dark surfaces', () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const empty = document.createElement('section'); empty.className = 'empty-state';
  const heading = document.createElement('h2'); empty.append(heading);
  const wrapper = document.createElement('div'); wrapper.className = 'table-wrapper';
  const table = document.createElement('table'); table.className = 'responsive-table';
  const caption = document.createElement('caption'); table.append(caption); wrapper.append(table);
  document.body.append(empty, wrapper);

  expect(getComputedStyle(heading).color).toBe('rgb(233, 239, 247)');
  expect(getComputedStyle(caption).color).toBe('rgb(233, 239, 247)');
});

test('defines dark interaction colors for the dialog close action', () => {
  const hover = findRule(':root[data-theme="dark"] .dialog-close:hover');
  const focus = findRule(':root[data-theme="dark"] .dialog-close:focus-visible');
  expect(hover?.style.backgroundColor).toBe('rgb(39, 52, 73)');
  expect(hover?.style.color).toBe('rgb(233, 239, 247)');
  expect(focus?.style.backgroundColor).toBe('rgb(39, 52, 73)');
});

test('defines readable links in the dark mobile management drawer', () => {
  const rule = findRule(':root[data-theme="dark"] .management-drawer .navigation-link');
  expect(rule?.style.color).toBe('rgb(233, 239, 247)');
});
