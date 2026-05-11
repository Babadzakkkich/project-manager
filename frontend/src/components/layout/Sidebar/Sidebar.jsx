import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  KanbanSquare,
  Video,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import logo from '../../../assets/logo.png';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  {
    to: '/workspace',
    label: 'Рабочая область',
    description: 'Сводка',
    icon: LayoutDashboard,
  },
  {
    to: '/groups',
    label: 'Группы',
    description: 'Команды',
    icon: Users,
  },
  {
    to: '/projects',
    label: 'Проекты',
    description: 'Работы',
    icon: FolderKanban,
  },
  {
    to: '/tasks',
    label: 'Задачи',
    description: 'Исполнение',
    icon: CheckSquare,
  },
  {
    to: '/management',
    label: 'Доска',
    description: 'Управление задачами',
    icon: KanbanSquare,
  },
  {
    to: '/conferences',
    label: 'Созвоны',
    description: 'Коммуникации',
    icon: Video,
  },
];

export const Sidebar = ({ isCollapsed = false, onToggle }) => {
  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <NavLink to="/workspace" className={styles.brand} aria-label="Syncro">
          <img src={logo} alt="Syncro" className={styles.logo} />
        </NavLink>

        <button
          type="button"
          className={styles.toggleButton}
          onClick={onToggle}
          aria-label={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          title={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={20} strokeWidth={2} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={20} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className={styles.nav} aria-label="Основная навигация">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className={styles.navText}>
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navDescription}>{item.description}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};