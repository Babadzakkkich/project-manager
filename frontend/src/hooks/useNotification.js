import { useState, useCallback} from 'react';

export const useNotification = () => {
  const [notification, setNotification] = useState({
    message: '',
    type: 'info',
    isVisible: false
  });

  const showNotification = useCallback((message, type = 'info', duration = 5000) => {
    setNotification({
      message,
      type,
      isVisible: true,
      duration
    });
    
    // Автоматическое скрытие
    if (duration > 0) {
      setTimeout(() => {
        setNotification(prev => ({
          ...prev,
          isVisible: false
        }));
      }, duration);
    }
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({
      ...prev,
      isVisible: false
    }));
  }, []);

  const showSuccess = useCallback((message, duration) => {
    showNotification(message, 'success', duration);
  }, [showNotification]);

  const showError = useCallback((message, duration) => {
    showNotification(message, 'error', duration);
  }, [showNotification]);

  const showWarning = useCallback((message, duration) => {
    showNotification(message, 'warning', duration);
  }, [showNotification]);

  const showInfo = useCallback((message, duration) => {
    showNotification(message, 'info', duration);
  }, [showNotification]);

  return {
    notification,
    showNotification,
    hideNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};