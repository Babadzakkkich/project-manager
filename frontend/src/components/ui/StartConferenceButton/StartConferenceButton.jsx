import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { conferencesAPI } from '../../../services/api/conferences';
import { useNotification } from '../../../hooks/useNotification';
import { CONFERENCE_ROOM_TYPES } from '../../../utils/constants';
import {
  CONFERENCE_ICONS,
  renderIconComponent,
} from '../../../utils/icons';
import styles from './StartConferenceButton.module.css';

export const StartConferenceButton = ({
  type,
  id,
  title,
  variant = 'primary',
  size = 'medium',
  className = '',
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  
  const handleStartConference = async () => {
    setLoading(true);
    
    try {
      const roomData = {
        title: title || `Созвон ${new Date().toLocaleString('ru-RU')}`,
        room_type: type,
        max_participants: 30
      };
      
      // Добавляем ID сущности в зависимости от типа
      if (type === CONFERENCE_ROOM_TYPES.PROJECT) {
        roomData.project_id = id;
      } else if (type === CONFERENCE_ROOM_TYPES.GROUP) {
        roomData.group_id = id;
      } else if (type === CONFERENCE_ROOM_TYPES.TASK) {
        roomData.task_id = id;
      }
      
      const room = await conferencesAPI.createRoom(roomData);
      
      showSuccess('Созвон создан!');
      
      if (onSuccess) {
        onSuccess(room);
      } else {
        // Переходим на страницу созвона
        navigate(`/conferences/${room.id}`);
      }
      
    } catch (error) {
      console.error('Error creating conference:', error);
      const errorMessage = error.response?.data?.detail || 'Не удалось создать созвон';
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  const getButtonText = () => {
    switch (type) {
      case CONFERENCE_ROOM_TYPES.PROJECT:
        return 'Созвон по проекту';
      case CONFERENCE_ROOM_TYPES.GROUP:
        return 'Созвон по группе';
      case CONFERENCE_ROOM_TYPES.TASK:
        return 'Обсудить задачу';
      default:
        return 'Начать созвон';
    }
  };
  
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleStartConference}
      loading={loading}
      className={`${styles.button} ${className}`}
    >
      {renderIconComponent(CONFERENCE_ICONS.START, { size: 18 })}
      {getButtonText()}
    </Button>
  );
};
