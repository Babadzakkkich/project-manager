import React from 'react';
import { useInvitations } from '../../hooks/useInvitations';
import { InvitationNotification } from '../../components/ui/InvitationNotification/InvitationNotification';
import { Button } from '../../components/ui/Button';
import styles from './Invitations.module.css';

export const Invitations = () => {
  const { pendingInvitations, loading, loadPendingInvitations } = useInvitations();

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка приглашений...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Приглашения</h1>
        <p className={styles.subtitle}>
          Приглашения в группы, ожидающие вашего ответа
        </p>
        <Button 
          variant="secondary" 
          size="small"
          onClick={loadPendingInvitations}
        >
          Обновить
        </Button>
      </div>

      {pendingInvitations.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📧</div>
          <h3>Нет приглашений</h3>
          <p>У вас пока нет приглашений в группы. Они появятся здесь, когда кто-то пригласит вас.</p>
        </div>
      ) : (
        <div className={styles.invitationsList}>
          {pendingInvitations.map(invitation => (
            <InvitationNotification
              key={invitation.id}
              invitation={invitation}
              onProcessed={loadPendingInvitations}
            />
          ))}
        </div>
      )}
    </div>
  );
};