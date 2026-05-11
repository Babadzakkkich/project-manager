import React, { useMemo } from 'react';
import {
  Crown,
  Mic,
  MicOff,
  ScreenShare,
  UserMinus,
  Users,
  Video,
  VideoOff,
  VolumeX,
  X,
} from 'lucide-react';

import styles from './ParticipantsPanel.module.css';

const getParticipantName = (participant) => {
  return participant?.name || participant?.identity || 'Участник';
};

const getParticipantInitial = (participant) => {
  return getParticipantName(participant).charAt(0).toUpperCase();
};

const getAudioEnabled = (participant) => {
  if (typeof participant?.isMicrophoneEnabled === 'boolean') {
    return participant.isMicrophoneEnabled;
  }

  if (typeof participant?.isAudioEnabled === 'boolean') {
    return participant.isAudioEnabled;
  }

  return true;
};

const getCameraEnabled = (participant) => {
  if (typeof participant?.isCameraEnabled === 'boolean') {
    return participant.isCameraEnabled;
  }

  if (typeof participant?.isVideoEnabled === 'boolean') {
    return participant.isVideoEnabled;
  }

  return true;
};

const getScreenSharing = (participant) => {
  return Boolean(participant?.isScreenShareEnabled || participant?.isScreenSharing);
};

const ParticipantStatus = ({ participant }) => {
  const audioEnabled = getAudioEnabled(participant);
  const cameraEnabled = getCameraEnabled(participant);
  const screenSharing = getScreenSharing(participant);

  return (
    <div className={styles.statusList}>
      <span
        className={`${styles.statusPill} ${audioEnabled ? styles.statusOn : styles.statusOff}`}
        title={audioEnabled ? 'Микрофон включён' : 'Микрофон выключен'}
      >
        {audioEnabled ? (
          <Mic size={13} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <MicOff size={13} strokeWidth={2.2} aria-hidden="true" />
        )}
        {audioEnabled ? 'Звук' : 'Без звука'}
      </span>

      <span
        className={`${styles.statusPill} ${cameraEnabled ? styles.statusOn : styles.statusOff}`}
        title={cameraEnabled ? 'Камера включена' : 'Камера выключена'}
      >
        {cameraEnabled ? (
          <Video size={13} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <VideoOff size={13} strokeWidth={2.2} aria-hidden="true" />
        )}
        {cameraEnabled ? 'Камера' : 'Камера выкл.'}
      </span>

      {screenSharing && (
        <span
          className={`${styles.statusPill} ${styles.statusScreen}`}
          title="Демонстрация экрана"
        >
          <ScreenShare size={13} strokeWidth={2.2} aria-hidden="true" />
          Экран
        </span>
      )}
    </div>
  );
};

const ParticipantItem = ({
  participant,
  isLocal,
  canModerate,
  onMuteParticipant,
  onKickParticipant,
}) => {
  const name = getParticipantName(participant);
  const isSpeaking = Boolean(participant?.isSpeaking);

  const handleMute = () => {
    if (!canModerate) return;
    onMuteParticipant?.(participant.identity);
  };

  const handleKick = () => {
    if (!canModerate) return;
    onKickParticipant?.(participant.identity);
  };

  return (
    <article
      className={`${styles.participant} ${isLocal ? styles.localParticipant : ''} ${
        isSpeaking ? styles.speaking : ''
      }`}
    >
      <div className={styles.avatar}>
        {getParticipantInitial(participant)}
      </div>

      <div className={styles.participantInfo}>
        <div className={styles.nameRow}>
          <span className={styles.name} title={name}>
            {name}
          </span>

          {isLocal && (
            <span className={styles.localBadge}>
              Вы
            </span>
          )}

          {isSpeaking && (
            <span className={styles.speakingBadge}>
              Говорит
            </span>
          )}
        </div>

        <ParticipantStatus participant={participant} />
      </div>

      {canModerate && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleMute}
            title={`Отключить микрофон: ${name}`}
            aria-label={`Отключить микрофон участнику ${name}`}
          >
            <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`${styles.actionButton} ${styles.dangerAction}`}
            onClick={handleKick}
            title={`Удалить из созвона: ${name}`}
            aria-label={`Удалить участника ${name} из созвона`}
          >
            <UserMinus size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
};

export const ParticipantsPanel = ({
  participants,
  localParticipantId,
  isModerator,
  onMuteParticipant,
  onKickParticipant,
  onClose,
}) => {
  const safeParticipants = useMemo(() => {
    return Array.isArray(participants) ? participants : [];
  }, [participants]);

  const localParticipant = useMemo(() => {
    return safeParticipants.find(
      (participant) => participant.identity === localParticipantId
    );
  }, [safeParticipants, localParticipantId]);

  const remoteParticipants = useMemo(() => {
    return safeParticipants
      .filter((participant) => participant.identity !== localParticipantId)
      .sort((a, b) =>
        getParticipantName(a).localeCompare(getParticipantName(b), 'ru-RU')
      );
  }, [safeParticipants, localParticipantId]);

  const speakingCount = safeParticipants.filter((participant) =>
    Boolean(participant?.isSpeaking)
  ).length;

  return (
    <aside className={styles.panel} aria-label="Список участников созвона">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <Users size={15} strokeWidth={2} aria-hidden="true" />
            Участники
          </div>

          <h3 className={styles.title}>
            В созвоне: {safeParticipants.length}
          </h3>
        </div>

        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
          aria-label="Закрыть список участников"
        >
          <X size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{safeParticipants.length}</span>
          <span className={styles.summaryLabel}>Всего</span>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{remoteParticipants.length}</span>
          <span className={styles.summaryLabel}>Другие</span>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{speakingCount}</span>
          <span className={styles.summaryLabel}>Говорят</span>
        </div>
      </div>

      {isModerator && (
        <div className={styles.moderatorNote}>
          <Crown size={15} strokeWidth={2} aria-hidden="true" />
          Вы можете отключать микрофон и удалять участников.
        </div>
      )}

      <div className={styles.list}>
        {safeParticipants.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Users size={34} strokeWidth={1.8} aria-hidden="true" />
            </div>

            <p>Участники ещё не подключились</p>
          </div>
        ) : (
          <>
            {localParticipant && (
              <div className={styles.group}>
                <span className={styles.groupTitle}>Вы</span>

                <ParticipantItem
                  participant={localParticipant}
                  isLocal
                  canModerate={false}
                  onMuteParticipant={onMuteParticipant}
                  onKickParticipant={onKickParticipant}
                />
              </div>
            )}

            {remoteParticipants.length > 0 && (
              <div className={styles.group}>
                <span className={styles.groupTitle}>Остальные участники</span>

                {remoteParticipants.map((participant) => (
                  <ParticipantItem
                    key={participant.identity}
                    participant={participant}
                    isLocal={false}
                    canModerate={isModerator}
                    onMuteParticipant={onMuteParticipant}
                    onKickParticipant={onKickParticipant}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};