import React from 'react';
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
  return (
    <div className={styles.controlBar}>
      <div className={styles.controls}>
        {/* Микрофон */}
        <button
          className={`${styles.controlButton} ${!isAudioEnabled ? styles.disabled : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          <span className={styles.icon}>
            {isAudioEnabled ? '🎤' : '🔇'}
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
        >
          <span className={styles.icon}>
            {isVideoEnabled ? '📹' : '🚫📹'}
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
        >
          <span className={styles.icon}>🖥️</span>
          <span className={styles.label}>
            {isScreenSharing ? 'Стоп' : 'Экран'}
          </span>
        </button>
        
        {/* Чат */}
        <button
          className={`${styles.controlButton} ${showChat ? styles.active : ''}`}
          onClick={onToggleChat}
          title="Чат"
        >
          <span className={styles.icon}>💬</span>
          <span className={styles.label}>Чат</span>
        </button>
        
        {/* Участники */}
        <button
          className={`${styles.controlButton} ${showParticipants ? styles.active : ''}`}
          onClick={onToggleParticipants}
          title="Участники"
        >
          <span className={styles.icon}>👥</span>
          <span className={styles.label}>Участники</span>
        </button>
      </div>
      
      {/* Кнопка выхода */}
      <button
        className={`${styles.controlButton} ${styles.leaveButton}`}
        onClick={onLeave}
        title="Выйти"
      >
        <span className={styles.icon}>🚪</span>
        <span className={styles.label}>Выйти</span>
      </button>
    </div>
  );
};