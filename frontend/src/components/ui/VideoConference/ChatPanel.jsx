import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronUp,
  Loader2,
  MessageSquareText,
  SendHorizontal,
  X,
} from 'lucide-react';

import { Button } from '../Button';
import { Input } from '../Input';
import { conferencesAPI } from '../../../services/api/conferences';
import styles from './ChatPanel.module.css';

const getMessageKey = (message) => {
  return message.id || `${message.sender}-${message.timestamp}-${message.message}`;
};

const getSenderName = (message) => {
  return message.senderName || message.user_name || 'Участник';
};

const formatMessageTime = (timestamp) => {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);

    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export const ChatPanel = ({
  roomId,
  messages,
  onSendMessage,
  onClose,
  currentUserId,
  _addHistoryMessages,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const safeMessages = useMemo(() => {
    return Array.isArray(messages) ? messages : [];
  }, [messages]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [safeMessages.length, scrollToBottom]);

  const loadOlderMessages = useCallback(async () => {
    const container = messagesContainerRef.current;

    if (!container || loadingHistory || !hasMore || safeMessages.length === 0) {
      return;
    }

    setLoadingHistory(true);

    const previousHeight = container.scrollHeight;

    try {
      const oldestMessage = safeMessages[0];

      const olderMessages = await conferencesAPI.getRoomMessages(roomId, {
        limit: 50,
        before_id: oldestMessage?.id,
      });

      const safeOlderMessages = Array.isArray(olderMessages) ? olderMessages : [];

      if (safeOlderMessages.length < 50) {
        setHasMore(false);
      }

      if (safeOlderMessages.length > 0) {
        const formattedOlderMessages = safeOlderMessages.map((message) => ({
          id: message.id,
          sender: message.user_id?.toString(),
          senderName: message.user_name,
          message: message.message,
          timestamp: message.created_at,
          isLocal: message.user_id === currentUserId,
        }));

        if (typeof _addHistoryMessages === 'function') {
          _addHistoryMessages(formattedOlderMessages);
        }
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoadingHistory(false);

      requestAnimationFrame(() => {
        const currentContainer = messagesContainerRef.current;

        if (currentContainer) {
          const newHeight = currentContainer.scrollHeight;
          currentContainer.scrollTop = newHeight - previousHeight;
        }
      });
    }
  }, [
    roomId,
    safeMessages,
    loadingHistory,
    hasMore,
    currentUserId,
    _addHistoryMessages,
  ]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;

    if (!container) return;

    if (container.scrollTop <= 12) {
      loadOlderMessages();
    }
  }, [loadOlderMessages]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const preparedMessage = newMessage.trim();

    if (!preparedMessage) return;

    onSendMessage(preparedMessage);
    setNewMessage('');
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <aside className={styles.chatPanel} aria-label="Чат созвона">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <MessageSquareText size={15} strokeWidth={2} aria-hidden="true" />
            Чат созвона
          </div>

          <h3 className={styles.title}>
            Сообщения
          </h3>
        </div>

        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
          aria-label="Закрыть чат"
        >
          <X size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div
        className={styles.messages}
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loadingHistory && (
          <div className={styles.loadingHistory}>
            <Loader2
              size={16}
              strokeWidth={2.2}
              className={styles.loadingIcon}
              aria-hidden="true"
            />
            <span>Загрузка истории...</span>
          </div>
        )}

        {!hasMore && safeMessages.length > 0 && (
          <div className={styles.historyStart}>
            <ChevronUp size={14} strokeWidth={2.2} aria-hidden="true" />
            Это начало истории сообщений
          </div>
        )}

        {safeMessages.length === 0 && !loadingHistory ? (
          <div className={styles.emptyMessages}>
            <div className={styles.emptyIcon}>
              <MessageSquareText size={38} strokeWidth={1.8} aria-hidden="true" />
            </div>

            <h4>Сообщений пока нет</h4>

            <p>
              Напишите первое сообщение участникам созвона.
            </p>
          </div>
        ) : (
          safeMessages.map((message) => {
            const isLocal =
              message.isLocal ||
              message.sender === currentUserId?.toString() ||
              message.user_id === currentUserId;

            return (
              <article
                key={getMessageKey(message)}
                className={`${styles.message} ${isLocal ? styles.local : ''}`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.sender}>
                    {isLocal ? 'Вы' : getSenderName(message)}
                  </span>

                  <span className={styles.time}>
                    {formatMessageTime(message.timestamp || message.created_at)}
                  </span>
                </div>

                <div className={styles.messageContent}>
                  {message.message}
                </div>
              </article>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <Input
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Введите сообщение..."
          className={styles.input}
          autoComplete="off"
        />

        <Button
          type="submit"
          variant="primary"
          size="small"
          className={styles.sendButton}
          disabled={!newMessage.trim()}
        >
          <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
          Отправить
        </Button>
      </form>
    </aside>
  );
};