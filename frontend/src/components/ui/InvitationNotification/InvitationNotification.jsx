import React, { useState } from 'react';
import {
  Clock3,
  MailCheck,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
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

    if (diff < 0) return 'истекло';
    if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч`;

    return `${Math.floor(diff / 86400000)} дн`;
  };

  const roleLabel = invitation.role === 'admin'
    ? 'Администратор'
    : 'Участник';

  return (
    <article className={styles.container}>
      <div className={styles.icon}>
        <MailCheck size={20} strokeWidth={2} aria-hidden="true" />
      </div>

      <div className={styles.content}>
        <div className={styles.header}>
          <h4 className={styles.title}>
            {invitation.group_name}
          </h4>

          <span className={styles.badge}>Приглашение</span>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <UserRound size={15} strokeWidth={2} aria-hidden="true" />
            <span>
              От: <strong>{invitation.invited_by}</strong>
            </span>
          </div>

          <div className={styles.metaItem}>
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
            <span>
              Роль: <strong>{roleLabel}</strong>
            </span>
          </div>

          <div className={styles.metaItem}>
            <Clock3 size={15} strokeWidth={2} aria-hidden="true" />
            <span>
              Действует: <strong>{formatExpiresAt(invitation.expires_at)}</strong>
            </span>
          </div>
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
            <X size={15} strokeWidth={2} aria-hidden="true" />
            Отклонить
          </Button>
        </div>
      </div>
    </article>
  );
};