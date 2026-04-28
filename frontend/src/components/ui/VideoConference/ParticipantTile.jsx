import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
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
  const [cameraTrack, setCameraTrack] = useState(null);
  const [screenTrack, setScreenTrack] = useState(null);
  const [audioTrack, setAudioTrack] = useState(null);

  const isSpeaking = participant.isSpeaking;
  const name = participant.name || participant.identity;

  const activeVideoTrack = useMemo(() => {
    return screenTrack || cameraTrack;
  }, [screenTrack, cameraTrack]);

  const videoEnabled = Boolean(activeVideoTrack);
  const audioEnabled = Boolean(audioTrack);
  const isScreenShare = Boolean(screenTrack) || participant.isScreenShareEnabled;

  const getTrackFromPublication = useCallback((publication) => {
    return publication?.track || publication?.videoTrack || publication?.audioTrack || null;
  }, []);

  const setTrackSafely = useCallback((setter, nextTrack) => {
    setter((prevTrack) => (prevTrack === nextTrack ? prevTrack : nextTrack));
  }, []);

  const syncTracksFromParticipant = useCallback(() => {
    let nextCameraTrack = null;
    let nextScreenTrack = null;
    let nextAudioTrack = null;

    participant.getTrackPublications().forEach((publication) => {
      const track = getTrackFromPublication(publication);

      if (!track || publication.isMuted) {
        return;
      }

      const source = publication.source || track.source;

      if (source === Track.Source.Camera) {
        nextCameraTrack = track;
      }

      if (source === Track.Source.ScreenShare) {
        nextScreenTrack = track;
      }

      if (source === Track.Source.Microphone) {
        nextAudioTrack = track;
      }
    });

    setTrackSafely(setCameraTrack, nextCameraTrack);
    setTrackSafely(setScreenTrack, nextScreenTrack);
    setTrackSafely(setAudioTrack, nextAudioTrack);
  }, [participant, getTrackFromPublication, setTrackSafely]);

  const applyPublicationState = useCallback((publication, trackFromEvent, enabled) => {
    if (!publication && !trackFromEvent) return;

    const track = trackFromEvent || getTrackFromPublication(publication);
    const source = publication?.source || track?.source;
    const nextTrack = enabled && track ? track : null;

    if (source === Track.Source.Camera) {
      setTrackSafely(setCameraTrack, nextTrack);
      return;
    }

    if (source === Track.Source.ScreenShare) {
      setTrackSafely(setScreenTrack, nextTrack);
      return;
    }

    if (source === Track.Source.Microphone) {
      setTrackSafely(setAudioTrack, nextTrack);
    }
  }, [getTrackFromPublication, setTrackSafely]);

  useEffect(() => {
    syncTracksFromParticipant();

    const handleTrackSubscribed = (track, publication) => {
      applyPublicationState(publication, track, true);
    };

    const handleTrackUnsubscribed = (track, publication) => {
      applyPublicationState(publication, track, false);
    };

    const handleTrackPublished = (publication) => {
      const track = getTrackFromPublication(publication);

      if (track && !publication.isMuted) {
        applyPublicationState(publication, track, true);
      } else {
        syncTracksFromParticipant();
      }
    };

    const handleTrackUnpublished = (publication) => {
      const track = getTrackFromPublication(publication);
      applyPublicationState(publication, track, false);
    };

    const handleTrackMuted = (publication) => {
      const track = getTrackFromPublication(publication);
      applyPublicationState(publication, track, false);
    };

    const handleTrackUnmuted = (publication) => {
      const track = getTrackFromPublication(publication);

      if (track) {
        applyPublicationState(publication, track, true);
      } else {
        syncTracksFromParticipant();
      }
    };

    participant.on('trackSubscribed', handleTrackSubscribed);
    participant.on('trackUnsubscribed', handleTrackUnsubscribed);
    participant.on('trackPublished', handleTrackPublished);
    participant.on('trackUnpublished', handleTrackUnpublished);
    participant.on('trackMuted', handleTrackMuted);
    participant.on('trackUnmuted', handleTrackUnmuted);

    // Важно для localParticipant:
    // локальные публикации могут приходить отдельными событиями.
    participant.on('localTrackPublished', handleTrackPublished);
    participant.on('localTrackUnpublished', handleTrackUnpublished);

    return () => {
      participant.off('trackSubscribed', handleTrackSubscribed);
      participant.off('trackUnsubscribed', handleTrackUnsubscribed);
      participant.off('trackPublished', handleTrackPublished);
      participant.off('trackUnpublished', handleTrackUnpublished);
      participant.off('trackMuted', handleTrackMuted);
      participant.off('trackUnmuted', handleTrackUnmuted);

      participant.off('localTrackPublished', handleTrackPublished);
      participant.off('localTrackUnpublished', handleTrackUnpublished);
    };
  }, [
    participant,
    applyPublicationState,
    getTrackFromPublication,
    syncTracksFromParticipant
  ]);

  // Важно: этот эффект специально без массива зависимостей.
  // После updateParticipants родитель перерисовывается, а локальный participant остаётся тем же объектом.
  // Поэтому нужно перечитывать публикации после каждого render.
  useEffect(() => {
    syncTracksFromParticipant();
  });

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement || !activeVideoTrack) {
      return;
    }

    activeVideoTrack.attach(videoElement);

    videoElement
      .play()
      .catch((err) => {
        console.warn('Video play was blocked or delayed:', err);
      });

    return () => {
      activeVideoTrack.detach(videoElement);
    };
  }, [activeVideoTrack]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (isLocal || !audioElement || !audioTrack) {
      return;
    }

    audioTrack.attach(audioElement);

    audioElement
      .play()
      .catch((err) => {
        console.warn('Audio play was blocked or delayed:', err);
      });

    return () => {
      audioTrack.detach(audioElement);
    };
  }, [audioTrack, isLocal]);

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
      {videoEnabled ? (
        <video
          ref={videoRef}
          className={`${styles.video} ${isScreenShare ? styles.screenShareVideo : ''}`}
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

      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      )}

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