import { type PropsWithChildren, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Dialog } from '../shared/ui/Dialog';
import { mobileNavigation, navigation, type NavigationItem } from './navigation';

function NavigationLink({ item, onNavigate }: { item: NavigationItem; onNavigate?: () => void }) {
  return (
    <NavLink
      className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}
      onClick={onNavigate}
      to={item.to}
    >
      {item.label}
    </NavLink>
  );
}

function DesktopNavigation({ hidden }: { hidden: boolean }) {
  const groups = [...new Set(navigation.map((item) => item.group))];

  return (
    <aside aria-hidden={hidden || undefined} className="desktop-sidebar">
      <h1>个人工作学习工作台</h1>
      <nav aria-label="主导航">
        {groups.map((group) => (
          <section className="navigation-group" key={group} aria-label={group}>
            <h2>{group}</h2>
            {navigation.filter((item) => item.group === group).map((item) => (
              <NavigationLink item={item} key={item.to} />
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const [managementOpen, setManagementOpen] = useState(false);

  return (
    <div className="app-shell">
      <DesktopNavigation hidden={managementOpen} />
      <main className="app-content">{children}</main>
      <nav className="mobile-nav" aria-label="底部导航">
        {mobileNavigation.map((item) => <NavigationLink item={item} key={item.to} />)}
        <button className="navigation-link" type="button" onClick={() => setManagementOpen(true)}>管理</button>
      </nav>
      <Dialog className="management-drawer" open={managementOpen} onClose={() => setManagementOpen(false)} title="管理">
        <nav aria-label="管理导航">
          {navigation.filter((item) => item.group === '组织管理').map((item) => (
            <NavigationLink item={item} key={item.to} onNavigate={() => setManagementOpen(false)} />
          ))}
        </nav>
      </Dialog>
    </div>
  );
}
