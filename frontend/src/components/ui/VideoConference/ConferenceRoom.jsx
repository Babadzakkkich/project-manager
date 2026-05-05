import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ConnectionState } from 'livekit-client';
import { useConference } from '../../../hooks/useConference';
import { useAuthContext } from '../../../contexts/AuthContext';
import { conferencesAPI } from '../../../services/api/conferences';
import { Button } from '../Button';
import { ParticipantGrid } from './ParticipantGrid';
import { ControlBar } from './ControlBar';
import { ChatPanel } from './ChatPanel';
import { ParticipantsPanel } from './ParticipantsPanel';
import { ReactionsBar } from './ReactionsBar';
import { ConfirmationModal } from '../ConfirmationModal';
import styles from './ConferenceRoom.module.css';

const MAX_VISIBLE_REACTIONS = 12;
const REACTION_LIFETIME_MS = 2400;

export const ConferenceRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [userInteracted, setUserInteracted] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomData, setRoomData] = useState(null);

  const hasConnected = useRef(false);
  const leaveBeaconSentRef = useRef(false);
  const reactionTimersRef = useRef(new Map());

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
    sendReaction,
    muteParticipant,
    kickParticipant,
    endConference,
    addHistoryMessages,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
  } = useConference(parseInt(roomId));

  const createFallbackReactionId = () => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `reaction_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const createFallbackPosition = () => {
    return {
      x: Math.round(18 + Math.random() * 64),
      y: Math.round(18 + Math.random() * 50),
      drift: Math.round(-30 + Math.random() * 60)
    };
  };

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
    if (!roomId || !userInteracted) {
      return;
    }

    const leaveUrl = `/api/conferences/rooms/${roomId}/leave-beacon`;

    const sendLeaveBeacon = () => {
      if (leaveBeaconSentRef.current) {
        return;
      }

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
          keepalive: true
        }).catch(() => {});
      // eslint-disable-next-line no-unused-vars
      } catch (err) {
        // Страница уже закрывается, поэтому ошибку здесь не показываем.
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
        drift: Number.isFinite(event.detail.drift) ? event.detail.drift : fallbackPosition.drift,
        createdAt: event.detail.createdAt || new Date().toISOString()
      };

      setFloatingReactions(prev => {
        const withoutDuplicate = prev.filter(item => item.id !== reactionItem.id);
        return [...withoutDuplicate, reactionItem].slice(-MAX_VISIBLE_REACTIONS);
      });

      const oldTimer = reactionTimers.get(reactionItem.id);

      if (oldTimer) {
        clearTimeout(oldTimer);
      }

      const timerId = setTimeout(() => {
        setFloatingReactions(prev => prev.filter(item => item.id !== reactionItem.id));
        reactionTimers.delete(reactionItem.id);
      }, REACTION_LIFETIME_MS);

      reactionTimers.set(reactionItem.id, timerId);
    };

    window.addEventListener('conference:reaction', handleReaction);

    return () => {
      window.removeEventListener('conference:reaction', handleReaction);

      reactionTimers.forEach(timerId => clearTimeout(timerId));
      reactionTimers.clear();
    };
  }, []);

  const handleJoinRoom = () => {
    setUserInteracted(true);
  };

  const handleLeave = () => {
    disconnect();
    navigate(-1);
  };

  const handleEndConference = async () => {
    await endConference();
    setShowEndModal(false);
    navigate(-1);
  };

  const handleCopyLink = () => {
    const url = window.location.href;

    navigator.clipboard?.writeText(url).catch((err) => {
      console.error('Failed to copy:', err);
    });
  };

  if (!userInteracted) {
    const displayRoom = roomData || roomInfo;

    return (
      <div className={styles.loadingContainer}>
        <div className={styles.joinRoomCard}>
          <div className={styles.joinRoomIcon}>🎥</div>

          <h2 className={styles.joinRoomTitle}>
            {displayRoom?.title || 'Загрузка...'}
          </h2>

          <p className={styles.joinRoomDescription}>
            Вы приглашены присоединиться к созвону.
            Нажмите кнопку ниже, чтобы войти.
          </p>

          {displayRoom && (
            <div className={styles.joinRoomInfo}>
              <div className={styles.joinRoomInfoItem}>
                <span className={styles.joinRoomLabel}>Тип:</span>
                <span className={styles.joinRoomValue}>
                  {displayRoom.room_type === 'project' && '📁 Проект'}
                  {displayRoom.room_type === 'group' && '👥 Группа'}
                  {displayRoom.room_type === 'task' && '✅ Задача'}
                  {displayRoom.room_type === 'instant' && '📞 Мгновенный'}
                </span>
              </div>

              {displayRoom.creator && (
                <div className={styles.joinRoomInfoItem}>
                  <span className={styles.joinRoomLabel}>Создатель:</span>
                  <span className={styles.joinRoomValue}>
                    {displayRoom.creator.login}
                  </span>
                </div>
              )}
            </div>
          )}

          <Button
            variant="primary"
            size="large"
            onClick={handleJoinRoom}
            className={styles.joinButton}
            disabled={!displayRoom}
          >
            {displayRoom ? 'Войти в созвон' : 'Загрузка...'}
          </Button>

          <p className={styles.joinRoomHint}>
            При входе потребуется доступ к микрофону и камере
          </p>
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
        <div className={styles.spinner}></div>
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
        <div className={styles.spinner}></div>
        <p>Переподключение...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>Ошибка подключения</h2>
        <p>{error}</p>
        <Button onClick={() => navigate(-1)}>
          Вернуться назад
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.room}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Button
            variant="secondary"
            size="small"
            onClick={handleLeave}
            className={styles.leaveButton}
          >
            ← Выйти
          </Button>

          <div className={styles.roomInfo}>
            <h2 className={styles.roomTitle}>
              {roomInfo?.title || 'Созвон'}
            </h2>

            <span className={styles.participantCount}>
              {participants.length}{' '}
              {participants.length === 1
                ? 'участник'
                : participants.length >= 2 && participants.length <= 4
                ? 'участника'
                : 'участников'}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="small"
            onClick={handleCopyLink}
          >
            📋 Копировать ссылку
          </Button>

          {isModerator && (
            <Button
              variant="danger"
              size="small"
              onClick={() => setShowEndModal(true)}
            >
              Завершить созвон
            </Button>
          )}
        </div>
      </div>

      <div className={styles.mainArea}>
        <ParticipantGrid
          participants={participants}
          localParticipantId={user?.id?.toString()}
          isModerator={isModerator}
          onMuteParticipant={muteParticipant}
          onKickParticipant={kickParticipant}
        />

        <div className={styles.floatingReactionsLayer} aria-hidden="true">
          {floatingReactions.map((reaction) => (
            <div
              key={reaction.id}
              className={styles.floatingReaction}
              style={{
                '--reaction-x': `${reaction.x}%`,
                '--reaction-y': `${reaction.y}%`,
                '--reaction-drift': `${reaction.drift}px`
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
      </div>

      {showChat && (
        <ChatPanel
          roomId={parseInt(roomId)}
          messages={messages}
          onSendMessage={sendChatMessage}
          onClose={() => setShowChat(false)}
          currentUserId={user?.id}
          _addHistoryMessages={addHistoryMessages}
        />
      )}

      {showParticipants && (
        <ParticipantsPanel
          participants={participants}
          localParticipantId={user?.id?.toString()}
          isModerator={isModerator}
          onMuteParticipant={muteParticipant}
          onKickParticipant={kickParticipant}
          onClose={() => setShowParticipants(false)}
        />
      )}

      <ReactionsBar onSendReaction={sendReaction} />

      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => setShowChat(!showChat)}
        onToggleParticipants={() => setShowParticipants(!showParticipants)}
        onLeave={handleLeave}
        showChat={showChat}
        showParticipants={showParticipants}
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
    </div>
  );
};