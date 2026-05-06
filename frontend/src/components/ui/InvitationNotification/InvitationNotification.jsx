import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { useInvitations } from '../../../hooks/useInvitations';
import { Button } from '../Button';
import styles from './InvitationNotification.module.css';

export const InvitationNotification = ({ invitation, onProcessed }) => {
  const [processing, setProcessing] = useState(false);
  const { acceptInvitation, declineInvitation } = useInvitations();

  const handleAccept = async () => {
    setProcessing(true);
    const success = await acceptInvitation(invitation.token, invitation.group_name);
    setProcessing(false);

    if (success && onProcessed) {
      onProcessed();
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    const success = await declineInvitation(invitation.token);
    setProcessing(false);

    if (success && onProcessed) {
      onProcessed();
    }
  };

  const formatExpiresAt = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date - now;

    if (diff < 0) return 'Истекло';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч`;

    return `${Math.floor(diff / 86400000)} дн`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.icon}>
        <Mail size={24} strokeWidth={2} aria-hidden="true" />
      </div>

      <div className={styles.content}>
        <div className={styles.title}>
          Приглашение в группу "{invitation.group_name}"
        </div>

        <div className={styles.message}>
          Пользователь <strong>{invitation.invited_by}</strong> приглашает вас в группу "{invitation.group_name}" в роли{' '}
          <strong>{invitation.role === 'admin' ? 'администратора' : 'участника'}</strong>.
        </div>

        <div className={styles.expires}>
          Действует: {formatExpiresAt(invitation.expires_at)}
        </div>

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="small"
            onClick={handleAccept}
            loading={processing}
            disabled={processing}
          >
            Принять
          </Button>

          <Button
            variant="secondary"
            size="small"
            onClick={handleDecline}
            loading={processing}
            disabled={processing}
          >
            Отклонить
          </Button>
        </div>
      </div>
    </div>
  );
};