import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  Mail,
  RefreshCw,
  Search,
} from 'lucide-react';

import { useNotifications } from '../../hooks/useNotifications';
import { useInvitations } from '../../hooks/useInvitations';
import { InvitationNotification } from '../../components/ui/InvitationNotification/InvitationNotification';
import { Button } from '../../components/ui/Button';
import {
  formatRussianCount,
  getRussianPluralForm,
} from '../../utils/helpers';
import styles from './Notifications.module.css';

const NOTIFICATION_FORMS = ['уведомление', 'уведомления', 'уведомлений'];
const INVITATION_FORMS = ['приглашение', 'приглашения', 'приглашений'];

const TYPE_GROUPS = {
  tasks: [
    'task_created',
    'task_updated',
    'task_deleted',
    'task_status_changed',
    'task_deadline_changed',
    'task_assigned',
    'user_assigned_to_task',
    'user_unassigned_from_task',
  ],
  projects: [
    'project_created',
    'project_updated',
    'project_deleted',
    'group_linked_to_project',
    'group_unlinked_from_project',
  ],
  groups: [
    'group_created',
    'group_updated',
    'group_deleted',
    'user_added_to_group',
    'user_removed_from_group',
    'user_role_changed',
    'invitation_accepted',
    'invitation_declined',
  ],
  conferences: [
    'conference_created',
    'conference_started',
    'conference_ended',
    'conference_invitation',
    'conference_reminder',
    'room_created',
    'room_started',
  ],
};

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'unread', label: 'Непрочитанные' },
  { key: 'invitations', label: 'Приглашения' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'projects', label: 'Проекты' },
  { key: 'groups', label: 'Группы' },
  { key: 'conferences', label: 'Созвоны' },
];

const getNotificationGroup = (type = '') => {
  if (TYPE_GROUPS.tasks.includes(type) || type.startsWith('task_')) {
    return 'tasks';
  }

  if (TYPE_GROUPS.projects.includes(type) || type.startsWith('project_')) {
    return 'projects';
  }

  if (TYPE_GROUPS.groups.includes(type) || type.startsWith('group_')) {
    return 'groups';
  }

  if (
    TYPE_GROUPS.conferences.includes(type) ||
    type.startsWith('conference_') ||
    type.startsWith('room_')
  ) {
    return 'conferences';
  }

  return 'other';
};

export const Notifications = () => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const {
    notifications,
    isLoading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    getNotificationLink,
    getNotificationIcon,
    formatTime,
    forceRefresh,
  } = useNotifications();

  const { pendingInvitations, loadPendingInvitations } = useInvitations();

  const refreshPageData = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        forceRefresh(),
        loadPendingInvitations(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      refreshPageData();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleSync = () => {
      refreshPageData();
    };

    window.addEventListener('notifications:sync', handleSync);
    return () => window.removeEventListener('notifications:sync', handleSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') {
      return notifications.filter((notification) =>
        !notification.is_read &&
        notification.type !== 'group_invitation'
      );
    }

    if (activeFilter === 'invitations') {
      return [];
    }

    if (activeFilter === 'all') {
      return notifications;
    }

    return notifications.filter((notification) =>
      getNotificationGroup(notification.type) === activeFilter
    );
  }, [notifications, activeFilter]);

  const counters = useMemo(() => {
    const taskNotifications = notifications.filter((notification) =>
      getNotificationGroup(notification.type) === 'tasks'
    ).length;

    const projectNotifications = notifications.filter((notification) =>
      getNotificationGroup(notification.type) === 'projects'
    ).length;

    const groupNotifications = notifications.filter((notification) =>
      getNotificationGroup(notification.type) === 'groups'
    ).length;

    const conferenceNotifications = notifications.filter((notification) =>
      getNotificationGroup(notification.type) === 'conferences'
    ).length;

    return {
      totalRegular: notifications.length,
      unreadRegular: unreadCount,
      invitations: pendingInvitations.length,
      tasks: taskNotifications,
      projects: projectNotifications,
      groups: groupNotifications,
      conferences: conferenceNotifications,
      totalUnread: unreadCount + pendingInvitations.length,
    };
  }, [notifications, pendingInvitations.length, unreadCount]);

  const filterCounts = {
    all: counters.totalRegular + counters.invitations,
    unread: counters.totalUnread,
    invitations: counters.invitations,
    tasks: counters.tasks,
    projects: counters.projects,
    groups: counters.groups,
    conferences: counters.conferences,
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read && notification.type !== 'group_invitation') {
      await markAsRead(notification.id);
      await forceRefresh();
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    await forceRefresh();
  };

  const handleInvitationProcessed = async () => {
    await Promise.all([
      loadPendingInvitations(),
      forceRefresh(),
    ]);
  };

  const getPriorityClass = (priority) => {
    const classes = {
      low: styles.priorityLow,
      medium: styles.priorityMedium,
      high: styles.priorityHigh,
      urgent: styles.priorityUrgent,
    };

    return classes[priority] || '';
  };

  const NotificationTypeIcon = ({ type, size = 22 }) => {
    const Icon = getNotificationIcon(type);

    return (
      <Icon
        size={size}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  };

  const shouldShowInvitations =
    ['all', 'unread', 'invitations'].includes(activeFilter) &&
    pendingInvitations.length > 0;

  const shouldShowRegularNotifications = activeFilter !== 'invitations';

  const shouldShowEmpty =
    activeFilter === 'invitations'
      ? pendingInvitations.length === 0
      : activeFilter === 'all' || activeFilter === 'unread'
        ? pendingInvitations.length === 0 && filteredNotifications.length === 0
        : filteredNotifications.length === 0;

  const isInitialLoading =
    isLoading &&
    notifications.length === 0 &&
    pendingInvitations.length === 0;

  if (isInitialLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка уведомлений...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>Уведомления</h1>

          <p className={styles.subtitle}>
            Следите за приглашениями, изменениями задач, проектов, групп и рабочих созвонов.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Button
            variant="secondary"
            size="medium"
            onClick={refreshPageData}
            disabled={refreshing}
          >
            <RefreshCw size={17} strokeWidth={2} aria-hidden="true" />
            {refreshing ? 'Обновление...' : 'Обновить'}
          </Button>

          {counters.unreadRegular > 0 && (
            <Button
              variant="primary"
              size="medium"
              onClick={handleMarkAllAsRead}
            >
              <CheckCheck size={17} strokeWidth={2} aria-hidden="true" />
              Отметить прочитанными
            </Button>
          )}
        </div>
      </section>

      <section className={styles.statsGrid} aria-label="Сводка уведомлений">
        <article className={styles.statCard}>
          <span className={styles.statValue}>{counters.totalRegular}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(counters.totalRegular, NOTIFICATION_FORMS)} всего
          </span>
        </article>

        <article className={`${styles.statCard} ${counters.unreadRegular > 0 ? styles.warningCard : ''}`}>
          <span className={styles.statValue}>{counters.unreadRegular}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(counters.unreadRegular, [
              'непрочитанное',
              'непрочитанных',
              'непрочитанных',
            ])}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{counters.invitations}</span>
          <span className={styles.statLabel}>
            {getRussianPluralForm(counters.invitations, INVITATION_FORMS)}
          </span>
        </article>

        <article className={styles.statCard}>
          <span className={styles.statValue}>{counters.totalUnread}</span>
          <span className={styles.statLabel}>требует внимания</span>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.filters}>
          {FILTERS.map((filter) => {
            const count = filterCounts[filter.key] || 0;

            return (
              <button
                key={filter.key}
                type="button"
                className={`${styles.filterButton} ${
                  activeFilter === filter.key ? styles.active : ''
                }`}
                onClick={() => setActiveFilter(filter.key)}
              >
                {filter.label}

                {count > 0 && (
                  <span className={styles.filterCount}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.panelBody}>
          {shouldShowInvitations && (
            <section className={styles.invitationsSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Приглашения</h2>
                  <p className={styles.sectionSubtitle}>
                    Приглашения в группы, ожидающие вашего ответа.
                  </p>
                </div>

                <span className={styles.sectionCounter}>
                  {formatRussianCount(pendingInvitations.length, INVITATION_FORMS)}
                </span>
              </div>

              <div className={styles.invitationsList}>
                {pendingInvitations.map((invitation) => (
                  <InvitationNotification
                    key={invitation.id}
                    invitation={invitation}
                    onProcessed={handleInvitationProcessed}
                  />
                ))}
              </div>
            </section>
          )}

          {shouldShowRegularNotifications && filteredNotifications.length > 0 && (
            <section className={styles.notificationsSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>События</h2>
                  <p className={styles.sectionSubtitle}>
                    {activeFilter === 'all'
                      ? 'Все системные уведомления без учёта приглашений.'
                      : `Найдено: ${formatRussianCount(filteredNotifications.length, NOTIFICATION_FORMS)}.`}
                  </p>
                </div>
              </div>

              <div className={styles.notificationsList}>
                {filteredNotifications.map((notification) => {
                  const link = getNotificationLink(notification);

                  const content = (
                    <article
                      className={`${styles.notification} ${
                        !notification.is_read ? styles.unread : ''
                      } ${getPriorityClass(notification.priority)}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={styles.notificationIcon}>
                        <NotificationTypeIcon type={notification.type} />
                      </div>

                      <div className={styles.notificationBody}>
                        <div className={styles.notificationTop}>
                          <h3 className={styles.notificationTitle}>
                            {notification.title}
                          </h3>

                          <time className={styles.notificationTime}>
                            {formatTime(notification.created_at)}
                          </time>
                        </div>

                        <p className={styles.notificationMessage}>
                          {notification.content}
                        </p>
                      </div>

                      {!notification.is_read && (
                        <span
                          className={styles.unreadDot}
                          aria-label="Непрочитанное уведомление"
                        />
                      )}
                    </article>
                  );

                  if (link) {
                    return (
                      <Link
                        key={notification.id}
                        to={link}
                        className={styles.notificationLink}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={notification.id}
                      className={styles.notificationWrapper}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {shouldShowEmpty && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                {activeFilter === 'invitations' ? (
                  <Mail size={46} strokeWidth={1.8} aria-hidden="true" />
                ) : activeFilter === 'all' ? (
                  <BellOff size={46} strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Search size={46} strokeWidth={1.8} aria-hidden="true" />
                )}
              </div>

              <h2>
                {activeFilter === 'invitations'
                  ? 'Нет приглашений'
                  : activeFilter === 'all'
                    ? 'Нет уведомлений'
                    : 'Ничего не найдено'}
              </h2>

              <p>
                {activeFilter === 'invitations'
                  ? 'Ожидающие приглашения в группы появятся в этом разделе.'
                  : activeFilter === 'all'
                    ? 'Уведомления появятся здесь после важных событий в проектах, группах и задачах.'
                    : 'Попробуйте выбрать другой фильтр или обновить страницу.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};