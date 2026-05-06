import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, CircleX, Info, X } from 'lucide-react';
import styles from './Notification.module.css';

const TOAST_ICONS = {
  success: CheckCircle2,
  error: CircleX,
  warning: AlertTriangle,
  info: Info,
};

export const Notification = ({
  message,
  type = 'info',
  onClose,
  duration = 5000,
  isVisible = false,
  onClick,
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

  const Icon = TOAST_ICONS[type] || Info;

  const getTypeClass = () => {
    switch (type) {
      case 'success':
        return styles.success;
      case 'error':
        return styles.error;
      case 'warning':
        return styles.warning;
      case 'info':
        return styles.info;
      default:
        return styles.info;
    }
  };

  return (
    <div
      className={`${styles.notification} ${getTypeClass()} ${styles.show}`}
      onClick={onClick}
      role="alert"
    >
      <div className={styles.content}>
        <div className={styles.icon}>
          <Icon size={18} strokeWidth={2} aria-hidden="true" />
        </div>

        <span className={styles.message}>{message}</span>
      </div>

      <button
        className={styles.closeButton}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Закрыть уведомление"
        type="button"
      >
        <X size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
};