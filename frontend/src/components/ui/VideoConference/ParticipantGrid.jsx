import React, { useState, useMemo } from 'react';
import { ParticipantTile } from './ParticipantTile';
import styles from './ParticipantGrid.module.css';

export const ParticipantGrid = ({
  participants,
  localParticipantId,
  isModerator,
  onMuteParticipant,
  onKickParticipant
}) => {
  const [activeSpeakerId] = useState(null);
  
  // Сортируем участников: локальный первый, затем по имени
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.identity === localParticipantId) return -1;
      if (b.identity === localParticipantId) return 1;
      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [participants, localParticipantId]);
  
  // Определяем класс для сетки в зависимости от количества участников
  const gridClass = useMemo(() => {
    const count = sortedParticipants.length;
    if (count <= 1) return styles.grid1;
    if (count <= 2) return styles.grid2;
    if (count <= 4) return styles.grid4;
    if (count <= 6) return styles.grid6;
    if (count <= 9) return styles.grid9;
    return styles.grid12;
  }, [sortedParticipants.length]);
  
  return (
    <div className={`${styles.grid} ${gridClass}`}>
      {sortedParticipants.map((participant) => (
        <ParticipantTile
          key={participant.identity}
          participant={participant}
          isLocal={participant.identity === localParticipantId}
          isModerator={isModerator}
          isActiveSpeaker={participant.identity === activeSpeakerId}
          onMute={onMuteParticipant}
          onKick={onKickParticipant}
        />
      ))}
    </div>
  );
};