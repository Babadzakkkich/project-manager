import React from 'react';
import { Button } from '../Button';
import styles from './ConfirmationModal.module.css';

export const ConfirmationModal = ({
  isOpen = false,
  onClose,
  onConfirm,
  title = "Подтверждение действия",
  message = "Вы уверены, что хотите выполнить это действие?",
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  variant = "danger",
  isLoading = false
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getVariantClass = () => {
    const variantClasses = {
      danger: styles.danger,
      warning: styles.warning,
      info: styles.info
    };
    return variantClasses[variant] || styles.danger;
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={`${styles.header} ${getVariantClass()}`}>
          <h2 className={styles.title}>{title}</h2>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.icon}>
            {variant === 'danger' && '⚠️'}
            {variant === 'warning' && '⚠️'}
            {variant === 'info' && 'ℹ️'}
          </div>
          <p className={styles.message}>{message}</p>
        </div>
        
        <div className={styles.footer}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};