import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useAuthContext } from '../../../contexts/AuthContext';
import { NotificationBell } from '../../ui/NotificationBell/NotificationBell';
import styles from './Topbar.module.css';

const PAGE_META = [
  {
    test: (path) => path === '/workspace',
    title: 'Рабочая область',
    subtitle: 'Сводка по проектам, задачам и активности',
  },
  {
    test: (path) => path === '/groups/create',
    title: 'Создание группы',
    subtitle: 'Настройка новой рабочей команды',
  },
  {
    test: (path) => path.startsWith('/groups/'),
    title: 'Группа',
    subtitle: 'Участники, проекты и связанные задачи',
  },
  {
    test: (path) => path === '/groups',
    title: 'Группы',
    subtitle: 'Команды и права участников',
  },
  {
    test: (path) => path === '/projects/create',
    title: 'Создание проекта',
    subtitle: 'Параметры, сроки и связанные группы',
  },
  {
    test: (path) => path.startsWith('/projects/'),
    title: 'Проект',
    subtitle: 'Задачи, сроки и участники проекта',
  },
  {
    test: (path) => path === '/projects',
    title: 'Проекты',
    subtitle: 'Активные и завершённые проектные работы',
  },
  {
    test: (path) => path === '/tasks/create',
    title: 'Создание задачи',
    subtitle: 'Постановка новой задачи',
  },
  {
    test: (path) => path.startsWith('/tasks/'),
    title: 'Задача',
    subtitle: 'Описание, исполнители, сроки и история',
  },
  {
    test: (path) => path === '/tasks',
    title: 'Задачи',
    subtitle: 'Список задач и контроль исполнения',
  },
  {
    test: (path) => path === '/management',
    title: 'Доска',
    subtitle: 'Управление задачами по статусам',
  },
  {
    test: (path) => path.startsWith('/conferences/'),
    title: 'Комната созвона',
    subtitle: 'Рабочее обсуждение в реальном времени',
  },
  {
    test: (path) => path === '/conferences',
    title: 'Созвоны',
    subtitle: 'Командные обсуждения и конференции',
  },
  {
    test: (path) => path === '/notifications',
    title: 'Уведомления',
    subtitle: 'События проектов, задач и групп',
  },
  {
    test: (path) => path === '/invitations',
    title: 'Приглашения',
    subtitle: 'Входящие приглашения в группы',
  },
  {
    test: (path) => path === '/profile',
    title: 'Профиль',
    subtitle: 'Данные аккаунта и параметры пользователя',
  },
];

const getPageMeta = (pathname) => {
  return (
    PAGE_META.find((item) => item.test(pathname)) || {
      title: 'Syncro',
      subtitle: 'Рабочее пространство проекта',
    }
  );
};

const getInitials = (user) => {
  const source = user?.name || user?.login || user?.email || 'S';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

export const Topbar = () => {
  const { user, logout } = useAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  useEffect(() => {
    setIsDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfileClick = () => {
    navigate('/profile');
    setIsDropdownOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setIsDropdownOpen(false);
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.pageInfo}>
        <h1 className={styles.title}>{pageMeta.title}</h1>
        <p className={styles.subtitle}>{pageMeta.subtitle}</p>
      </div>

      <div className={styles.actions}>
        <NotificationBell />

        <div className={styles.profileMenu} ref={dropdownRef}>
          <button
            className={styles.profileButton}
            type="button"
            onClick={() => setIsDropdownOpen((value) => !value)}
            aria-expanded={isDropdownOpen}
            aria-label="Меню профиля"
          >
            <span className={styles.avatar}>{getInitials(user)}</span>

            <span className={styles.profileText}>
              <span className={styles.profileName}>
                {user?.name || user?.login || 'Пользователь'}
              </span>
              <span className={styles.profileEmail}>{user?.email}</span>
            </span>

            <ChevronDown
              size={18}
              strokeWidth={2}
              className={`${styles.chevron} ${isDropdownOpen ? styles.chevronOpen : ''}`}
              aria-hidden="true"
            />
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>
                <div className={styles.dropdownAvatar}>{getInitials(user)}</div>

                <div className={styles.dropdownUser}>
                  <div className={styles.dropdownLogin}>
                    {user?.name || user?.login || 'Пользователь'}
                  </div>
                  <div className={styles.dropdownEmail}>{user?.email}</div>
                </div>
              </div>

              <button
                className={styles.dropdownItem}
                type="button"
                onClick={handleProfileClick}
              >
                <UserRound size={18} strokeWidth={2} aria-hidden="true" />
                Перейти в профиль
              </button>

              <button
                className={`${styles.dropdownItem} ${styles.logoutItem}`}
                type="button"
                onClick={handleLogout}
              >
                <LogOut size={18} strokeWidth={2} aria-hidden="true" />
                Выйти из аккаунта
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};