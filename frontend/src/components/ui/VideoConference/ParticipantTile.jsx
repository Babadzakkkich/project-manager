import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Track } from 'livekit-client';
import {
  Mic,
  MicOff,
  MoreVertical,
  ScreenShare,
  UserX,
  VideoOff,
  VolumeX,
} from 'lucide-react';

import styles from './ParticipantTile.module.css';

const MENU_WIDTH = 240;
const MENU_HEIGHT = 150;

const getParticipantName = (participant) => {
  return participant?.name || participant?.identity || 'Участник';
};

const getParticipantInitial = (participant) => {
  return getParticipantName(participant).charAt(0).toUpperCase();
};

export const ParticipantTile = ({
  participant,
  isLocal,
  isModerator,
  isActiveSpeaker,
  onMute,
  onKick,
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  const speakingOffTimerRef = useRef(null);
  const audioLevelRafRef = useRef(null);
  const audioLevelContextRef = useRef(null);

  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  const [cameraTrack, setCameraTrack] = useState(null);
  const [screenTrack, setScreenTrack] = useState(null);
  const [audioTrack, setAudioTrack] = useState(null);
  const [speakingNow, setSpeakingNow] = useState(Boolean(participant.isSpeaking));

  const name = getParticipantName(participant);
  const isSpeaking = speakingNow || Boolean(isActiveSpeaker);

  const activeVideoTrack = useMemo(() => {
    return screenTrack || cameraTrack;
  }, [screenTrack, cameraTrack]);

  const videoEnabled = Boolean(activeVideoTrack);
  const cameraEnabled = Boolean(cameraTrack);
  const audioEnabled = Boolean(audioTrack);
  const isScreenShare = Boolean(screenTrack) || participant.isScreenShareEnabled;
  const canModerate = isModerator && !isLocal;

  const clearSpeakingOffTimer = useCallback(() => {
    if (speakingOffTimerRef.current) {
      clearTimeout(speakingOffTimerRef.current);
      speakingOffTimerRef.current = null;
    }
  }, []);

  const setSpeakingState = useCallback((speaking) => {
    const nextSpeaking =
      typeof speaking === 'boolean'
        ? speaking
        : Boolean(participant.isSpeaking);

    if (nextSpeaking) {
      clearSpeakingOffTimer();
      setSpeakingNow(true);
      return;
    }

    if (!speakingOffTimerRef.current) {
      speakingOffTimerRef.current = setTimeout(() => {
        setSpeakingNow(false);
        speakingOffTimerRef.current = null;
      }, 300);
    }
  }, [participant, clearSpeakingOffTimer]);

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

      if (!nextTrack) {
        setSpeakingState(false);
      }
    }
  }, [getTrackFromPublication, setTrackSafely, setSpeakingState]);

  useEffect(() => {
    const handleSpeakingChanged = (speaking) => {
      setSpeakingState(speaking);
    };

    setSpeakingState(participant.isSpeaking);
    participant.on('isSpeakingChanged', handleSpeakingChanged);

    const speakingSyncInterval = setInterval(() => {
      if (participant.isSpeaking) {
        setSpeakingState(true);
      }
    }, 300);

    return () => {
      participant.off('isSpeakingChanged', handleSpeakingChanged);
      clearInterval(speakingSyncInterval);
      clearSpeakingOffTimer();
    };
  }, [participant, setSpeakingState, clearSpeakingOffTimer]);

  useEffect(() => {
    if (!audioTrack) {
      setSpeakingState(false);
      return;
    }

    const mediaStreamTrack = audioTrack.mediaStreamTrack;

    if (!mediaStreamTrack) {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    let stopped = false;
    let source = null;
    let analyser = null;

    const stopAudioLevelAnalyzer = () => {
      stopped = true;

      if (audioLevelRafRef.current) {
        cancelAnimationFrame(audioLevelRafRef.current);
        audioLevelRafRef.current = null;
      }

      if (source) {
        source.disconnect();
        source = null;
      }

      if (audioLevelContextRef.current) {
        audioLevelContextRef.current.close().catch(() => {});
        audioLevelContextRef.current = null;
      }
    };

    const startAudioLevelAnalyzer = async () => {
      try {
        const audioContext = new AudioContextConstructor();
        audioLevelContextRef.current = audioContext;

        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => {});
        }

        if (stopped) {
          return;
        }

        const mediaStream = new MediaStream([mediaStreamTrack]);

        source = audioContext.createMediaStreamSource(mediaStream);
        analyser = audioContext.createAnalyser();

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.65;

        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);

        const checkAudioLevel = () => {
          if (stopped || !analyser) {
            return;
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i += 1) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }

          const rms = Math.sqrt(sum / data.length);

          const isVoiceDetected =
            rms > 0.022 &&
            mediaStreamTrack.readyState === 'live' &&
            !mediaStreamTrack.muted;

          setSpeakingState(isVoiceDetected);

          audioLevelRafRef.current = requestAnimationFrame(checkAudioLevel);
        };

        checkAudioLevel();
      } catch (err) {
        console.warn('Audio level analyzer failed:', err);
      }
    };

    startAudioLevelAnalyzer();

    return () => {
      stopAudioLevelAnalyzer();
      setSpeakingState(false);
    };
  }, [audioTrack, setSpeakingState]);

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
    syncTracksFromParticipant,
  ]);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !showMenu ||
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }

      setShowMenu(false);
    };

    const handleViewportChange = () => {
      setShowMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [showMenu]);

  const handleMenuToggle = (event) => {
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();

    const left = Math.min(
      Math.max(12, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 12
    );

    let top = rect.bottom + 8;

    if (top + MENU_HEIGHT > window.innerHeight - 12) {
      top = Math.max(12, rect.top - MENU_HEIGHT - 8);
    }

    setMenuPosition({ left, top });
    setShowMenu((value) => !value);
  };

  const handleMute = (event) => {
    event.stopPropagation();

    if (!canModerate) return;

    onMute?.(participant.identity);
    setShowMenu(false);
  };

  const handleKick = (event) => {
    event.stopPropagation();

    if (!canModerate) return;

    onKick?.(participant.identity);
    setShowMenu(false);
  };

  const menu = showMenu && canModerate
    ? createPortal(
      <div
        className={styles.menu}
        ref={menuRef}
        style={{
          left: `${menuPosition.left}px`,
          top: `${menuPosition.top}px`,
        }}
      >
        <div className={styles.menuHeader}>
          <span>{name}</span>
          <small>Управление участником</small>
        </div>

        <button
          className={styles.menuItem}
          onClick={handleMute}
          type="button"
        >
          <VolumeX size={16} strokeWidth={2} aria-hidden="true" />
          Отключить микрофон
        </button>

        <button
          className={`${styles.menuItem} ${styles.danger}`}
          onClick={handleKick}
          type="button"
        >
          <UserX size={16} strokeWidth={2} aria-hidden="true" />
          Удалить из созвона
        </button>
      </div>,
      document.body
    )
    : null;

  return (
    <>
      <div
        className={`${styles.tile} ${isSpeaking ? styles.speaking : ''} ${
          isScreenShare ? styles.screenShare : ''
        } ${!videoEnabled ? styles.videoOff : ''}`}
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
              {getParticipantInitial(participant)}
            </div>
          </div>
        )}

        {!isLocal && (
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            className={styles.audio}
          />
        )}

        <div className={styles.topStatus}>
          {isSpeaking && (
            <span className={styles.speakingBadge}>
              <Mic size={13} strokeWidth={2.2} aria-hidden="true" />
              Говорит
            </span>
          )}

          {isScreenShare && (
            <span className={styles.screenBadge}>
              <ScreenShare size={13} strokeWidth={2.2} aria-hidden="true" />
              Экран
            </span>
          )}
        </div>

        {canModerate && (
          <div className={styles.actions}>
            <button
              ref={menuButtonRef}
              type="button"
              className={`${styles.menuButton} ${showMenu ? styles.menuButtonActive : ''}`}
              onClick={handleMenuToggle}
              aria-label={`Действия с участником ${name}`}
              aria-expanded={showMenu}
            >
              <MoreVertical size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className={styles.bottomOverlay}>
          <div className={styles.identity}>
            <span className={styles.name} title={name}>
              {name}
            </span>

            {isLocal && (
              <span className={styles.localBadge}>
                Вы
              </span>
            )}
          </div>

          <div className={styles.statusIcons}>
            <span
              className={`${styles.statusIcon} ${
                audioEnabled ? styles.statusOn : styles.statusOff
              }`}
              title={audioEnabled ? 'Микрофон включён' : 'Микрофон выключен'}
            >
              {audioEnabled ? (
                <Mic size={15} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <MicOff size={15} strokeWidth={2.2} aria-hidden="true" />
              )}
            </span>

            <span
              className={`${styles.statusIcon} ${
                cameraEnabled ? styles.statusOn : styles.statusOff
              }`}
              title={cameraEnabled ? 'Камера включена' : 'Камера выключена'}
            >
              {cameraEnabled ? (
                <span className={styles.cameraDot} />
              ) : (
                <VideoOff size={15} strokeWidth={2.2} aria-hidden="true" />
              )}
            </span>

            {isScreenShare && (
              <span
                className={`${styles.statusIcon} ${styles.statusScreen}`}
                title="Демонстрация экрана"
              >
                <ScreenShare size={15} strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
          </div>
        </div>
      </div>

      {menu}
    </>
  );
};