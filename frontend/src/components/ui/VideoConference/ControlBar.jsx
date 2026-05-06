import React from 'react';
import {
  CONFERENCE_ICONS,
  renderIconComponent,
} from '../../../utils/icons';
import styles from './ControlBar.module.css';

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
  showParticipants
}) => {
  const IconView = ({ icon: Icon, size = 24 }) => {
    return renderIconComponent(Icon, { size, strokeWidth: 2 });
  };

  return (
    <div className={styles.controlBar}>
      <div className={styles.controls}>
        {/* Микрофон */}
        <button
          className={`${styles.controlButton} ${!isAudioEnabled ? styles.disabled : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          type="button"
        >
          <span className={styles.icon}>
            <IconView icon={isAudioEnabled ? CONFERENCE_ICONS.MIC_ON : CONFERENCE_ICONS.MIC_OFF} />
          </span>
          <span className={styles.label}>
            {isAudioEnabled ? 'Микрофон' : 'Вкл. микрофон'}
          </span>
        </button>
        
        {/* Камера */}
        <button
          className={`${styles.controlButton} ${!isVideoEnabled ? styles.disabled : ''}`}
          onClick={onToggleVideo}
          title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
          type="button"
        >
          <span className={styles.icon}>
            <IconView icon={isVideoEnabled ? CONFERENCE_ICONS.CAMERA_ON : CONFERENCE_ICONS.CAMERA_OFF} />
          </span>
          <span className={styles.label}>
            {isVideoEnabled ? 'Камера' : 'Вкл. камеру'}
          </span>
        </button>
        
        {/* Демонстрация экрана */}
        <button
          className={`${styles.controlButton} ${isScreenSharing ? styles.active : ''}`}
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
          type="button"
        >
          <span className={styles.icon}>
            <IconView icon={CONFERENCE_ICONS.SCREEN_SHARE} />
          </span>
          <span className={styles.label}>
            {isScreenSharing ? 'Стоп' : 'Экран'}
          </span>
        </button>
        
        {/* Чат */}
        <button
          className={`${styles.controlButton} ${showChat ? styles.active : ''}`}
          onClick={onToggleChat}
          title="Чат"
          type="button"
        >
          <span className={styles.icon}>
            <IconView icon={CONFERENCE_ICONS.CHAT} />
          </span>
          <span className={styles.label}>Чат</span>
        </button>
        
        {/* Участники */}
        <button
          className={`${styles.controlButton} ${showParticipants ? styles.active : ''}`}
          onClick={onToggleParticipants}
          title="Участники"
          type="button"
        >
          <span className={styles.icon}>
            <IconView icon={CONFERENCE_ICONS.PARTICIPANTS} />
          </span>
          <span className={styles.label}>Участники</span>
        </button>
      </div>
      
      {/* Кнопка выхода */}
      <button
        className={`${styles.controlButton} ${styles.leaveButton}`}
        onClick={onLeave}
        title="Выйти"
        type="button"
      >
        <span className={styles.icon}>
          <IconView icon={CONFERENCE_ICONS.LEAVE} />
        </span>
        <span className={styles.label}>Выйти</span>
      </button>
    </div>
  );
};
