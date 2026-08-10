import type { ReactNode } from 'react';

export function EmptyState({ action, description, title }: { action?: ReactNode; description?: string; title: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </section>
  );
}
