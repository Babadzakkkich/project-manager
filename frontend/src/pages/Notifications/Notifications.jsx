import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
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
    forceRefresh
  } = useNotifications();

  // Загружаем данные при монтировании и при возвращении на страницу
  useEffect(() => {
    forceRefresh();
  }, [forceRefresh]);

  // Обновляем данные при фокусе окна
  useEffect(() => {
    const handleFocus = () => {
      forceRefresh();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [forceRefresh]);

  // Слушаем событие синхронизации
  useEffect(() => {
    const handleSync = () => {
      forceRefresh();
    };
    
    window.addEventListener('notifications:sync', handleSync);
    return () => window.removeEventListener('notifications:sync', handleSync);
  }, [forceRefresh]);

  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredNotifications(notifications);
    } else if (activeFilter === 'unread') {
      setFilteredNotifications(notifications.filter(n => !n.is_read));
    } else {
      setFilteredNotifications(notifications.filter(n => n.type === activeFilter));
    }
  }, [notifications, activeFilter]);

  const filters = [
    { key: 'all', label: 'Все' },
    { key: 'unread', label: 'Непрочитанные' },
    { key: 'task_created', label: 'Задачи' },
    { key: 'task_status_changed', label: 'Статусы' },
    { key: 'user_assigned_to_task', label: 'Назначения' },
    { key: 'group_created', label: 'Группы' },
    { key: 'project_created', label: 'Проекты' }
  ];

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
      // После отметки принудительно синхронизируем
      forceRefresh();
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    // После отметки всех принудительно синхронизируем
    forceRefresh();
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

  if (isLoading && notifications.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка уведомлений...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Уведомления</h1>
          {unreadCount > 0 && (
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
              className={`${styles.filterButton} ${activeFilter === filter.key ? styles.active : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
              {filter.key === 'unread' && unreadCount > 0 && (
                <span className={styles.filterCount}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {filteredNotifications.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔕</div>
            <h3>Нет уведомлений</h3>
            <p>У вас пока нет уведомлений. Они появятся здесь, когда произойдут важные события.</p>
          </div>
        ) : (
          <div className={styles.notificationsList}>
            {filteredNotifications.map(notification => {
              const link = getNotificationLink(notification);
              const content = (
                <div 
                  className={`${styles.notification} ${!notification.is_read ? styles.unread : ''} ${getPriorityClass(notification.priority)}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.icon}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className={styles.content}>
                    <div className={styles.headerRow}>
                      <div className={styles.title}>{notification.title}</div>
                      <div className={styles.time}>{formatTime(notification.created_at)}</div>
                    </div>
                    <div className={styles.message}>{notification.content}</div>
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
                  >
                    {content}
                  </Link>
                );
              }
              
              return (
                <div key={notification.id} className={styles.notificationWrapper}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};