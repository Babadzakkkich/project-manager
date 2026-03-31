import React, { useEffect } from 'react';
import styles from './Notification.module.css';

export const Notification = ({ 
  message, 
  type = 'info',
  onClose,
  duration = 5000,
  isVisible = false,
  onClick // Добавляем возможность клика по уведомлению
}) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible || !message) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  };

  const getTypeClass = () => {
    switch (type) {
      case 'success': return styles.success;
      case 'error': return styles.error;
      case 'warning': return styles.warning;
      case 'info': return styles.info;
      default: return styles.info;
    }
  };

  return (
    <div 
      className={`${styles.notification} ${getTypeClass()} ${styles.show}`}
      onClick={onClick}
      role="alert"
    >
      <div className={styles.content}>
        <div className={styles.icon}>{getIcon()}</div>
        <span className={styles.message}>{message}</span>
      </div>
      <button 
        className={styles.closeButton}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Закрыть уведомление"
      >
        ×
      </button>
    </div>
  );
};