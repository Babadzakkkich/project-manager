import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  EyeOff,
  Inbox,
} from 'lucide-react';
import { useNotifications } from '../../../hooks/useNotifications';
import { useInvitations } from '../../../hooks/useInvitations';
import { InvitationNotification } from '../InvitationNotification/InvitationNotification';
import styles from './NotificationBell.module.css';

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    getNotificationLink,
    getNotificationIcon,
    forceRefresh,
  } = useNotifications();

  const { pendingInvitations, loadPendingInvitations } = useInvitations();
  const [showInvitations, setShowInvitations] = useState(true);

  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      forceRefresh();
      loadPendingInvitations();
    }
  }, [isOpen, forceRefresh, loadPendingInvitations]);

  useEffect(() => {
    const handleSync = () => {
      forceRefresh();
      loadPendingInvitations();
    };

    window.addEventListener('notifications:sync', handleSync);
    return () => window.removeEventListener('notifications:sync', handleSync);
  }, [forceRefresh, loadPendingInvitations]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const regularNotifications = notifications.filter(
    notification => notification.type !== 'group_invitation'
  );

  const hasRegularUnread = unreadCount > 0;
  const totalUnreadCount = unreadCount + pendingInvitations.length;
  const hasUnread = totalUnreadCount > 0;
  const hasInvitations = pendingInvitations.length > 0 && showInvitations;
  const hasHiddenInvitations = pendingInvitations.length > 0 && !showInvitations;

  const handleNotificationClick = async (notification) => {
    if (notification.type !== 'group_invitation' && !notification.is_read) {
      await markAsRead(notification.id);
    }

    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const getPriorityClass = (priority) => {
    const classes = {
      low: styles.priorityLow,
      medium: styles.priorityMedium,
      high: styles.priorityHigh,
      urgent: styles.priorityUrgent,
    };

    return classes[priority] || styles.priorityMedium;
  };

  const getPriorityLabel = (priority) => {
    const labels = {
      low: 'Низкий',
      medium: 'Обычный',
      high: 'Высокий',
      urgent: 'Срочно',
    };

    return labels[priority] || 'Обычный';
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) return 'только что';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч`;

    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
  };

  const NotificationTypeIcon = ({ type, size = 18 }) => {
    const Icon = getNotificationIcon(type);

    return (
      <Icon
        size={size}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  };

  const renderNotificationContent = (notification) => {
    const link = getNotificationLink(notification);

    const content = (
      <article
        className={`${styles.notification} ${
          !notification.is_read ? styles.unread : ''
        } ${getPriorityClass(notification.priority)}`}
      >
        <div className={styles.notificationIcon}>
          <NotificationTypeIcon type={notification.type} />
        </div>

        <div className={styles.notificationBody}>
          <div className={styles.notificationTopline}>
            <h4 className={styles.notificationTitle}>{notification.title}</h4>

            {!notification.is_read && (
              <span className={styles.unreadDot} aria-label="Непрочитано" />
            )}
          </div>

          <p className={styles.notificationMessage}>{notification.content}</p>

          <div className={styles.notificationMeta}>
            <span>{getTimeAgo(notification.created_at)}</span>
            <span className={styles.metaDivider} />
            <span>{getPriorityLabel(notification.priority)}</span>
          </div>
        </div>

        {link && (
          <span className={styles.notificationArrow}>
            <ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </article>
    );

    if (link) {
      return (
        <Link
          key={notification.id}
          to={link}
          className={styles.notificationLink}
          onClick={() => handleNotificationClick(notification)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={notification.id}
        type="button"
        className={styles.notificationButton}
        onClick={() => handleNotificationClick(notification)}
      >
        {content}
      </button>
    );
  };

  return (
    <div className={styles.bellContainer}>
      <button
        ref={buttonRef}
        className={`${styles.bellButton} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={hasUnread ? `Уведомления: ${totalUnreadCount}` : 'Уведомления'}
        aria-expanded={isOpen}
        type="button"
      >
        <Bell size={22} strokeWidth={2} aria-hidden="true" />

        {hasUnread && (
          <span className={styles.badge}>
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.header}>
            <div>
              <h3 className={styles.title}>Уведомления</h3>
              <p className={styles.subtitle}>
                События проектов, задач и групп
              </p>
            </div>

            {hasRegularUnread && (
              <button
                className={styles.markAllReadButton}
                onClick={handleMarkAllAsRead}
                type="button"
              >
                <CheckCheck size={16} strokeWidth={2} aria-hidden="true" />
                Прочитать
              </button>
            )}
          </div>

          <div className={styles.list}>
            {hasInvitations && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitleWrap}>
                    <span className={styles.sectionIcon}>
                      <Inbox size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <h4 className={styles.sectionTitle}>Требуют действия</h4>
                    <span className={styles.sectionCounter}>
                      {pendingInvitations.length}
                    </span>
                  </div>

                  <button
                    className={styles.hideInvitationsButton}
                    onClick={() => setShowInvitations(false)}
                    type="button"
                  >
                    <EyeOff size={15} strokeWidth={2} aria-hidden="true" />
                    Скрыть
                  </button>
                </div>

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
              </section>
            )}

            {hasHiddenInvitations && (
              <button
                type="button"
                className={styles.showInvitationsButton}
                onClick={() => setShowInvitations(true)}
              >
                Показать приглашения ({pendingInvitations.length})
              </button>
            )}

            {(regularNotifications.length > 0 || isLoading) && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitleWrap}>
                    <span className={styles.sectionIcon}>
                      <Bell size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <h4 className={styles.sectionTitle}>Последние события</h4>
                  </div>
                </div>

                {isLoading && regularNotifications.length === 0 ? (
                  <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Загрузка уведомлений...</p>
                  </div>
                ) : (
                  <div className={styles.notificationsList}>
                    {regularNotifications
                      .slice(0, 10)
                      .map(notification => renderNotificationContent(notification))}
                  </div>
                )}
              </section>
            )}

            {!isLoading &&
              regularNotifications.length === 0 &&
              !hasInvitations &&
              !hasHiddenInvitations && (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>
                    <BellOff size={42} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h4>Нет уведомлений</h4>
                  <p>Новые события по проектам и задачам появятся здесь.</p>
                </div>
              )}
          </div>

          {(regularNotifications.length > 0 || pendingInvitations.length > 0) && (
            <div className={styles.footer}>
              <Link
                to="/notifications"
                className={styles.viewAllLink}
                onClick={() => setIsOpen(false)}
              >
                Посмотреть все уведомления
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};