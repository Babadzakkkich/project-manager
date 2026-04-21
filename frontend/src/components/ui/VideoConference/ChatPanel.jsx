import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../Button';
import { Input } from '../Input';
import styles from './ChatPanel.module.css';

export const ChatPanel = ({
  messages,
  onSendMessage,
  onClose,
  currentUserId
}) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
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
      
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <span className={styles.emptyIcon}>💬</span>
            <p>Нет сообщений</p>
            <p className={styles.emptyHint}>Напишите первое сообщение</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.sender === currentUserId || msg.isLocal;
            return (
              <div
                key={msg.id}
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