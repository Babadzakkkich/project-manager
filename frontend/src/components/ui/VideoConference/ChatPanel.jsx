import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../Button';
import { Input } from '../Input';
import { conferencesAPI } from '../../../services/api/conferences';
import styles from './ChatPanel.module.css';

export const ChatPanel = ({
  roomId,
  messages,
  onSendMessage,
  onClose,
  currentUserId,
  _addHistoryMessages
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Прокручиваем вниз при новых сообщениях
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Загрузка старых сообщений при прокрутке вверх
  const handleScroll = useCallback(async () => {
    const container = messagesContainerRef.current;
    if (!container || loadingHistory || !hasMore) return;
    
    // Если прокрутили вверх до верха
    if (container.scrollTop === 0) {
      setLoadingHistory(true);
      
      // Сохраняем текущую высоту для сохранения позиции скролла
      const previousHeight = container.scrollHeight;
      
      try {
        const oldestMessage = messages[0];
        const olderMessages = await conferencesAPI.getRoomMessages(roomId, {
          limit: 50,
          before_id: oldestMessage?.id
        });
        
        if (olderMessages.length < 50) {
          setHasMore(false);
        }
        
        // Добавляем старые сообщения в начало (если они есть)
        if (olderMessages.length > 0) {
          const formattedOlder = olderMessages.map(msg => ({
            id: msg.id,
            sender: msg.user_id.toString(),
            senderName: msg.user_name,
            message: msg.message,
            timestamp: msg.created_at,
            isLocal: msg.user_id === currentUserId
          }));
          
          if (typeof _addHistoryMessages === 'function') {
            _addHistoryMessages(formattedOlder);
          }
        }
      } catch (err) {
        console.error('Failed to load older messages:', err);
      } finally {
        setLoadingHistory(false);
        
        // Восстанавливаем позицию скролла после добавления старых сообщений
        setTimeout(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - previousHeight;
          }
        }, 0);
      }
    }
  }, [roomId, messages, loadingHistory, hasMore, currentUserId, _addHistoryMessages]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };
  
  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className={styles.chatPanel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Чат</h3>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>
      
      <div 
        className={styles.messages} 
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loadingHistory && (
          <div className={styles.loadingHistory}>
            <div className={styles.spinner}></div>
            <span>Загрузка сообщений...</span>
          </div>
        )}
        
        {!hasMore && messages.length > 0 && (
          <div className={styles.noMoreMessages}>
            Это начало истории сообщений
          </div>
        )}
        
        {messages.length === 0 && !loadingHistory ? (
          <div className={styles.emptyMessages}>
            <span className={styles.emptyIcon}>💬</span>
            <p>Нет сообщений</p>
            <p className={styles.emptyHint}>Напишите первое сообщение</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.isLocal || msg.sender === currentUserId?.toString();
            return (
              <div
                key={msg.id || `${msg.sender}-${msg.timestamp}`}
                className={`${styles.message} ${isLocal ? styles.local : ''}`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.sender}>{msg.senderName}</span>
                  <span className={styles.time}>
                    {formatMessageTime(msg.timestamp)}
                  </span>
                </div>
                <div className={styles.messageContent}>{msg.message}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Введите сообщение..."
          className={styles.input}
        />
        <Button type="submit" variant="primary" size="small">
          Отправить
        </Button>
      </form>
    </div>
  );
};