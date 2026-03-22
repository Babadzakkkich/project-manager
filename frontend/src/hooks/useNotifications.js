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

  // Загрузка истории уведомлений
  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await notificationsAPI.getNotifications({ limit: 50 });
      setNotifications(response.items || []);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Обновление количества непрочитанных
  const refreshUnreadCount = useCallback(async () => {
    try {
      const response = await notificationsAPI.getUnreadCount();
      setUnreadCount(response.count || 0);
    } catch (error) {
      console.error('Failed to get unread count:', error);
    }
  }, []);

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
        if (data.id) {
          setNotifications(prev => [data, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          showToastNotification(data);
        }
        
        // Обновление количества после прочтения
        if (data.type === 'marked_read' || data.type === 'marked_all_read') {
          // Полностью перезагружаем уведомления и счетчик
          loadNotifications();
          refreshUnreadCount();
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
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connectWebSocket();
        }, 5000 * reconnectAttempts.current);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [loadNotifications, refreshUnreadCount]);

  const showToastNotification = (notification) => {
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
      
      // Обновляем локальное состояние
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      
      // Пересчитываем количество непрочитанных
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Отправляем через WebSocket, чтобы синхронизировать другие вкладки
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: 'mark_read',
          notification_id: notificationId
        }));
      }
      
      // Также обновляем счетчик через API для синхронизации
      await refreshUnreadCount();
      
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [refreshUnreadCount]);

  // Отметить все как прочитанные
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await notificationsAPI.markAllAsRead();
      
      // Обновляем локальное состояние
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
      
      // Отправляем через WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'mark_all_read' }));
      }
      
      // Обновляем счетчик через API
      await refreshUnreadCount();
      
      return response.count;
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      return 0;
    }
  }, [refreshUnreadCount]);

  // Получить ссылку для уведомления
  const getNotificationLink = useCallback((notification) => {
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
      task_overdue: '⚠️'
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

  // Инициализация
  useEffect(() => {
    loadNotifications();
    refreshUnreadCount();
    connectWebSocket();
    
    return () => {
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
  }, [loadNotifications, refreshUnreadCount, connectWebSocket]);

  // Добавляем эффект для синхронизации при фокусе окна
  useEffect(() => {
    const handleFocus = () => {
      // При возвращении на вкладку обновляем данные
      refreshUnreadCount();
      loadNotifications();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshUnreadCount, loadNotifications]);

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
    loadNotifications
  };
};