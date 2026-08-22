import { render, screen } from '@testing-library/react';
import { App } from './App';

test('fails closed when cloud authentication is not configured', async () => {
  render(<App />);

  expect(await screen.findByRole('alert')).toHaveTextContent('系统尚未配置。');
  expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
});
