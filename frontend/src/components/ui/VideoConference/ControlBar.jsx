import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  SmilePlus,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';

import styles from './ControlBar.module.css';

const REACTIONS = [
  { emoji: '👍', name: 'Лайк' },
  { emoji: '👏', name: 'Аплодисменты' },
  { emoji: '😂', name: 'Смех' },
  { emoji: '❤️', name: 'Сердце' },
  { emoji: '🔥', name: 'Огонь' },
  { emoji: '🎉', name: 'Праздник' },
  { emoji: '🤔', name: 'Думаю' },
  { emoji: '👀', name: 'Смотрю' },
];

export const ControlBar = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onLeave,
  showChat,
  showParticipants,
  onSendReaction,
}) => {
  const [showReactions, setShowReactions] = useState(false);

  const reactionPanelRef = useRef(null);
  const reactionButtonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !showReactions ||
        reactionPanelRef.current?.contains(event.target) ||
        reactionButtonRef.current?.contains(event.target)
      ) {
        return;
      }

      setShowReactions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showReactions]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowReactions(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleReaction = (reaction) => {
    onSendReaction?.(reaction.emoji);
  };

  return (
    <div className={styles.controlBar}>
      <div className={styles.controls}>
        <button
          className={`${styles.controlButton} ${!isAudioEnabled ? styles.offState : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          aria-label={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          aria-pressed={isAudioEnabled}
          type="button"
        >
          <span className={styles.icon}>
            {isAudioEnabled ? (
              <Mic size={21} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <MicOff size={21} strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>

          <span className={styles.label}>
            {isAudioEnabled ? 'Микрофон' : 'Включить'}
          </span>
        </button>

        <button
          className={`${styles.controlButton} ${!isVideoEnabled ? styles.offState : ''}`}
          onClick={onToggleVideo}
          title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
          aria-label={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
          aria-pressed={isVideoEnabled}
          type="button"
        >
          <span className={styles.icon}>
            {isVideoEnabled ? (
              <Video size={21} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <VideoOff size={21} strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>

          <span className={styles.label}>
            {isVideoEnabled ? 'Камера' : 'Включить'}
          </span>
        </button>

        <button
          className={`${styles.controlButton} ${isScreenSharing ? styles.active : ''}`}
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
          aria-label={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Начать демонстрацию экрана'}
          aria-pressed={isScreenSharing}
          type="button"
        >
          <span className={styles.icon}>
            {isScreenSharing ? (
              <ScreenShareOff size={21} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <ScreenShare size={21} strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>

          <span className={styles.label}>
            {isScreenSharing ? 'Стоп' : 'Экран'}
          </span>
        </button>

        <span className={styles.divider} aria-hidden="true" />

        <button
          className={`${styles.controlButton} ${showChat ? styles.active : ''}`}
          onClick={onToggleChat}
          title={showChat ? 'Скрыть чат' : 'Открыть чат'}
          aria-label={showChat ? 'Скрыть чат' : 'Открыть чат'}
          aria-pressed={showChat}
          type="button"
        >
          <span className={styles.icon}>
            <MessageSquare size={21} strokeWidth={2.2} aria-hidden="true" />
          </span>

          <span className={styles.label}>Чат</span>
        </button>

        <button
          className={`${styles.controlButton} ${showParticipants ? styles.active : ''}`}
          onClick={onToggleParticipants}
          title={showParticipants ? 'Скрыть участников' : 'Показать участников'}
          aria-label={showParticipants ? 'Скрыть участников' : 'Показать участников'}
          aria-pressed={showParticipants}
          type="button"
        >
          <span className={styles.icon}>
            <Users size={21} strokeWidth={2.2} aria-hidden="true" />
          </span>

          <span className={styles.label}>Участники</span>
        </button>

        <div className={styles.reactionControl}>
          <button
            ref={reactionButtonRef}
            className={`${styles.controlButton} ${showReactions ? styles.active : ''}`}
            onClick={() => setShowReactions((value) => !value)}
            title={showReactions ? 'Скрыть реакции' : 'Показать реакции'}
            aria-label={showReactions ? 'Скрыть реакции' : 'Показать реакции'}
            aria-expanded={showReactions}
            type="button"
          >
            <span className={styles.icon}>
              <SmilePlus size={21} strokeWidth={2.2} aria-hidden="true" />
            </span>

            <span className={styles.label}>Реакции</span>
          </button>

          {showReactions && (
            <div
              ref={reactionPanelRef}
              className={styles.reactionsPanel}
              role="menu"
              aria-label="Реакции созвона"
            >
              <div className={styles.reactionsHeader}>
                Быстрые реакции
              </div>

              <div className={styles.reactionsGrid}>
                {REACTIONS.map((reaction) => (
                  <button
                    key={reaction.name}
                    type="button"
                    className={styles.reactionButton}
                    onClick={() => handleReaction(reaction)}
                    title={reaction.name}
                    aria-label={reaction.name}
                    role="menuitem"
                  >
                    <span className={styles.reactionEmoji}>
                      {reaction.emoji}
                    </span>

                    <span className={styles.reactionName}>
                      {reaction.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        className={`${styles.controlButton} ${styles.leaveButton}`}
        onClick={onLeave}
        title="Выйти из созвона"
        aria-label="Выйти из созвона"
        type="button"
      >
        <span className={styles.icon}>
          <PhoneOff size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>

        <span className={styles.label}>Выйти</span>
      </button>
    </div>
  );
};