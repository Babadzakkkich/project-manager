import React, { useEffect } from 'react';
import styles from './Notification.module.css';

export const Notification = ({ 
  message, 
  type = 'info',
  onClose,
  duration = 5000,
  isVisible = false
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

  return (
    <div className={`${styles.notification} ${styles[type]} ${styles.show}`}>
      <div className={styles.content}>
        <div className={styles.icon}>
          {type === 'success' && '✅'}
          {type === 'error' && '❌'}
          {type === 'warning' && '⚠️'}
          {type === 'info' && 'ℹ️'}
        </div>
        <span className={styles.message}>{message}</span>
      </div>
      <button 
        className={styles.closeButton}
        onClick={onClose}
        aria-label="Закрыть уведомление"
      >
        ×
      </button>
    </div>
  );
};