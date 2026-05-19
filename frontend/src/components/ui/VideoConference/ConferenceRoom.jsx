import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConnectionState } from 'livekit-client';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Copy,
  FolderKanban,
  Loader2,
  PhoneOff,
  Radio,
  Users,
  Video,
  VideoOff,
  Zap,
} from 'lucide-react';

import { useConference } from '../../../hooks/useConference';
import { useAuthContext } from '../../../contexts/AuthContext';
import { conferencesAPI } from '../../../services/api/conferences';
import { Button } from '../Button';
import { ParticipantGrid } from './ParticipantGrid';
import { ControlBar } from './ControlBar';
import { ChatPanel } from './ChatPanel';
import { ParticipantsPanel } from './ParticipantsPanel';
import { ConfirmationModal } from '../ConfirmationModal';
import {
  CONFERENCE_ROOM_TYPES,
  CONFERENCE_ROOM_TYPE_TRANSLATIONS,
} from '../../../utils/constants';
import styles from './ConferenceRoom.module.css';

const MAX_VISIBLE_REACTIONS = 12;
const REACTION_LIFETIME_MS = 2400;

const PARTICIPANT_FORMS = ['участник', 'участника', 'участников'];

const getRussianPluralForm = (count, forms) => {
  const number = Math.abs(Number(count)) || 0;
  const lastTwoDigits = number % 100;
  const lastDigit = number % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return forms[2];
  }

  if (lastDigit === 1) {
    return forms[0];
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return forms[1];
  }

  return forms[2];
};

const getRoomTypeConfig = (type) => {
  switch (type) {
    case CONFERENCE_ROOM_TYPES.PROJECT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Проект',
        Icon: FolderKanban,
      };

    case CONFERENCE_ROOM_TYPES.GROUP:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Группа',
        Icon: Users,
      };

    case CONFERENCE_ROOM_TYPES.TASK:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Задача',
        Icon: ClipboardList,
      };

    case CONFERENCE_ROOM_TYPES.INSTANT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Мгновенный',
        Icon: Zap,
      };

    default:
      return {
        label: 'Созвон',
        Icon: Video,
      };
  }
};

const getCreatorName = (creator) => {
  return creator?.name || creator?.login || creator?.email || 'Неизвестно';
};

const formatKickDateTime = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getActiveKickInfo = (room) => {
  const kickedUntil = room?.current_user_kicked_until;
  const kickedUntilTime = kickedUntil ? new Date(kickedUntil).getTime() : 0;
  const isKicked = Boolean(
    room?.is_current_user_kicked &&
    kickedUntilTime &&
    !Number.isNaN(kickedUntilTime) &&
    kickedUntilTime > Date.now()
  );

  return {
    isKicked,
    kickedUntil,
    kickedUntilLabel: formatKickDateTime(kickedUntil),
    reason: room?.current_user_kick_reason?.trim() || '',
  };
};

const getConnectionLabel = (connectionState) => {
  if (connectionState === ConnectionState.Connected) {
    return 'Подключено';
  }

  if (connectionState === ConnectionState.Connecting) {
    return 'Подключение';
  }

  if (connectionState === ConnectionState.Reconnecting) {
    return 'Переподключение';
  }

  if (connectionState === ConnectionState.Disconnected) {
    return 'Отключено';
  }

  return 'Ожидание';
};

export const ConferenceRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const numericRoomId = useMemo(() => Number.parseInt(roomId, 10), [roomId]);

  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showLeaveLastModal, setShowLeaveLastModal] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [userInteracted, setUserInteracted] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [leavingRoom, setLeavingRoom] = useState(false);

  const hasConnected = useRef(false);
  const leaveBeaconSentRef = useRef(false);
  const reactionTimersRef = useRef(new Map());
  const copiedTimerRef = useRef(null);

  const {
    connectionState,
    participants,
    isConnecting,
    error,
    messages,
    isModerator,
    roomInfo,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendChatMessage,
    muteParticipant,
    kickParticipant,
    endConference,
    addHistoryMessages,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    sendReaction,
  } = useConference(numericRoomId);

  const displayRoom = roomData || roomInfo;
  const currentUserKick = getActiveKickInfo(displayRoom);
  const roomType = getRoomTypeConfig(displayRoom?.room_type);
  const RoomTypeIcon = roomType.Icon;

  const participantLabel = getRussianPluralForm(
    participants.length,
    PARTICIPANT_FORMS
  );

  const createFallbackReactionId = () => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `reaction_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const createFallbackPosition = () => ({
    x: Math.round(18 + Math.random() * 64),
    y: Math.round(18 + Math.random() * 50),
    drift: Math.round(-30 + Math.random() * 60),
  });

  useEffect(() => {
    const loadRoomData = async () => {
      try {
        const data = await conferencesAPI.getRoomById(roomId);
        setRoomData(data);
      } catch (err) {
        console.error('Failed to load room data:', err);
        navigate('/conferences', { replace: true });
      }
    };

    if (roomId) {
      loadRoomData();
    }
  }, [roomId, navigate]);

  useEffect(() => {
    if (!hasConnected.current && roomId && userInteracted) {
      hasConnected.current = true;
      leaveBeaconSentRef.current = false;
      setJoiningRoom(true);
      connect();
    }

    return () => {
      if (hasConnected.current) {
        disconnect();
        hasConnected.current = false;
      }
    };
  }, [connect, disconnect, roomId, userInteracted]);

  useEffect(() => {
    if (!roomId || !userInteracted) return;

    const leaveUrl = `/api/conferences/rooms/${roomId}/leave-beacon`;

    const sendLeaveBeacon = () => {
      if (leaveBeaconSentRef.current) return;

      leaveBeaconSentRef.current = true;

      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            leaveUrl,
            new Blob([], { type: 'text/plain' })
          );
          return;
        }

        fetch(leaveUrl, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Страница закрывается, поэтому ошибку здесь не показываем.
      }
    };

    window.addEventListener('pagehide', sendLeaveBeacon);
    window.addEventListener('beforeunload', sendLeaveBeacon);

    return () => {
      window.removeEventListener('pagehide', sendLeaveBeacon);
      window.removeEventListener('beforeunload', sendLeaveBeacon);
    };
  }, [roomId, userInteracted]);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      setJoiningRoom(false);
    }
  }, [connectionState]);

  useEffect(() => {
    const handleKicked = (event) => {
      leaveBeaconSentRef.current = true;
      hasConnected.current = false;
      setJoiningRoom(false);
      setLeavingRoom(false);
      setShowLeaveLastModal(false);
      setShowEndModal(false);
      navigate('/conferences', {
        replace: true,
        state: {
          conferenceKickFeedback: event.detail || {},
        },
      });
    };

    window.addEventListener('conference:kicked', handleKicked);

    return () => {
      window.removeEventListener('conference:kicked', handleKicked);
    };
  }, [navigate]);

  useEffect(() => {
    const reactionTimers = reactionTimersRef.current;

    const handleReaction = (event) => {
      const fallbackPosition = createFallbackPosition();

      const reactionItem = {
        id: event.detail.id || createFallbackReactionId(),
        reaction: event.detail.reaction,
        participantId: event.detail.participantId,
        participantName: event.detail.participantName,
        x: Number.isFinite(event.detail.x) ? event.detail.x : fallbackPosition.x,
        y: Number.isFinite(event.detail.y) ? event.detail.y : fallbackPosition.y,
        drift: Number.isFinite(event.detail.drift)
          ? event.detail.drift
          : fallbackPosition.drift,
        createdAt: event.detail.createdAt || new Date().toISOString(),
      };

      setFloatingReactions((prev) => {
        const withoutDuplicate = prev.filter((item) => item.id !== reactionItem.id);
        return [...withoutDuplicate, reactionItem].slice(-MAX_VISIBLE_REACTIONS);
      });

      const oldTimer = reactionTimers.get(reactionItem.id);

      if (oldTimer) {
        clearTimeout(oldTimer);
      }

      const timerId = setTimeout(() => {
        setFloatingReactions((prev) =>
          prev.filter((item) => item.id !== reactionItem.id)
        );
        reactionTimers.delete(reactionItem.id);
      }, REACTION_LIFETIME_MS);

      reactionTimers.set(reactionItem.id, timerId);
    };

    window.addEventListener('conference:reaction', handleReaction);

    return () => {
      window.removeEventListener('conference:reaction', handleReaction);

      reactionTimers.forEach((timerId) => clearTimeout(timerId));
      reactionTimers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleJoinRoom = () => {
    if (currentUserKick.isKicked) {
      return;
    }

    setUserInteracted(true);
  };

  const performLeave = async ({ autoEndIfLast = false } = {}) => {
    if (leavingRoom) return;

    setLeavingRoom(true);

    try {
      leaveBeaconSentRef.current = true;

      await conferencesAPI.leaveRoom(numericRoomId, {
        auto_end_if_last: autoEndIfLast,
      });

      hasConnected.current = false;
      disconnect({ notifyServer: false });
      navigate('/conferences');
    } catch (err) {
      console.error('Failed to leave room:', err);

      const status = err?.response?.status;

      if (status === 400) {
        setShowLeaveLastModal(true);
        return;
      }

      // Важно: не делаем disconnect/navigate при ошибке leave,
      // иначе участник может остаться активным в БД как 1/30.
    } finally {
      setLeavingRoom(false);
    }
  };

  const handleLeave = async () => {
    if (leavingRoom) return;

    try {
      const impact = await conferencesAPI.getLeaveImpact(numericRoomId);

      const shouldEndRoom = Boolean(
        impact?.would_end_room ||
        impact?.will_end_room ||
        impact?.is_last_participant
      );

      if (shouldEndRoom) {
        setShowLeaveLastModal(true);
        return;
      }

      await performLeave();
    } catch (err) {
      console.error('Failed to check leave impact:', err);

      // Если проверка не сработала, безопаснее спросить подтверждение,
      // чем молча выйти и оставить активную запись участника в БД.
      setShowLeaveLastModal(true);
    }
  };

  const handleConfirmLeaveLast = async () => {
    setShowLeaveLastModal(false);
    await performLeave({ autoEndIfLast: true });
  };

  const handleEndConference = async () => {
    leaveBeaconSentRef.current = true;
    await endConference();
    hasConnected.current = false;
    setShowEndModal(false);
    navigate('/conferences');
  };

  const handleCopyLink = async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!userInteracted) {
    return (
      <div className={styles.preJoinScreen}>
        <div className={styles.preJoinShell}>
          <section className={styles.preJoinInfo}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/conferences')}
            >
              <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
              К списку созвонов
            </button>

            <div className={styles.roomTypeBadge}>
              <RoomTypeIcon size={16} strokeWidth={2} aria-hidden="true" />
              {roomType.label}
            </div>

            <h1 className={styles.preJoinTitle}>
              {displayRoom?.title || 'Загрузка созвона...'}
            </h1>

            <p className={styles.preJoinDescription}>
              {currentUserKick.isKicked
                ? 'Модератор временно ограничил ваш повторный вход в этот созвон.'
                : 'Перед входом проверьте, что браузеру разрешён доступ к микрофону и камере. Подключение к комнате начнётся только после нажатия кнопки.'}
            </p>

            {displayRoom && (
              <div className={styles.preJoinDetails}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Тип</span>
                  <span className={styles.detailValue}>
                    <RoomTypeIcon size={15} strokeWidth={2} aria-hidden="true" />
                    {roomType.label}
                  </span>
                </div>

                {displayRoom.creator && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Создатель</span>
                    <span className={styles.detailValue}>
                      <Users size={15} strokeWidth={2} aria-hidden="true" />
                      {getCreatorName(displayRoom.creator)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={styles.preJoinPanel}>
            <div className={styles.previewBox}>
              <div className={styles.previewIcon}>
                <VideoOff size={42} strokeWidth={1.8} aria-hidden="true" />
              </div>

              <div>
                <h2>Предпросмотр недоступен</h2>
                <p>
                  Камера и микрофон будут запрошены при входе в созвон.
                </p>
              </div>
            </div>

            {currentUserKick.isKicked && (
              <div className={styles.kickNotice}>
                <AlertTriangle size={18} strokeWidth={2.1} aria-hidden="true" />
                <div>
                  <strong>Вход временно заблокирован</strong>
                  <span>
                    Доступ будет открыт {currentUserKick.kickedUntilLabel || 'после окончания блокировки'}
                    {currentUserKick.reason
                      ? `. Причина: ${currentUserKick.reason}`
                      : '. Причина не указана.'}
                  </span>
                </div>
              </div>
            )}

            <div className={styles.preJoinActions}>
              <Button
                variant={currentUserKick.isKicked ? 'secondary' : 'primary'}
                size="large"
                onClick={handleJoinRoom}
                className={styles.joinButton}
                disabled={!displayRoom || currentUserKick.isKicked}
              >
                {currentUserKick.isKicked ? (
                  <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Video size={18} strokeWidth={2} aria-hidden="true" />
                )}
                {displayRoom
                  ? currentUserKick.isKicked
                    ? 'Вход недоступен'
                    : 'Войти в созвон'
                  : 'Загрузка...'}
              </Button>

              <Button
                variant="secondary"
                size="large"
                onClick={() => navigate('/conferences')}
              >
                Отмена
              </Button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (
    joiningRoom ||
    isConnecting ||
    connectionState === ConnectionState.Connecting
  ) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2
          size={42}
          strokeWidth={2}
          className={styles.loadingIcon}
          aria-hidden="true"
        />

        <p>Подключение к созвону...</p>

        <p className={styles.hint}>
          Пожалуйста, разрешите доступ к микрофону и камере
        </p>
      </div>
    );
  }

  if (connectionState === ConnectionState.Reconnecting) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2
          size={42}
          strokeWidth={2}
          className={styles.loadingIcon}
          aria-hidden="true"
        />

        <p>Переподключение...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>
          <AlertTriangle size={42} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>Ошибка подключения</h2>
        <p>{error}</p>

        <Button onClick={() => navigate(-1)} variant="primary">
          Вернуться назад
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.room}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button
            type="button"
            className={styles.iconBackButton}
            onClick={handleLeave}
            disabled={leavingRoom}
            aria-label="Выйти из созвона"
          >
            <ArrowLeft size={19} strokeWidth={2.2} aria-hidden="true" />
          </button>

          <div className={styles.roomTitleBlock}>
            <div className={styles.roomTitleRow}>
              <RoomTypeIcon size={17} strokeWidth={2} aria-hidden="true" />

              <h1 className={styles.roomTitle}>
                {roomInfo?.title || displayRoom?.title || 'Созвон'}
              </h1>
            </div>

            <div className={styles.roomMeta}>
              <span className={styles.connectionBadge}>
                <Radio size={13} strokeWidth={2.2} aria-hidden="true" />
                {getConnectionLabel(connectionState)}
              </span>

              <span>
                {participants.length} {participantLabel}
              </span>

              {isModerator && (
                <span className={styles.moderatorBadge}>
                  Модератор
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.topBarActions}>
          <Button
            variant="secondary"
            size="small"
            onClick={handleCopyLink}
            className={styles.topActionButton}
          >
            {copied ? (
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy size={16} strokeWidth={2} aria-hidden="true" />
            )}
            {copied ? 'Скопировано' : 'Ссылка'}
          </Button>

          {isModerator && (
            <Button
              variant="danger"
              size="small"
              onClick={() => setShowEndModal(true)}
              className={styles.endButton}
            >
              <PhoneOff size={16} strokeWidth={2} aria-hidden="true" />
              Завершить
            </Button>
          )}
        </div>
      </header>

      <main className={styles.mainArea}>
        <ParticipantGrid
          participants={participants}
          localParticipantId={user?.id?.toString()}
        />

        <div className={styles.floatingReactionsLayer} aria-hidden="true">
          {floatingReactions.map((reaction) => (
            <div
              key={reaction.id}
              className={styles.floatingReaction}
              style={{
                '--reaction-x': `${reaction.x}%`,
                '--reaction-y': `${reaction.y}%`,
                '--reaction-drift': `${reaction.drift}px`,
              }}
            >
              <span className={styles.reactionEmoji}>
                {reaction.reaction}
              </span>

              <span className={styles.reactionName}>
                {reaction.participantName}
              </span>
            </div>
          ))}
        </div>
      </main>

      {showChat && (
        <div className={styles.sidePanelLayer}>
          <ChatPanel
            roomId={numericRoomId}
            messages={messages}
            onSendMessage={sendChatMessage}
            onClose={() => setShowChat(false)}
            currentUserId={user?.id}
            _addHistoryMessages={addHistoryMessages}
          />
        </div>
      )}

      {showParticipants && (
        <div className={styles.sidePanelLayer}>
          <ParticipantsPanel
            participants={participants}
            localParticipantId={user?.id?.toString()}
            isModerator={isModerator}
            onMuteParticipant={muteParticipant}
            onKickParticipant={kickParticipant}
            onClose={() => setShowParticipants(false)}
          />
        </div>
      )}

      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => setShowChat((value) => !value)}
        onToggleParticipants={() => setShowParticipants((value) => !value)}
        onLeave={handleLeave}
        showChat={showChat}
        showParticipants={showParticipants}
        onSendReaction={sendReaction}
      />

      <ConfirmationModal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
        onConfirm={handleEndConference}
        title="Завершить созвон"
        message="Вы уверены, что хотите завершить созвон для всех участников?"
        confirmText="Завершить"
        cancelText="Отмена"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showLeaveLastModal}
        onClose={() => {
          if (!leavingRoom) {
            setShowLeaveLastModal(false);
          }
        }}
        onConfirm={handleConfirmLeaveLast}
        title="Завершить созвон"
        message="Вы последний активный участник. Если выйти сейчас, комната будет автоматически завершена."
        confirmText="Выйти и завершить"
        cancelText="Остаться"
        variant="danger"
      />
    </div>
  );
};