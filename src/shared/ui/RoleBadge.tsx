import type { Role } from '../../domain/entities';

const roleLabels: Record<Role, string> = {
  dean: '院长助理',
  head: '系主任',
  personal: '个人',
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`role-badge role-badge-${role}`}>{roleLabels[role]}</span>;
}
