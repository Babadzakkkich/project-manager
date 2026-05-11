import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '../Button';
import styles from './ConfirmationModal.module.css';

const MODAL_ICONS = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

export const ConfirmationModal = ({
  isOpen = false,
  onClose,
  onConfirm,
  title = 'Подтверждение действия',
  message = 'Вы уверены, что хотите выполнить это действие?',
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'danger',
  isLoading = false,
  showIcon = true,
}) => {
  if (!isOpen) return null;

  const Icon = MODAL_ICONS[variant] || AlertTriangle;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getVariantClass = () => {
    const variantClasses = {
      danger: styles.danger,
      warning: styles.warning,
      info: styles.info,
      success: styles.success,
    };

    return variantClasses[variant] || styles.danger;
  };

  const confirmVariant = variant === 'danger' ? 'danger' : 'primary';

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className={`${styles.modal} ${getVariantClass()}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
      >
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            {showIcon && (
              <div className={styles.icon}>
                <Icon size={22} strokeWidth={2} aria-hidden="true" />
              </div>
            )}

            <h2 id="confirmation-modal-title" className={styles.title}>
              {title}
            </h2>
          </div>

          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
            type="button"
            disabled={isLoading}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.content}>
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
            variant={confirmVariant}
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