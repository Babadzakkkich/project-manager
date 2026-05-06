import React from 'react';
import { Button } from '../Button';
import {
  CONFERENCE_ICONS,
  renderIconComponent,
} from '../../../utils/icons';
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

  const ParticipantStatusIcons = ({ participant }) => {
    return (
      <>
        {!participant.isMicrophoneEnabled && (
          <span title="Микрофон выключен">
            {renderIconComponent(CONFERENCE_ICONS.MIC_OFF, { size: 16 })}
          </span>
        )}
        {!participant.isCameraEnabled && (
          <span title="Камера выключена">
            {renderIconComponent(CONFERENCE_ICONS.CAMERA_OFF, { size: 16 })}
          </span>
        )}
      </>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Участники ({participants.length})</h3>
        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
          aria-label="Закрыть список участников"
        >
          {renderIconComponent(CONFERENCE_ICONS.CLOSE, { size: 22 })}
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
              <ParticipantStatusIcons participant={localParticipant} />
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
                <ParticipantStatusIcons participant={participant} />
              </div>
              {isModerator && (
                <div className={styles.modControls}>
                  <Button 
                    variant="secondary" 
                    size="small"
                    onClick={() => onMuteParticipant(participant.identity)}
                    title="Отключить микрофон"
                  >
                    {renderIconComponent(CONFERENCE_ICONS.MUTE, { size: 16 })}
                  </Button>
                  <Button 
                    variant="danger" 
                    size="small"
                    onClick={() => onKickParticipant(participant.identity)}
                    title="Удалить участника"
                  >
                    {renderIconComponent(CONFERENCE_ICONS.KICK, { size: 16 })}
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
