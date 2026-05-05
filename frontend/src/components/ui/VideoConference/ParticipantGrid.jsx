import React, { useEffect, useMemo, useState } from 'react';
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
  const [focusedParticipantId, setFocusedParticipantId] = useState(null);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.identity === localParticipantId) return -1;
      if (b.identity === localParticipantId) return 1;

      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [participants, localParticipantId]);

  useEffect(() => {
    if (!focusedParticipantId) {
      return;
    }

    const focusedParticipantStillExists = sortedParticipants.some(
      participant => participant.identity === focusedParticipantId
    );

    if (!focusedParticipantStillExists) {
      setFocusedParticipantId(null);
    }
  }, [focusedParticipantId, sortedParticipants]);

  const visibleParticipants = useMemo(() => {
    if (!focusedParticipantId) {
      return sortedParticipants;
    }

    return sortedParticipants.filter(
      participant => participant.identity === focusedParticipantId
    );
  }, [sortedParticipants, focusedParticipantId]);

  const gridClass = useMemo(() => {
    if (focusedParticipantId) {
      return styles.focusedGrid;
    }

    const count = visibleParticipants.length;

    if (count <= 1) return styles.grid1;
    if (count <= 2) return styles.grid2;
    if (count <= 4) return styles.grid4;
    if (count <= 6) return styles.grid6;
    if (count <= 9) return styles.grid9;

    return styles.grid12;
  }, [visibleParticipants.length, focusedParticipantId]);

  const handleParticipantClick = (event, participant) => {
    const clickedInteractiveElement = event.target.closest(
      'button, a, input, textarea, select, [role="button"]'
    );

    if (clickedInteractiveElement) {
      return;
    }

    if (participant.identity === localParticipantId) {
      return;
    }

    setFocusedParticipantId(prevFocusedId =>
      prevFocusedId === participant.identity ? null : participant.identity
    );
  };

  return (
    <div className={`${styles.grid} ${gridClass}`}>
      {visibleParticipants.map((participant) => {
        const isLocal = participant.identity === localParticipantId;
        const isFocused = focusedParticipantId === participant.identity;
        const isFocusable = !isLocal;

        return (
          <div
            key={participant.identity}
            className={`${styles.participantShell} ${
              isFocused ? styles.focusedShell : ''
            } ${isFocusable ? styles.focusableShell : ''}`}
            onClick={(event) => handleParticipantClick(event, participant)}
            title={
              isFocusable
                ? isFocused
                  ? 'Нажмите, чтобы вернуться к сетке'
                  : 'Нажмите, чтобы сфокусироваться на участнике'
                : undefined
            }
          >
            <ParticipantTile
              participant={participant}
              isLocal={isLocal}
              isModerator={isModerator}
              isActiveSpeaker={participant.identity === activeSpeakerId}
              onMute={onMuteParticipant}
              onKick={onKickParticipant}
            />
          </div>
        );
      })}
    </div>
  );
};