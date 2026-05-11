import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';

import { Button } from '../Button';
import { conferencesAPI } from '../../../services/api/conferences';
import { useNotification } from '../../../hooks/useNotification';
import { CONFERENCE_ROOM_TYPES } from '../../../utils/constants';
import { handleApiError } from '../../../utils/helpers';
import styles from './StartConferenceButton.module.css';

const getButtonText = (type) => {
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

export const StartConferenceButton = ({
  type,
  id,
  title,
  variant = 'primary',
  size = 'medium',
  className = '',
  onSuccess,
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
        max_participants: 30,
      };

      if (type === CONFERENCE_ROOM_TYPES.PROJECT) {
        roomData.project_id = id;
      } else if (type === CONFERENCE_ROOM_TYPES.GROUP) {
        roomData.group_id = id;
      } else if (type === CONFERENCE_ROOM_TYPES.TASK) {
        roomData.task_id = id;
      }

      const room = await conferencesAPI.createRoom(roomData);

      showSuccess('Созвон создан');

      if (onSuccess) {
        onSuccess(room);
      } else {
        navigate(`/conferences/${room.id}`);
      }
    } catch (error) {
      console.error('Error creating conference:', error);
      showError(handleApiError(error) || 'Не удалось создать созвон');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleStartConference}
      loading={loading}
      disabled={loading}
      className={`${styles.button} ${className}`}
    >
      <Video size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>{loading ? 'Создание...' : getButtonText(type)}</span>
    </Button>
  );
};