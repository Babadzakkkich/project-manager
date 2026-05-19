import React, { useMemo, useState } from 'react';
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

import { FIELD_LIMITS } from '../../../utils/validation';
import styles from './ParticipantsPanel.module.css';

const KICK_REASON_LIMIT = FIELD_LIMITS.CONFERENCE_KICK_REASON;

const getParticipantName = (participant) => {
  return participant?.name || participant?.identity || 'Участник';
};

const getParticipantInitial = (participant) => {
  return getParticipantName(participant).charAt(0).toUpperCase();
};

const getParticipantMetadata = (participant) => {
  if (!participant?.metadata) {
    return {};
  }

  try {
    return JSON.parse(participant.metadata);
  } catch {
    return {};
  }
};

const isParticipantModerator = (participant) => {
  return Boolean(getParticipantMetadata(participant).is_admin);
};

const KICK_DURATION_OPTIONS = [
  { value: 5, label: '5 минут' },
  { value: 15, label: '15 минут' },
  { value: 30, label: '30 минут' },
  { value: 60, label: '1 час' },
  { value: 180, label: '3 часа' },
];

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
  isModeratorParticipant,
  canModerate,
  onMuteParticipant,
  onKickParticipant,
  kickDurationMinutes,
  kickReason,
}) => {
  const name = getParticipantName(participant);
  const isSpeaking = Boolean(participant?.isSpeaking);

  const handleMute = () => {
    if (!canModerate) return;
    onMuteParticipant?.(participant.identity);
  };

  const handleKick = () => {
    if (!canModerate) return;
    onKickParticipant?.(participant.identity, {
      durationMinutes: kickDurationMinutes,
      reason: kickReason?.trim() || null,
    });
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

          {isModeratorParticipant && (
            <span className={styles.moderatorBadge}>
              Модератор
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
            title={`Временно удалить из созвона: ${name}`}
            aria-label={`Временно удалить участника ${name} из созвона`}
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
  const [kickDurationMinutes, setKickDurationMinutes] = useState(15);
  const [kickReason, setKickReason] = useState('');

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


      {isModerator && (
        <div className={styles.moderatorControls}>
          <div className={styles.moderatorNote}>
            <Crown size={15} strokeWidth={2} aria-hidden="true" />
            Вы можете отключать микрофон и временно удалять обычных участников.
          </div>

          <label className={styles.kickDurationField}>
            <span>Блокировка входа</span>
            <select
              value={kickDurationMinutes}
              onChange={(event) => setKickDurationMinutes(Number(event.target.value))}
              className={styles.kickDurationSelect}
            >
              {KICK_DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.kickReasonField}>
            <span>Причина удаления</span>
            <textarea
              value={kickReason}
              onChange={(event) => setKickReason(event.target.value)}
              className={styles.kickReasonInput}
              placeholder="Например: нарушение правил созвона"
              rows={2}
              maxLength={KICK_REASON_LIMIT}
            />

            <span className={styles.reasonCounter}>
              {kickReason.length}/{KICK_REASON_LIMIT}
            </span>
          </label>
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
                  isModeratorParticipant={isParticipantModerator(localParticipant)}
                  canModerate={false}
                  onMuteParticipant={onMuteParticipant}
                  onKickParticipant={onKickParticipant}
                  kickDurationMinutes={kickDurationMinutes}
                  kickReason={kickReason}
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
                    isModeratorParticipant={isParticipantModerator(participant)}
                    canModerate={isModerator && !isParticipantModerator(participant)}
                    onMuteParticipant={onMuteParticipant}
                    onKickParticipant={onKickParticipant}
                    kickDurationMinutes={kickDurationMinutes}
                    kickReason={kickReason}
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