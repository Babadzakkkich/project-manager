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

export const ConferenceRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomData, setRoomData] = useState(null); // Загружаем данные комнаты отдельно
  const hasConnected = useRef(false);

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

  // Загружаем информацию о комнате сразу (без подключения к LiveKit)
  useEffect(() => {
    const loadRoomData = async () => {
      try {
        const data = await conferencesAPI.getRoomById(roomId);
        setRoomData(data);
      } catch (err) {
        console.error('Failed to load room data:', err);
        // Если комната не найдена, можно показать ошибку
        navigate('/conferences', { replace: true });
      }
    };
    if (roomId) {
      loadRoomData();
    }
  }, [roomId, navigate]);

  // Подключаемся только после взаимодействия пользователя
  useEffect(() => {
    if (!hasConnected.current && roomId && userInteracted) {
      hasConnected.current = true;
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

  // Сбрасываем флаг joiningRoom после успешного подключения
  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      setJoiningRoom(false);
    }
  }, [connectionState]);

  // Обработка реакций
  useEffect(() => {
    const handleReaction = (event) => {
      const { reaction, participantName } = event.detail;
      setFloatingReaction({ reaction, participantName });
      setTimeout(() => setFloatingReaction(null), 2000);
    };

    window.addEventListener('conference:reaction', handleReaction);
    return () => window.removeEventListener('conference:reaction', handleReaction);
  }, []);

  const handleJoinRoom = () => {
    // Жест пользователя (клик) — AudioContext будет разблокирован
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
    navigator.clipboard?.writeText(url).then(() => {
      // Можно показать уведомление
    }).catch((err) => {
      console.error('Failed to copy:', err);
    });
  };

  // Экран ожидания взаимодействия пользователя
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
                  <span className={styles.joinRoomValue}>{displayRoom.creator.login}</span>
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

  // Состояния загрузки после взаимодействия
  if (joiningRoom || isConnecting || connectionState === ConnectionState.Connecting) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Подключение к созвону...</p>
        <p className={styles.hint}>Пожалуйста, разрешите доступ к микрофону и камере</p>
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
        <Button onClick={() => navigate(-1)}>Вернуться назад</Button>
      </div>
    );
  }

  return (
    <div className={styles.room}>
      {/* Хедер */}
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
            <h2 className={styles.roomTitle}>{roomInfo?.title || 'Созвон'}</h2>
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
          <Button variant="secondary" size="small" onClick={handleCopyLink}>
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

      {/* Основная область с видео */}
      <div className={styles.mainArea}>
        <ParticipantGrid
          participants={participants}
          localParticipantId={user?.id?.toString()}
          isModerator={isModerator}
          onMuteParticipant={muteParticipant}
          onKickParticipant={kickParticipant}
        />

        {/* Плавающая реакция */}
        {floatingReaction && (
          <div className={styles.floatingReaction}>
            <span className={styles.reactionEmoji}>{floatingReaction.reaction}</span>
            <span className={styles.reactionName}>{floatingReaction.participantName}</span>
          </div>
        )}
      </div>

      {/* Чат */}
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

      {/* Панель участников */}
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

      {/* Панель реакций */}
      <ReactionsBar onSendReaction={sendReaction} />

      {/* Панель управления */}
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

      {/* Модальное окно подтверждения завершения */}
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