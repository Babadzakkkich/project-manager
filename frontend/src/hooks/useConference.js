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
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const audioEnabledRef = useRef(false);
  const videoEnabledRef = useRef(false);
  const connectingRef = useRef(false);
  const roomRef = useRef(null);
  const hasConnectedRef = useRef(false);
  
  const handleDataMessageRef = useRef(null);
  const updateParticipantsRef = useRef(null);
  
  const createReactionId = () => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `reaction_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const createReactionPosition = () => {
    return {
      x: Math.round(18 + Math.random() * 64),
      y: Math.round(18 + Math.random() * 50),
      drift: Math.round(-30 + Math.random() * 60),
    };
  };

  const dispatchReactionEvent = useCallback((reactionPayload) => {
    const reactionEvent = new CustomEvent('conference:reaction', {
      detail: reactionPayload
    });

    window.dispatchEvent(reactionEvent);
  }, []);

  const updateParticipants = useCallback((currentRoom) => {
    if (!currentRoom) return;
    
    const allParticipants = [
      currentRoom.localParticipant,
      ...currentRoom.remoteParticipants.values()
    ];

    setParticipants(allParticipants);
  }, []);
  
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
      setIsAudioEnabled(false);
      setIsVideoEnabled(false);
      setIsScreenSharing(false);

      audioEnabledRef.current = false;
      videoEnabledRef.current = false;
      
      try {
        if (roomId) {
          await conferencesAPI.leaveRoom(roomId);
        }
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }
  }, [roomId]);
  
  const addHistoryMessages = useCallback((olderMessages) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(msg => msg.id));
      const newMessages = olderMessages.filter(msg => !existingIds.has(msg.id));

      return [...newMessages, ...prev];
    });
  }, []);
  
  const handleModeratorAction = useCallback((data) => {
    if (data.action === 'mute') {
      if (data.targetId === user?.id?.toString()) {
        roomRef.current?.localParticipant.setMicrophoneEnabled(false);
        audioEnabledRef.current = false;
        setIsAudioEnabled(false);
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
    if (!participant) {
      return;
    }

    console.log('handleDataMessage called:', {
      data,
      participantId: participant.identity
    });
    
    if (data.type === 'chat') {
      const isLocalMessage = messages.some(msg => 
        msg.id === data.messageId || 
        (
          msg.isLocal &&
          msg.message === data.message &&
          Math.abs(new Date(msg.timestamp) - new Date(data.timestamp || Date.now())) < 5000
        )
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
      
      setMessages(prev => [...prev, newMessage]);
      return;
    }

    if (data.type === 'reaction') {
      dispatchReactionEvent({
        id: data.reactionId || createReactionId(),
        reaction: data.reaction,
        participantId: participant.identity,
        participantName: participant.name || participant.identity,
        x: data.x,
        y: data.y,
        drift: data.drift,
        createdAt: data.createdAt || new Date().toISOString()
      });
      return;
    }

    if (data.type === 'moderator_action') {
      handleModeratorAction(data);
      return;
    }

    console.log('Unknown data message type:', data.type);
  }, [handleModeratorAction, messages, dispatchReactionEvent]);
  
  useEffect(() => {
    handleDataMessageRef.current = handleDataMessage;
  }, [handleDataMessage]);
  
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
      .on(RoomEvent.Reconnected, () => {
        console.log('LiveKit: Reconnected');
        setConnectionState(ConnectionState.Connected);
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
        console.log(`LiveKit: Track subscribed: ${track.kind} from ${participant.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`LiveKit: Track unsubscribed: ${track.kind} from ${participant.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        console.log(`LiveKit: Track muted from ${participant?.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        console.log(`LiveKit: Track unmuted from ${participant?.identity}`);
        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        console.log('LiveKit: Local track published');

        if (publication?.source === 'screen_share') {
          setIsScreenSharing(true);
        }

        updateParticipantsRef.current?.(newRoom);
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        console.log('LiveKit: Local track unpublished');

        if (publication?.source === 'screen_share') {
          setIsScreenSharing(false);
        }

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
      
      subscribeToRoomEvents(newRoom);
      
      roomRef.current = newRoom;
      setRoom(newRoom);
      
      await newRoom.connect(joinData.ws_url, joinData.token, {
        rtcConfig: {
          iceTransportPolicy: 'all'
        }
      });

      setLocalParticipant(newRoom.localParticipant);
      updateParticipants(newRoom);
    } catch (err) {
      console.error('Failed to connect to conference:', err);
      setError(err.message || 'Не удалось подключиться к созвону');
      setIsConnecting(false);
      connectingRef.current = false;
      hasConnectedRef.current = false;
      roomRef.current = null;
    }
  }, [roomId, subscribeToRoomEvents, updateParticipants]);
  
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const enabled = !audioEnabledRef.current;

      await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);

      audioEnabledRef.current = enabled;
      setIsAudioEnabled(enabled);
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle audio:', err);
      showError('Не удалось переключить микрофон');
    }
  }, [updateParticipants, showError]);
  
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const enabled = !videoEnabledRef.current;

      await roomRef.current.localParticipant.setCameraEnabled(enabled);

      videoEnabledRef.current = enabled;
      setIsVideoEnabled(enabled);
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle video:', err);
      showError('Не удалось переключить камеру');
    }
  }, [updateParticipants, showError]);
  
  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    
    try {
      const localParticipant = roomRef.current.localParticipant;
      const isSharing = Boolean(localParticipant.isScreenShareEnabled);

      await localParticipant.setScreenShareEnabled(!isSharing);

      setIsScreenSharing(!isSharing);
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error('Failed to toggle screen share:', err);
      showError('Не удалось переключить демонстрацию экрана');
    }
  }, [updateParticipants, showError]);
  
  const sendChatMessage = useCallback(async (message) => {
    if (!roomRef.current) return;
    
    const trimmedMessage = message.trim();

    if (!trimmedMessage) return;
    
    try {
      const savedMessage = await conferencesAPI.sendRoomMessage(roomId, trimmedMessage);
      
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
      
      const tempId = Date.now() + Math.random();
      const timestamp = new Date().toISOString();

      const data = {
        type: 'chat',
        message: trimmedMessage,
        messageId: tempId,
        timestamp
      };
      
      const encoder = new TextEncoder();

      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        DataPacket_Kind.RELIABLE
      );
      
      setMessages(prev => [...prev, {
        id: tempId,
        sender: roomRef.current.localParticipant.identity,
        senderName: roomRef.current.localParticipant.name || 'Вы',
        message: trimmedMessage,
        timestamp,
        isLocal: true
      }]);
    }
  }, [roomId]);
  
  const sendReaction = useCallback((reaction) => {
    if (!roomRef.current || !reaction) return;
    
    const reactionId = createReactionId();
    const position = createReactionPosition();
    const createdAt = new Date().toISOString();

    const data = {
      type: 'reaction',
      reaction,
      reactionId,
      createdAt,
      ...position
    };
    
    const encoder = new TextEncoder();

    roomRef.current.localParticipant.publishData(
      encoder.encode(JSON.stringify(data)),
      DataPacket_Kind.RELIABLE
    );

    dispatchReactionEvent({
      id: reactionId,
      reaction,
      participantId: roomRef.current.localParticipant.identity,
      participantName: roomRef.current.localParticipant.name || 'Вы',
      createdAt,
      ...position
    });
  }, [dispatchReactionEvent]);
  
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
  
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
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

    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing
  };
};