import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BellOff, Search } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useInvitations } from '../../hooks/useInvitations';
import { InvitationNotification } from '../../components/ui/InvitationNotification/InvitationNotification';
import { Button } from '../../components/ui/Button';
import styles from './Notifications.module.css';

export const Notifications = () => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [filteredNotifications, setFilteredNotifications] = useState([]);

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

  useEffect(() => {
    forceRefresh();
    loadPendingInvitations();
  }, [forceRefresh, loadPendingInvitations]);

  useEffect(() => {
    const handleFocus = () => {
      forceRefresh();
      loadPendingInvitations();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [forceRefresh, loadPendingInvitations]);

  useEffect(() => {
    const handleSync = () => {
      forceRefresh();
      loadPendingInvitations();
    };

    window.addEventListener('notifications:sync', handleSync);
    return () => window.removeEventListener('notifications:sync', handleSync);
  }, [forceRefresh, loadPendingInvitations]);

  useEffect(() => {
    let filtered = notifications;

    if (activeFilter === 'unread') {
      filtered = notifications.filter(
        notification =>
          !notification.is_read &&
          notification.type !== 'group_invitation'
      );
    } else if (activeFilter === 'invitations') {
      filtered = [];
    } else if (activeFilter !== 'all') {
      filtered = notifications.filter(
        notification => notification.type === activeFilter
      );
    }

    setFilteredNotifications(filtered);
  }, [notifications, activeFilter]);

  const filters = [
    { key: 'all', label: 'Все' },
    { key: 'unread', label: 'Непрочитанные' },
    { key: 'invitations', label: 'Приглашения' },
    { key: 'task_created', label: 'Задачи' },
    { key: 'task_status_changed', label: 'Статусы' },
    { key: 'user_assigned_to_task', label: 'Назначения' },
    { key: 'group_created', label: 'Группы' },
    { key: 'project_created', label: 'Проекты' },
  ];

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

  const getPriorityClass = (priority) => {
    const classes = {
      low: styles.priorityLow,
      medium: styles.priorityMedium,
      high: styles.priorityHigh,
      urgent: styles.priorityUrgent,
    };

    return classes[priority] || '';
  };

  const NotificationTypeIcon = ({ type, size = 24 }) => {
    const Icon = getNotificationIcon(type);

    return (
      <Icon
        size={size}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  };

  const pendingInvitationsCount = pendingInvitations.length;
  const totalUnreadCount = unreadCount + pendingInvitationsCount;
  const hasRegularUnread = unreadCount > 0;

  if (isLoading && notifications.length === 0 && pendingInvitations.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка уведомлений...</p>
      </div>
    );
  }

  const shouldShowInvitations =
    (activeFilter === 'all' ||
      activeFilter === 'invitations' ||
      activeFilter === 'unread') &&
    pendingInvitations.length > 0;

  const shouldShowRegularNotifications = activeFilter !== 'invitations';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Уведомления</h1>

          {hasRegularUnread && (
            <Button
              variant="secondary"
              size="medium"
              onClick={handleMarkAllAsRead}
            >
              Отметить все как прочитанные ({unreadCount})
            </Button>
          )}
        </div>

        <div className={styles.filters}>
          {filters.map(filter => (
            <button
              key={filter.key}
              className={`${styles.filterButton} ${
                activeFilter === filter.key ? styles.active : ''
              }`}
              onClick={() => setActiveFilter(filter.key)}
              type="button"
            >
              {filter.label}

              {filter.key === 'unread' && totalUnreadCount > 0 && (
                <span className={styles.filterCount}>
                  {totalUnreadCount}
                </span>
              )}

              {filter.key === 'invitations' && pendingInvitationsCount > 0 && (
                <span className={styles.filterCount}>
                  {pendingInvitationsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {shouldShowInvitations && (
          <div className={styles.invitationsSection}>
            <h2 className={styles.sectionTitle}>
              Приглашения {pendingInvitationsCount > 0 && `(${pendingInvitationsCount})`}
            </h2>

            <div className={styles.invitationsList}>
              {pendingInvitations.map(invitation => (
                <InvitationNotification
                  key={invitation.id}
                  invitation={invitation}
                  onProcessed={() => {
                    loadPendingInvitations();
                    forceRefresh();
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {shouldShowRegularNotifications && (
          <>
            {filteredNotifications.length === 0 && pendingInvitations.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <BellOff size={48} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <h3>Нет уведомлений</h3>
                <p>
                  У вас пока нет уведомлений. Они появятся здесь, когда произойдут важные события.
                </p>
              </div>
            ) : filteredNotifications.length === 0 && activeFilter !== 'all' ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Search size={48} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <h3>Нет уведомлений</h3>
                <p>Попробуйте изменить параметры фильтрации</p>
              </div>
            ) : filteredNotifications.length > 0 ? (
              <div className={styles.notificationsList}>
                {filteredNotifications.map(notification => {
                  const link = getNotificationLink(notification);

                  const content = (
                    <div
                      className={`${styles.notification} ${
                        !notification.is_read ? styles.unread : ''
                      } ${getPriorityClass(notification.priority)}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={styles.icon}>
                        <NotificationTypeIcon type={notification.type} />
                      </div>

                      <div className={styles.content}>
                        <div className={styles.headerRow}>
                          <div className={styles.title}>
                            {notification.title}
                          </div>
                          <div className={styles.time}>
                            {formatTime(notification.created_at)}
                          </div>
                        </div>

                        <div className={styles.message}>
                          {notification.content}
                        </div>
                      </div>

                      {!notification.is_read && (
                        <div className={styles.unreadDot} />
                      )}
                    </div>
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
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};