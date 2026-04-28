import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  DataPacket_Kind,
} from 'livekit-client';
import { conferencesAPI } from '../services/api/conferences';
import { useNotification } from './useNotification';
import { useAuthContext } from '../contexts/AuthContext';

export const useConference = (roomId) => {
  const { user } = useAuthContext();
  const { showError, showSuccess } = useNotification();
  
  const [room, setRoom] = useState(null);
  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState([]);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isModerator, setIsModerator] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);
  
  const audioEnabledRef = useRef(false);
  const videoEnabledRef = useRef(false);
  const connectingRef = useRef(false);
  const roomRef = useRef(null);
  const hasConnectedRef = useRef(false);
  
  // Храним актуальные ссылки на функции в ref'ах
  const handleDataMessageRef = useRef(null);
  const updateParticipantsRef = useRef(null);
  
  // Функция обновления списка участников
  const updateParticipants = useCallback((currentRoom) => {
    if (!currentRoom) return;
    
    const allParticipants = [
      currentRoom.localParticipant,
      ...currentRoom.remoteParticipants.values()
    ];
    setParticipants(allParticipants);
  }, []);
  
  // Обновляем ref при каждом изменении updateParticipants
  useEffect(() => {
    updateParticipantsRef.current = updateParticipants;
  }, [updateParticipants]);
  
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      connectingRef.current = false;
      hasConnectedRef.current = false;
      setRoom(null);
      setParticipants([]);
      setLocalParticipant(null);
      setMessages([]);
      setConnectionState(ConnectionState.Disconnected);
      
      try {
        if (roomId) {
          await conferencesAPI.leaveRoom(roomId);
        }
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }
  }, [roomId]);
  
  // Добавление сообщений из истории (для ChatPanel)
  const addHistoryMessages = useCallback((olderMessages) => {
    setMessages(prev => {
      // Избегаем дублирования по ID
      const existingIds = new Set(prev.map(msg => msg.id));
      const newMessages = olderMessages.filter(msg => !existingIds.has(msg.id));
      return [...newMessages, ...prev];
    });
  }, []);
  
  // Обработчик действий модератора
  const handleModeratorAction = useCallback((data) => {
    if (data.action === 'mute') {
      if (data.targetId === user?.id?.toString()) {
        roomRef.current?.localParticipant.setMicrophoneEnabled(false);
        audioEnabledRef.current = false;
        showError('Модератор отключил ваш микрофон');
      }
    } else if (data.action === 'kick') {
      if (data.targetId === user?.id?.toString()) {
        showError('Вы были удалены из созвона');
        disconnect();
      }
    }
  }, [user?.id, showError, disconnect]);
  
  // Обработчик получения данных (чат, реакции, действия модератора)
  const handleDataMessage = useCallback((data, participant) => {
    console.log('handleDataMessage called:', { data, participantId: participant.identity });
    
    if (data.type === 'chat') {
      // Проверяем, не наше ли это сообщение (избегаем дублирования)
      const isLocalMessage = messages.some(msg => 
        msg.id === data.messageId || 
        (msg.isLocal && msg.message === data.message && 
         Math.abs(new Date(msg.timestamp) - new Date(data.timestamp || Date.now())) < 5000)
      );
      
      if (isLocalMessage) {
        console.log('Skipping local message duplicate');
        return;
      }
      
      const newMessage = {
        id: data.messageId || Date.now() + Math.random(),
        sender: participant.identity,
        senderName: participant.name || participant.identity,
        message: data.message,
        timestamp: data.timestamp || new Date().toISOString()
      };
      
      console.log('Adding chat message:', newMessage);
      setMessages(prev => [...prev, newMessage]);
    } else if (data.type === 'reaction') {
      const reactionEvent = new CustomEvent('conference:reaction', {
        detail: {
          reaction: data.reaction,
          participantId: participant.identity,
          participantName: participant.name || participant.identity
        }
      });
      window.dispatchEvent(reactionEvent);
    } else if (data.type === 'moderator_action') {
      handleModeratorAction(data);
    } else {
      console.log('Unknown data message type:', data.type);
    }
  }, [handleModeratorAction, messages]);
  
  // Обновляем ref при каждом изменении handleDataMessage
  useEffect(() => {
    handleDataMessageRef.current = handleDataMessage;
  }, [handleDataMessage]);
  
  // Подписка на события комнаты
  const subscribeToRoomEvents = useCallback((newRoom) => {
    newRoom
      .on(RoomEvent.Connected, () => {
        console.log('LiveKit: Connected to room');
        setConnectionState(ConnectionState.Connected);
        setIsConnecting(false);
        connectingRef.current = false;
        hasConnectedRef.current = true;
        showSuccess('Подключено к созвону');
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('LiveKit: Disconnected from room');
        setConnectionState(ConnectionState.Disconnected);
        roomRef.current = null;
        hasConnectedRef.current = false;
      })
      .on(RoomEvent.Reconnecting, () => {
        console.log('LiveKit: Reconnecting...');
        setConnectionState(ConnectionState.Reconnecting);
      })
      .on(RoomEvent.ParticipantConnected, () => {
        console.log('LiveKit: Participant connected');
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        console.log('LiveKit: Participant disconnected');
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log(`=== TrackSubscribed ===`);
        console.log(`Track kind: ${track.kind}`);
        console.log(`From participant: ${participant.identity} (${participant.name})`);
        console.log(`Is muted: ${track.isMuted}`);
        console.log(`========================`);
        
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`LiveKit: Track unsubscribed: ${track.kind} from ${participant.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      
      // === НОВОЕ: обработка включения/выключения микрофона удалённым участником ===
      .on(RoomEvent.TrackMuted, (track, participant) => {
        console.log(`LiveKit: Track muted: ${track.kind} from ${participant.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackUnmuted, (track, participant) => {
        console.log(`LiveKit: Track unmuted: ${track.kind} from ${participant.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      // ===================================================================
      
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        console.log(`LiveKit: Local track published: ${publication.kind}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        console.log(`LiveKit: Local track unpublished: ${publication.kind}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          handleDataMessageRef.current?.(data, participant);
        } catch (e) {
          console.error('Failed to parse data message:', e);
        }
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('LiveKit: Connection state changed:', state);
        setConnectionState(state);
      })
      .on(RoomEvent.MediaDevicesError, (e) => {
        console.error('LiveKit: Media devices error:', e);
      })
      .on(RoomEvent.SignalConnected, () => {
        console.log('LiveKit: Signal connected');
      });
  }, [showSuccess]);
  
  // Подключение к комнате
  const connect = useCallback(async () => {
    if (!roomId || connectingRef.current || hasConnectedRef.current) {
      console.log('Already connecting, connected, or no roomId');
      return;
    }
    
    connectingRef.current = true;
    setIsConnecting(true);
    setError(null);
    
    try {
      const joinData = await conferencesAPI.joinRoom(roomId);
      
      setRoomInfo(joinData.room);
      setIsModerator(joinData.is_moderator);
      
      console.log('LiveKit connection data received:', {
        roomName: joinData.room.room_name,
        wsUrl: joinData.ws_url,
        isModerator: joinData.is_moderator
      });
      
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 30 }
        },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Подписываемся на события ДО подключения
      subscribeToRoomEvents(newRoom);
      
      roomRef.current = newRoom;
      setRoom(newRoom);
      
      console.log(`Connecting to LiveKit at ${joinData.ws_url}`);
      await newRoom.connect(joinData.ws_url, joinData.token, {
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
          iceTransportPolicy: 'all',
        }
      });
      console.log('LiveKit connection established');
      
      // Загружаем историю сообщений
      try {
        const historyMessages = await conferencesAPI.getRoomMessages(roomId);
        const formattedHistory = historyMessages.map(msg => ({
          id: msg.id,
          sender: msg.user_id.toString(),
          senderName: msg.user_name,
          message: msg.message,
          timestamp: msg.created_at,
          isLocal: msg.user_id === user?.id
        }));
        setMessages(formattedHistory);
        console.log(`Loaded ${formattedHistory.length} history messages`);
      } catch (err) {
        console.error('Failed to load message history:', err);
      }
      
      audioEnabledRef.current = false;
      videoEnabledRef.current = false;
      
      updateParticipants(newRoom);
      setLocalParticipant(newRoom.localParticipant);
      
    } catch (err) {
      console.error('Failed to connect to conference:', err);
      
      let errorMessage = 'Не удалось подключиться к созвону';
      
      if (err.message?.includes('could not establish pc connection')) {
        errorMessage = 'Не удалось установить соединение. Проверьте подключение к интернету и настройки сети.';
      } else if (err.message?.includes('unauthorized')) {
        errorMessage = 'Ошибка авторизации. Попробуйте перезайти в систему.';
      } else if (err.message?.includes('room not found')) {
        errorMessage = 'Комната не найдена. Возможно, созвон уже завершен.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      showError(errorMessage);
      connectingRef.current = false;
      hasConnectedRef.current = false;
      setIsConnecting(false);
    }
  }, [roomId, user?.id, showError, subscribeToRoomEvents, updateParticipants]);
  
  // Управление микрофоном
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const enabled = !audioEnabledRef.current;
      await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      audioEnabledRef.current = enabled;
      console.log(`Microphone ${enabled ? 'enabled' : 'disabled'}`);
      // НЕМЕДЛЕННО обновляем участников, чтобы UI отразил изменения
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle audio:', err);
      showError('Не удалось переключить микрофон');
    }
  }, [updateParticipants, showError]);
  
  // Управление камерой
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const enabled = !videoEnabledRef.current;
      await roomRef.current.localParticipant.setCameraEnabled(enabled);
      videoEnabledRef.current = enabled;
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle video:', err);
      showError('Не удалось переключить камеру');
    }
  }, [updateParticipants, showError]);
  
  // Демонстрация экрана
  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const isSharing = roomRef.current.localParticipant.isScreenShareEnabled;
      
      if (isSharing) {
        await roomRef.current.localParticipant.stopScreenShare();
      } else {
        await roomRef.current.localParticipant.setScreenShareEnabled(true);
      }
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle screen share:', err);
      showError('Не удалось переключить демонстрацию экрана');
    }
  }, [updateParticipants, showError]);
  
  // Отправка сообщения в чат
  const sendChatMessage = useCallback(async (message) => {
    if (!roomRef.current) return;
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    
    // Сначала сохраняем на сервере
    try {
      const savedMessage = await conferencesAPI.sendRoomMessage(roomId, trimmedMessage);
      
      // Отправляем через LiveKit Data канал с ID из БД
      const data = {
        type: 'chat',
        message: trimmedMessage,
        messageId: savedMessage.id,
        timestamp: savedMessage.created_at
      };
      
      const encoder = new TextEncoder();
      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        DataPacket_Kind.RELIABLE
      );
      
      // Добавляем в локальное состояние с реальным ID
      setMessages(prev => [...prev, {
        id: savedMessage.id,
        sender: roomRef.current.localParticipant.identity,
        senderName: roomRef.current.localParticipant.name || 'Вы',
        message: trimmedMessage,
        timestamp: savedMessage.created_at,
        isLocal: true
      }]);
    } catch (err) {
      console.error('Failed to save message to server:', err);
      
      // Если не удалось сохранить на сервере, отправляем только через LiveKit
      const tempId = Date.now() + Math.random();
      const data = {
        type: 'chat',
        message: trimmedMessage,
        messageId: tempId,
        timestamp: new Date().toISOString()
      };
      
      const encoder = new TextEncoder();
      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        DataPacket_Kind.RELIABLE
      );
      
      // Добавляем локально даже при ошибке
      setMessages(prev => [...prev, {
        id: tempId,
        sender: roomRef.current.localParticipant.identity,
        senderName: roomRef.current.localParticipant.name || 'Вы',
        message: trimmedMessage,
        timestamp: new Date().toISOString(),
        isLocal: true
      }]);
    }
  }, [roomId]);
  
  // Отправка реакции
  const sendReaction = useCallback((reaction) => {
    if (!roomRef.current) return;
    
    const data = {
      type: 'reaction',
      reaction
    };
    
    const encoder = new TextEncoder();
    roomRef.current.localParticipant.publishData(
      encoder.encode(JSON.stringify(data)),
      DataPacket_Kind.RELIABLE
    );
  }, []);
  
  // Отключение микрофона участника (модератор)
  const muteParticipant = useCallback(async (participantId) => {
    if (!roomRef.current || !isModerator) return;
    
    const participant = roomRef.current.remoteParticipants.get(participantId);
    if (participant) {
      const data = {
        type: 'moderator_action',
        action: 'mute',
        targetId: participantId
      };
      
      const encoder = new TextEncoder();
      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        DataPacket_Kind.RELIABLE,
        [participant]
      );
    }
  }, [isModerator]);
  
  // Удаление участника (модератор)
  const kickParticipant = useCallback(async (participantId) => {
    if (!roomRef.current || !isModerator) return;
    
    const participant = roomRef.current.remoteParticipants.get(participantId);
    if (participant) {
      const data = {
        type: 'moderator_action',
        action: 'kick',
        targetId: participantId
      };
      
      const encoder = new TextEncoder();
      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        DataPacket_Kind.RELIABLE,
        [participant]
      );
    }
  }, [isModerator]);
  
  // Завершение конференции
  const endConference = useCallback(async () => {
    if (!roomRef.current || !isModerator) return;
    
    try {
      await conferencesAPI.endConference(roomId);
      showSuccess('Созвон завершен');
      disconnect();
    } catch (err) {
      console.error('Failed to end conference:', err);
      showError('Не удалось завершить созвон');
    }
  }, [roomId, isModerator, disconnect, showSuccess, showError]);
  
  // Состояния аудио/видео
  const isAudioEnabled = useCallback(() => {
    return roomRef.current?.localParticipant?.isMicrophoneEnabled || false;
  }, []);
  
  const isVideoEnabled = useCallback(() => {
    return roomRef.current?.localParticipant?.isCameraEnabled || false;
  }, []);
  
  const isScreenSharing = useCallback(() => {
    return roomRef.current?.localParticipant?.isScreenShareEnabled || false;
  }, []);
  
  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
        hasConnectedRef.current = false;
        connectingRef.current = false;
      }
    };
  }, []);
  
  return {
    room,
    connectionState,
    participants,
    localParticipant,
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
    
    isAudioEnabled: isAudioEnabled(),
    isVideoEnabled: isVideoEnabled(),
    isScreenSharing: isScreenSharing(),
  };
};