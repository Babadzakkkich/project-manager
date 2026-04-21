import React, { useRef, useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import styles from './ParticipantTile.module.css';

export const ParticipantTile = ({
  participant,
  isLocal,
  isModerator,
  isActiveSpeaker,
  onMute,
  onKick
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const isScreenShare = participant.isScreenShareEnabled;
  const isSpeaking = participant.isSpeaking;
  const name = participant.name || participant.identity;
  
  useEffect(() => {
    // Подключаем видео треки
    const videoTracks = participant.getTrackPublications();
    
    videoTracks.forEach((publication) => {
      if (publication.track) {
        attachTrack(publication.track);
      }
    });
    
    // Слушаем события публикации треков
    const handleTrackPublished = (publication) => {
      if (publication.track) {
        attachTrack(publication.track);
      }
    };
    
    const handleTrackUnpublished = (publication) => {
      if (publication.track) {
        detachTrack(publication.track);
      }
    };
    
    participant.on('trackPublished', handleTrackPublished);
    participant.on('trackUnpublished', handleTrackUnpublished);
    
    // Отслеживаем состояние аудио
    const updateAudioState = () => {
      setAudioEnabled(participant.isMicrophoneEnabled);
    };
    
    participant.on('trackMuted', updateAudioState);
    participant.on('trackUnmuted', updateAudioState);
    updateAudioState();
    
    return () => {
      participant.off('trackPublished', handleTrackPublished);
      participant.off('trackUnpublished', handleTrackUnpublished);
      participant.off('trackMuted', updateAudioState);
      participant.off('trackUnmuted', updateAudioState);
      
      // Отключаем треки
      videoTracks.forEach((publication) => {
        if (publication.track) {
          detachTrack(publication.track);
        }
      });
    };
  }, [participant]);
  
  const attachTrack = (track) => {
    if (track.kind === Track.Kind.Video) {
      setVideoEnabled(true);
      if (videoRef.current) {
        track.attach(videoRef.current);
      }
    } else if (track.kind === Track.Kind.Audio) {
      if (audioRef.current) {
        track.attach(audioRef.current);
      }
    }
  };
  
  const detachTrack = (track) => {
    if (track.kind === Track.Kind.Video) {
      setVideoEnabled(false);
      track.detach();
    } else if (track.kind === Track.Kind.Audio) {
      track.detach();
    }
  };
  
  const handleMute = () => {
    if (!isLocal && isModerator) {
      onMute(participant.identity);
      setShowMenu(false);
    }
  };
  
  const handleKick = () => {
    if (!isLocal && isModerator) {
      onKick(participant.identity);
      setShowMenu(false);
    }
  };
  
  return (
    <div 
      className={`${styles.tile} ${isSpeaking ? styles.speaking : ''} ${isActiveSpeaker ? styles.activeSpeaker : ''}`}
      onMouseEnter={() => !isLocal && setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Видео */}
      {videoEnabled ? (
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className={styles.noVideo}>
          <div className={styles.avatar}>
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      {/* Аудио (скрытое) */}
      <audio ref={audioRef} autoPlay playsInline />
      
      {/* Имя участника */}
      <div className={styles.infoBar}>
        <span className={styles.name}>
          {name}
          {isLocal && ' (Вы)'}
        </span>
        <div className={styles.statusIcons}>
          {!audioEnabled && <span className={styles.mutedIcon}>🔇</span>}
          {isScreenShare && <span className={styles.screenIcon}>🖥️</span>}
        </div>
      </div>
      
      {/* Меню модератора */}
      {showMenu && !isLocal && isModerator && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={handleMute}>
            🔇 Отключить микрофон
          </button>
          <button className={`${styles.menuItem} ${styles.danger}`} onClick={handleKick}>
            🚫 Удалить
          </button>
        </div>
      )}
    </div>
  );
};