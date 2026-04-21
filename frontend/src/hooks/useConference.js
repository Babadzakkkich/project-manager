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
  
  // Функция обновления списка участников
  const updateParticipants = useCallback((currentRoom) => {
    if (!currentRoom) return;
    
    const allParticipants = [
      currentRoom.localParticipant,
      ...currentRoom.remoteParticipants.values()
    ];
    setParticipants(allParticipants);
  }, []);
  
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
  
  const handleDataMessage = useCallback((data, participant) => {
    if (data.type === 'chat') {
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        sender: participant.identity,
        senderName: participant.name || participant.identity,
        message: data.message,
        timestamp: new Date().toISOString()
      }]);
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
  }, [handleModeratorAction]);
  
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
      // Получаем данные для подключения
      const joinData = await conferencesAPI.joinRoom(roomId);
      
      setRoomInfo(joinData.room);
      setIsModerator(joinData.is_moderator);
      
      console.log('LiveKit connection data received:', {
        roomName: joinData.room.room_name,
        wsUrl: joinData.ws_url,
        isModerator: joinData.is_moderator
      });
      
      // Создаем комнату LiveKit
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
      
      // Подписываемся на события комнаты
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
          updateParticipants(newRoom);
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          console.log('LiveKit: Participant disconnected');
          updateParticipants(newRoom);
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.log(`LiveKit: Track subscribed: ${track.kind} from ${participant.identity}`);
          updateParticipants(newRoom);
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          console.log(`LiveKit: Track unsubscribed: ${track.kind} from ${participant.identity}`);
          updateParticipants(newRoom);
        })
        .on(RoomEvent.LocalTrackPublished, (publication) => {
          console.log(`LiveKit: Local track published: ${publication.kind}`);
          updateParticipants(newRoom);
        })
        .on(RoomEvent.LocalTrackUnpublished, (publication) => {
          console.log(`LiveKit: Local track unpublished: ${publication.kind}`);
          updateParticipants(newRoom);
        })
        .on(RoomEvent.DataReceived, (payload, participant, kind) => {
          if (kind === DataPacket_Kind.RELIABLE) {
            try {
              const data = JSON.parse(new TextDecoder().decode(payload));
              handleDataMessage(data, participant);
            } catch (e) {
              console.error('Failed to parse data message:', e);
            }
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
      
      roomRef.current = newRoom;
      setRoom(newRoom);
      
      // Подключаемся к LiveKit
      console.log(`Connecting to LiveKit at ${joinData.ws_url}`);
      await newRoom.connect(joinData.ws_url, joinData.token);
      console.log('LiveKit connection established');
      
      // НЕ включаем камеру и микрофон автоматически
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
  }, [roomId, showSuccess, showError, updateParticipants, handleDataMessage]);
  
  // Управление микрофоном
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const enabled = !audioEnabledRef.current;
      await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      audioEnabledRef.current = enabled;
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
  
  const sendChatMessage = useCallback((message) => {
    if (!roomRef.current) return;
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    
    const data = {
      type: 'chat',
      message: trimmedMessage
    };
    
    const encoder = new TextEncoder();
    roomRef.current.localParticipant.publishData(
      encoder.encode(JSON.stringify(data)),
      DataPacket_Kind.RELIABLE
    );
    
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      sender: roomRef.current.localParticipant.identity,
      senderName: roomRef.current.localParticipant.name || 'Вы',
      message: trimmedMessage,
      timestamp: new Date().toISOString(),
      isLocal: true
    }]);
  }, []);
  
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
  
  const isAudioEnabled = useCallback(() => {
    return roomRef.current?.localParticipant.isMicrophoneEnabled || false;
  }, []);
  
  const isVideoEnabled = useCallback(() => {
    return roomRef.current?.localParticipant.isCameraEnabled || false;
  }, []);
  
  const isScreenSharing = useCallback(() => {
    return roomRef.current?.localParticipant.isScreenShareEnabled || false;
  }, []);
  
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
    
    isAudioEnabled: isAudioEnabled(),
    isVideoEnabled: isVideoEnabled(),
    isScreenSharing: isScreenSharing(),
  };
};