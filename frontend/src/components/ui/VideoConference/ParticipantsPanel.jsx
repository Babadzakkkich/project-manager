import React from 'react';
import { Button } from '../Button';
import styles from './ParticipantsPanel.module.css';

export const ParticipantsPanel = ({
  participants,
  localParticipantId,
  isModerator,
  onMuteParticipant,
  onKickParticipant,
  onClose
}) => {
  const localParticipant = participants.find(p => p.identity === localParticipantId);
  const remoteParticipants = participants.filter(p => p.identity !== localParticipantId);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Участники ({participants.length})</h3>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>
      
      <div className={styles.list}>
        {/* Локальный участник */}
        {localParticipant && (
          <div className={styles.participant}>
            <div className={styles.info}>
              <span className={styles.name}>
                {localParticipant.name || localParticipant.identity} (Вы)
              </span>
            </div>
            <div className={styles.status}>
              {!localParticipant.isMicrophoneEnabled && <span>🔇</span>}
              {!localParticipant.isCameraEnabled && <span>🚫📹</span>}
            </div>
          </div>
        )}
        
        {/* Удаленные участники */}
        {remoteParticipants.map(participant => (
          <div key={participant.identity} className={styles.participant}>
            <div className={styles.info}>
              <span className={styles.name}>
                {participant.name || participant.identity}
              </span>
            </div>
            <div className={styles.actions}>
              <div className={styles.status}>
                {!participant.isMicrophoneEnabled && <span>🔇</span>}
                {!participant.isCameraEnabled && <span>🚫📹</span>}
              </div>
              {isModerator && (
                <div className={styles.modControls}>
                  <Button 
                    variant="secondary" 
                    size="small"
                    onClick={() => onMuteParticipant(participant.identity)}
                    title="Отключить микрофон"
                  >
                    🔇
                  </Button>
                  <Button 
                    variant="danger" 
                    size="small"
                    onClick={() => onKickParticipant(participant.identity)}
                    title="Удалить участника"
                  >
                    🚫
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};