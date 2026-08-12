import { afterEach, expect, test } from 'vitest';
import './styles.css';

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
