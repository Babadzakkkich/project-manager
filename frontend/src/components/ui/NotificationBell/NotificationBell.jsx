import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../../hooks/useNotifications';
import { useInvitations } from '../../../hooks/useInvitations';
import { InvitationNotification } from '../InvitationNotification/InvitationNotification';
import notificationSvg from '../../../assets/notifications/notification.svg';
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
    forceRefresh
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

  const handleNotificationClick = async (notification) => {
    // Если это приглашение, не отмечаем как прочитанное при клике
    // так как оно будет обработано отдельно
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
      urgent: styles.priorityUrgent
    };
    return classes[priority] || '';
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60 * 1000) return 'только что';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const renderNotificationContent = (notification) => {
    const link = getNotificationLink(notification);
    const content = (
      <div className={`${styles.notification} ${!notification.is_read ? styles.unread : ''} ${getPriorityClass(notification.priority)}`}>
        <div className={styles.icon}>
          {getNotificationIcon(notification.type)}
        </div>
        <div className={styles.content}>
          <div className={styles.title}>{notification.title}</div>
          <div className={styles.message}>{notification.content}</div>
          <div className={styles.time}>{getTimeAgo(notification.created_at)}</div>
        </div>
        {!notification.is_read && <div className={styles.unreadDot} />}
      </div>
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
      <div
        key={notification.id}
        className={styles.notificationWrapper}
        onClick={() => handleNotificationClick(notification)}
      >
        {content}
      </div>
    );
  };

  const hasUnread = unreadCount > 0;
  const hasInvitations = pendingInvitations.length > 0 && showInvitations;

  return (
    <div className={styles.bellContainer}>
      <button 
        ref={buttonRef}
        className={styles.bellButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Уведомления"
        aria-expanded={isOpen}
      >
        <img 
          src={notificationSvg} 
          alt="Уведомления" 
          className={styles.bellIcon}
        />
        {(hasUnread || hasInvitations) && (
          <span className={styles.badge}>
            {(unreadCount + (hasInvitations ? pendingInvitations.length : 0)) > 99 ? '99+' : (unreadCount + (hasInvitations ? pendingInvitations.length : 0))}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.header}>
            <h3 className={styles.title}>Уведомления</h3>
            <div className={styles.headerActions}>
              {hasUnread && (
                <button 
                  className={styles.markAllReadButton}
                  onClick={handleMarkAllAsRead}
                >
                  Все прочитано
                </button>
              )}
              {hasInvitations && (
                <button 
                  className={styles.hideInvitationsButton}
                  onClick={() => setShowInvitations(false)}
                >
                  Скрыть приглашения
                </button>
              )}
            </div>
          </div>
          
          <div className={styles.list}>
            {hasInvitations && (
              <div className={styles.invitationsSection}>
                <div className={styles.sectionTitle}>
                  Приглашения ({pendingInvitations.length})
                </div>
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
            )}
            
            {isLoading && notifications.length === 0 && !hasInvitations ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Загрузка уведомлений...</p>
              </div>
            ) : notifications.length === 0 && !hasInvitations ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>🔕</span>
                <p>Нет уведомлений</p>
              </div>
            ) : (
              notifications
                .filter(n => n.type !== 'group_invitation') // Исключаем приглашения из списка уведомлений
                .slice(0, 10)
                .map(notification => renderNotificationContent(notification))
            )}
          </div>
          
          {(notifications.filter(n => n.type !== 'group_invitation').length > 0 || hasInvitations) && (
            <div className={styles.footer}>
              <Link to="/notifications" className={styles.viewAllLink} onClick={() => setIsOpen(false)}>
                Посмотреть все
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};