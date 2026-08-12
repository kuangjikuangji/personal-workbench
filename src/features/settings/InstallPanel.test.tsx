import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { InstallPanel } from './InstallPanel';

test('shows install action only after beforeinstallprompt is available', async () => {
  render(<InstallPanel />);
  expect(screen.queryByRole('button', { name: '安装应用' })).not.toBeInTheDocument();
  expect(screen.getByText(/Chrome\/Edge/)).toBeVisible();
  const prompt = vi.fn();
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted', platform: 'test' }) })));
  await userEvent.setup().click(await screen.findByRole('button', { name: '安装应用' }));
  expect(prompt).toHaveBeenCalledOnce();
});

test('keeps an install prompt that arrived before settings was opened', async () => {
  const prompt = vi.fn();
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted', platform: 'test' }) })));
  render(<InstallPanel />);
  await userEvent.setup().click(await screen.findByRole('button', { name: '安装应用' }));
  expect(prompt).toHaveBeenCalledOnce();
});
