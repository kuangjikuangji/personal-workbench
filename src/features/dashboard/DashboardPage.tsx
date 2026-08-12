import { Link } from 'react-router-dom';
import { QuickCreate } from './QuickCreate';
import { buildDashboardSummary, buildTodayTimeline, localDay, useDashboardData } from './dashboardQueries';
import { TodayTimeline } from './TodayTimeline';

const roleLabels = { dean: '院长助理', head: '系主任', personal: '个人' } as const;

export function DashboardPage({ now = () => new Date() }: { now?: () => Date }) {
  const query = useDashboardData();
  const current = now();
  const data = query.data ?? { todos: [], occurrences: [] };
  const summary = buildDashboardSummary(current, data.todos, data.occurrences);
  const timeline = buildTodayTimeline(current, data.todos, data.occurrences);
  const day = localDay(current);
  return <section className="dashboard-page" aria-labelledby="dashboard-title"><header className="page-header"><div><h2 id="dashboard-title">工作概览</h2><p>{day} · 集中查看今日安排与未完成工作。</p></div></header>{query.isPending && <p role="status">正在加载概览……</p>}{query.isError && <p role="alert">概览加载失败，请刷新后重试。</p>}<div className="summary-grid"><Link className="summary-card" to={`/todos?status=open&date=${day}`}><span>今日待办</span><strong>{summary.todayTodos}</strong></Link><Link className="summary-card" to={`/todos?status=open&due=overdue&before=${day}`}><span>逾期待办</span><strong>{summary.overdueTodos}</strong></Link><Link className="summary-card" to={`/calendar?date=${day}&kind=course`}><span>今日课程</span><strong>{summary.todayCourses}</strong></Link>{(Object.keys(roleLabels) as (keyof typeof roleLabels)[]).map((role) => <Link className="summary-card summary-card-role" key={role} to={`/todos?status=open&role=${role}`}><span>{roleLabels[role]}</span><strong>{summary.byRole[role]}</strong></Link>)}</div><div className="dashboard-layout"><TodayTimeline items={timeline} /><QuickCreate /></div></section>;
}
