export const navigation = [
  { to: '/', label: '概览', group: '首页' },
  { to: '/todos', label: '待办管理', group: '日程' },
  { to: '/calendar', label: '日历', group: '日程' },
  { to: '/courses', label: '课表', group: '日程' },
  { to: '/teachers', label: '系室管理', group: '组织管理' },
  { to: '/students', label: '学生管理', group: '组织管理' },
  { to: '/research', label: '个人科研', group: '学习' },
  { to: '/ideas', label: '灵感记录', group: '学习' },
  { to: '/lessons', label: '教学备课', group: '学习' },
  { to: '/settings', label: '设置', group: '设置' },
] as const;

export type NavigationItem = (typeof navigation)[number];

export const mobileNavigation = [
  navigation[0],
  navigation[1],
  navigation[2],
  navigation[3],
] as const;
