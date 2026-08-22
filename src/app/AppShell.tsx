import { type PropsWithChildren, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Dialog } from '../shared/ui/Dialog';
import { Button } from '../shared/ui/Button';
import { managementNavigation, mobileNavigation, navigation, personalNavigation } from './navigation';
import { usePwaUpdate } from './usePwaUpdate';
import './installPromptStore';
import type { Profile } from '../features/auth/authTypes';

function NavigationLink({ item, onNavigate }: { item: { to: string; label: string }; onNavigate?: () => void }) {
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

function AccountSummary({ profile, onSignOut }: { profile: Profile; onSignOut(): Promise<void> }) {
  return (
    <section className="account-summary" aria-label="当前账号">
      <div><strong>{profile.username}</strong><span>{profile.role === 'admin' ? '管理员' : '成员'}</span></div>
      <Button variant="secondary" onClick={() => { void onSignOut(); }}>退出登录</Button>
    </section>
  );
}

function DesktopNavigation({ hidden, profile, onSignOut }: { hidden: boolean; profile: Profile; onSignOut(): Promise<void> }) {
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
      <AccountSummary profile={profile} onSignOut={onSignOut} />
    </aside>
  );
}

export function AppShell({ children, profile, onSignOut }: PropsWithChildren<{ profile: Profile; onSignOut(): Promise<void> }>) {
  const [managementOpen, setManagementOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const pwaUpdate = usePwaUpdate();

  return (
    <div className="app-shell">
      <DesktopNavigation hidden={managementOpen} profile={profile} onSignOut={onSignOut} />
      <main className="app-content">{children}</main>
      {pwaUpdate.needRefresh && <aside className="pwa-update-banner" role="status"><div><strong>新版本已准备好</strong><p>可立即更新，或稍后在本次使用结束后处理。</p>{pwaUpdate.blockedMessage && <p role="alert">{pwaUpdate.blockedMessage}</p>}</div><div className="page-actions"><Button variant="secondary" onClick={pwaUpdate.later}>稍后</Button><Button onClick={() => { void pwaUpdate.updateNow(); }}>立即更新</Button></div></aside>}
      <nav className="mobile-nav" aria-label="底部导航">
        {mobileNavigation.map((item) => <NavigationLink item={item} key={item.to} />)}
        <button className="navigation-link" type="button" onClick={() => setManagementOpen(true)}>管理</button>
        <button className="navigation-link" type="button" onClick={() => setPersonalOpen(true)}>我的</button>
      </nav>
      <Dialog className="management-drawer" open={managementOpen} onClose={() => setManagementOpen(false)} title="管理">
        <nav aria-label="管理导航">
          {managementNavigation.map((item) => (
            <NavigationLink item={item} key={item.to} onNavigate={() => setManagementOpen(false)} />
          ))}
        </nav>
      </Dialog>
      <Dialog className="management-drawer" open={personalOpen} onClose={() => setPersonalOpen(false)} title="我的">
        <AccountSummary profile={profile} onSignOut={onSignOut} />
        <nav aria-label="我的导航">
          {personalNavigation.map((item) => (
            <NavigationLink item={item} key={item.to} onNavigate={() => setPersonalOpen(false)} />
          ))}
        </nav>
      </Dialog>
    </div>
  );
}
