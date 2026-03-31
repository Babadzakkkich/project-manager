import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI } from '../services/api/notifications';
import { NOTIFICATION_TYPES } from '../utils/constants';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isMountedRef = useRef(true);
  const isInitializedRef = useRef(false);
  const updateCounterRef = useRef(0);

  // Загрузка истории уведомлений
  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await notificationsAPI.getNotifications({ limit: 50 });
      
      if (isMountedRef.current) {
        setNotifications(response.items || []);
        setUnreadCount(response.unread_count || 0);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Обновление количества непрочитанных
  const refreshUnreadCount = useCallback(async () => {
    try {
      const response = await notificationsAPI.getUnreadCount();
      if (isMountedRef.current) {
        setUnreadCount(response.count || 0);
      }
    } catch (error) {
      console.error('Failed to get unread count:', error);
    }
  }, []);

  // Принудительное обновление всех данных
  const forceRefresh = useCallback(async () => {
    updateCounterRef.current += 1;
    await Promise.all([
      loadNotifications(),
      refreshUnreadCount()
    ]);
  }, [loadNotifications, refreshUnreadCount]);

  // Проверка, является ли уведомление приглашением
  const isInvitation = useCallback((notification) => {
    return notification.type === NOTIFICATION_TYPES.GROUP_INVITATION;
  }, []);

  // Получить данные приглашения из уведомления
  const getInvitationData = useCallback((notification) => {
    if (!isInvitation(notification)) return null;
    
    return {
      token: notification.data?.invitation_token,
      groupId: notification.data?.group_id,
      groupName: notification.data?.group_name,
      invitedBy: notification.data?.invited_by,
      role: notification.data?.role,
      invitedEmail: notification.data?.invited_email
    };
  }, [isInvitation]);

  // Подключение к WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws`;
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected to notifications');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      
      const pingInterval = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      wsRef.current.pingInterval = pingInterval;
      
      setTimeout(() => {
        if (isMountedRef.current) {
          forceRefresh();
        }
      }, 1000);
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('Connected to notifications server:', data.message);
          return;
        }
        
        if (data.type === 'pong') {
          return;
        }
        
        // Новое уведомление
        if (data.id && data.type !== 'marked_read' && data.type !== 'marked_all_read' && data.type !== 'unread_count') {
          setNotifications(prev => [data, ...prev]);
          setUnreadCount(prev => prev + 1);
          showToastNotification(data);
        }
        
        if (data.type === 'marked_read' || data.type === 'marked_all_read') {
          forceRefresh();
        }
        
        if (data.type === 'unread_count') {
          setUnreadCount(data.count);
        }
        
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      if (wsRef.current?.pingInterval) {
        clearInterval(wsRef.current.pingInterval);
      }
      
      if (reconnectAttempts.current < maxReconnectAttempts && isMountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connectWebSocket();
        }, 5000 * reconnectAttempts.current);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [forceRefresh]);

  const showToastNotification = (notification) => {
    // Если это приглашение, показываем специальное уведомление
    if (notification.type === NOTIFICATION_TYPES.GROUP_INVITATION) {
      const event = new CustomEvent('invitation:show', {
        detail: {
          notification: notification
        }
      });
      window.dispatchEvent(event);
      return;
    }
    
    const event = new CustomEvent('toast:show', {
      detail: {
        message: notification.content,
        type: notification.priority === 'urgent' ? 'warning' : 'info',
        duration: 5000,
        onClick: () => {
          if (notification.data?.task_id) {
            window.location.href = `/tasks/${notification.data.task_id}`;
          } else if (notification.data?.project_id) {
            window.location.href = `/projects/${notification.data.project_id}`;
          } else if (notification.data?.group_id) {
            window.location.href = `/groups/${notification.data.group_id}`;
          }
        }
      }
    });
    window.dispatchEvent(event);
  };

  // Отметить уведомление как прочитанное
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await notificationsAPI.markAsRead(notificationId);
      
      setNotifications(prev => {
        const updated = prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        );
        return updated;
      });
      
      await forceRefresh();
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: 'mark_read',
          notification_id: notificationId
        }));
      }
      
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [forceRefresh]);

  // Отметить все как прочитанные
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsAPI.markAllAsRead();
      
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      
      await forceRefresh();
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'mark_all_read' }));
      }
      
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [forceRefresh]);

  // Получить ссылку для уведомления
  const getNotificationLink = useCallback((notification) => {
    // Для приглашений ссылка ведёт на страницу приглашений
    if (notification.type === NOTIFICATION_TYPES.GROUP_INVITATION) {
      return '/invitations';
    }
    
    if (notification.data?.task_id) {
      return `/tasks/${notification.data.task_id}`;
    }
    if (notification.data?.project_id) {
      return `/projects/${notification.data.project_id}`;
    }
    if (notification.data?.group_id) {
      return `/groups/${notification.data.group_id}`;
    }
    return null;
  }, []);

  // Получить иконку для типа уведомления
  const getNotificationIcon = useCallback((type) => {
    const icons = {
      group_created: '👥',
      group_updated: '✏️',
      group_deleted: '🗑️',
      user_added_to_group: '➕',
      user_removed_from_group: '➖',
      user_role_changed: '🔄',
      project_created: '📁',
      project_updated: '📝',
      project_deleted: '🗑️',
      group_added_to_project: '🔗',
      group_removed_from_project: '🔗',
      task_created: '✅',
      task_updated: '✏️',
      task_deleted: '🗑️',
      task_status_changed: '🔄',
      task_priority_changed: '⚡',
      user_assigned_to_task: '👤',
      user_unassigned_from_task: '👤',
      task_deadline_approaching: '⏰',
      task_overdue: '⚠️',
      group_invitation: '📧',
      group_invitation_accepted: '✅',
      group_invitation_declined: '❌'
    };
    return icons[type] || '🔔';
  }, []);

  // Форматирование времени
  const formatTime = useCallback((dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60 * 1000) return 'только что';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч назад`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (86400000))} дн назад`;
    return date.toLocaleDateString('ru-RU');
  }, []);

  useEffect(() => {
    const handleSync = () => {
      if (isMountedRef.current) {
        forceRefresh();
      }
    };
    
    window.addEventListener('notifications:sync', handleSync);
    return () => window.removeEventListener('notifications:sync', handleSync);
  }, [forceRefresh]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    isMountedRef.current = true;
    
    forceRefresh();
    connectWebSocket();
    
    const handleFocus = () => {
      if (isMountedRef.current) {
        forceRefresh();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('focus', handleFocus);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        if (wsRef.current.pingInterval) {
          clearInterval(wsRef.current.pingInterval);
        }
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, forceRefresh]);

  return {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    markAsRead,
    markAllAsRead,
    getNotificationLink,
    getNotificationIcon,
    formatTime,
    refreshUnreadCount,
    loadNotifications,
    forceRefresh,
    isInvitation,
    getInvitationData
  };
};