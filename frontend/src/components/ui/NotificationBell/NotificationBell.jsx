import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../../hooks/useNotifications';
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
    refreshUnreadCount,
    loadNotifications
  } = useNotifications();
  
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Обновляем данные при открытии дропдауна
  useEffect(() => {
    if (isOpen) {
      refreshUnreadCount();
      loadNotifications();
    }
  }, [isOpen, refreshUnreadCount, loadNotifications]);

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

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
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
          onClick={() => handleNotificationClick(notification, link)}
        >
          {content}
        </Link>
      );
    }
    
    return (
      <div
        key={notification.id}
        className={styles.notificationWrapper}
        onClick={() => handleNotificationClick(notification, null)}
      >
        {content}
      </div>
    );
  };

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
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.header}>
            <h3 className={styles.title}>Уведомления</h3>
            {unreadCount > 0 && (
              <button 
                className={styles.markAllReadButton}
                onClick={() => {
                  markAllAsRead();
                  refreshUnreadCount();
                }}
              >
                Все прочитано
              </button>
            )}
          </div>
          
          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Загрузка уведомлений...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>🔕</span>
                <p>Нет уведомлений</p>
              </div>
            ) : (
              notifications.slice(0, 10).map(notification => renderNotificationContent(notification))
            )}
          </div>
          
          {notifications.length > 0 && (
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