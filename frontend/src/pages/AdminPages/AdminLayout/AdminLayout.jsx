import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  CheckSquare,
  FolderKanban,
  ListChecks,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import styles from './AdminLayout.module.css';

const ADMIN_NAV_ITEMS = [
  { to: '/admin', label: 'Сводка', icon: Activity, end: true },
  { to: '/admin/users', label: 'Пользователи', icon: Users },
  { to: '/admin/groups', label: 'Группы', icon: ShieldCheck },
  { to: '/admin/projects', label: 'Проекты', icon: FolderKanban },
  { to: '/admin/tasks', label: 'Задачи', icon: CheckSquare },
  { to: '/admin/conferences', label: 'Созвоны', icon: Video },
  { to: '/admin/audit', label: 'Аудит', icon: ListChecks },
];

export const AdminLayout = ({ children, title, actions }) => {
  return (
    <section className={styles.page} aria-label={title}>
      <h2 className={styles.srOnly}>{title}</h2>

      <div className={styles.topRow}>
        <nav className={styles.nav} aria-label="Навигация административного раздела">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {actions && <div className={styles.actions}>{actions}</div>}
      </div>

      <div className={styles.content}>{children}</div>
    </section>
  );
};