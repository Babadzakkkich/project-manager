import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { conferencesAPI } from '../../services/api/conferences';
import { Button } from '../../components/ui/Button';
import { StartConferenceButton } from '../../components/ui/StartConferenceButton';
import { useNotification } from '../../hooks/useNotification';
import { CONFERENCE_ROOM_TYPES, CONFERENCE_ROOM_TYPE_TRANSLATIONS } from '../../utils/constants';
import { formatRelativeTime } from '../../utils/helpers';
import styles from './Conferences.module.css';

export const Conferences = () => {
  const navigate = useNavigate();
  const { showError } = useNotification();
  
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    room_type: CONFERENCE_ROOM_TYPES.INSTANT
  });
  
  const loadRooms = useCallback(async () => {
    try {
      setLoading(true);
      const availableRooms = await conferencesAPI.getAvailableRooms();
      setRooms(availableRooms);
    } catch (err) {
      console.error('Error loading conferences:', err);
      showError('Не удалось загрузить список созвонов');
    } finally {
      setLoading(false);
    }
  }, [showError]);
  
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);
  
  const handleCreateInstant = async () => {
    if (!createForm.title.trim()) {
      showError('Введите название созвона');
      return;
    }
    
    try {
      const room = await conferencesAPI.createRoom({
        title: createForm.title,
        room_type: CONFERENCE_ROOM_TYPES.INSTANT,
        max_participants: 30
      });
      
      setShowCreateModal(false);
      setCreateForm({ title: '', room_type: CONFERENCE_ROOM_TYPES.INSTANT });
      navigate(`/conferences/${room.id}`);
    } catch (err) {
      console.error('Error creating conference:', err);
      showError('Не удалось создать созвон');
    }
  };
  
  const handleJoinRoom = (roomId) => {
    navigate(`/conferences/${roomId}`);
  };
  
  const getRoomTypeIcon = (type) => {
    const icons = {
      [CONFERENCE_ROOM_TYPES.PROJECT]: '📁',
      [CONFERENCE_ROOM_TYPES.GROUP]: '👥',
      [CONFERENCE_ROOM_TYPES.TASK]: '✅',
      [CONFERENCE_ROOM_TYPES.INSTANT]: '📞'
    };
    return icons[type] || '🎥';
  };
  
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка созвонов...</p>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Созвоны</h1>
        <p className={styles.subtitle}>
          Активные видеоконференции
        </p>
        <div className={styles.headerActions}>
          <Button
            variant="primary"
            size="large"
            onClick={() => setShowCreateModal(true)}
          >
            + Создать мгновенный созвон
          </Button>
        </div>
      </div>
      
      {rooms.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🎥</div>
          <h3>Нет активных созвонов</h3>
          <p>Создайте новый созвон или дождитесь, когда кто-то начнёт созвон в вашей группе или проекте</p>
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
          >
            Создать созвон
          </Button>
        </div>
      ) : (
        <div className={styles.roomsGrid}>
          {rooms.map((room) => (
            <div key={room.id} className={styles.roomCard}>
              <div className={styles.roomHeader}>
                <span className={styles.roomType}>
                  {getRoomTypeIcon(room.room_type)} {CONFERENCE_ROOM_TYPE_TRANSLATIONS[room.room_type]}
                </span>
                <span className={`${styles.status} ${room.is_active ? styles.active : ''}`}>
                  {room.is_active ? '🟢 Идёт' : '⚪ Завершён'}
                </span>
              </div>
              
              <h3 className={styles.roomTitle}>{room.title}</h3>
              
              <div className={styles.roomInfo}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Создатель:</span>
                  <span className={styles.infoValue}>
                    {room.creator?.login || 'Неизвестно'}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Участников:</span>
                  <span className={styles.infoValue}>
                    {room.participants_count || 0} / {room.max_participants}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Начат:</span>
                  <span className={styles.infoValue}>
                    {room.started_at ? formatRelativeTime(room.started_at) : '—'}
                  </span>
                </div>
              </div>
              
              {room.is_active && (
                <Button
                  variant="primary"
                  onClick={() => handleJoinRoom(room.id)}
                  className={styles.joinButton}
                >
                  Присоединиться
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Модальное окно создания мгновенного созвона */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Создать мгновенный созвон</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label>Название созвона</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Введите название..."
                  className={styles.input}
                  autoFocus
                />
              </div>
              
              <div className={styles.modalActions}>
                <Button
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateInstant}
                  disabled={!createForm.title.trim()}
                >
                  Создать
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};