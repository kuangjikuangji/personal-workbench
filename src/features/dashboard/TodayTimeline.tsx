import type { TimelineItem } from './dashboardQueries';

export function TodayTimeline({ items }: { items: TimelineItem[] }) {
  return <section className="dashboard-panel" aria-labelledby="timeline-title"><h3 id="timeline-title">今日时间轴</h3>{items.length === 0 ? <p className="muted">今日暂无已排期的待办或课程。</p> : <ol className="today-timeline">{items.map((item) => <li key={`${item.kind}-${item.id}`}><time dateTime={item.start}>{item.start.slice(11, 16)}</time><div><strong>{item.title}</strong><span>{item.kind === 'course' ? '课程' : '待办'}{item.end ? ` · 至 ${item.end.slice(11, 16)}` : ''}</span></div></li>)}</ol>}</section>;
}
