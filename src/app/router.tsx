import { Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { navigation } from './navigation';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="page-title">
      <h2 id="page-title">{title}</h2>
      <p>该功能正在建设中。</p>
    </section>
  );
}

export function AppRouter() {
  return (
    <AppShell>
      <Routes>
        {navigation.map((item) => <Route element={<PlaceholderPage title={item.label} />} key={item.to} path={item.to} />)}
        <Route element={<PlaceholderPage title="页面未找到" />} path="*" />
      </Routes>
    </AppShell>
  );
}
