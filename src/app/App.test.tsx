import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the Chinese workbench shell', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: '个人工作学习工作台' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
});
