import React, { useEffect, useMemo, useState } from 'react';
import { ScreenShare, Users } from 'lucide-react';

import { ParticipantTile } from './ParticipantTile';
import styles from './ParticipantGrid.module.css';

const getParticipantName = (participant) => {
  return participant?.name || participant?.identity || 'Участник';
};

const isParticipantScreenSharing = (participant) => {
  return Boolean(participant?.isScreenShareEnabled);
};

export const ParticipantGrid = ({
  participants,
  localParticipantId,
}) => {
  const [activeSpeakerId] = useState(null);
  const [focusedParticipantId, setFocusedParticipantId] = useState(null);

  const safeParticipants = useMemo(() => {
    return Array.isArray(participants) ? participants : [];
  }, [participants]);

  const sortedParticipants = useMemo(() => {
    return [...safeParticipants].sort((a, b) => {
      if (a.identity === localParticipantId) return -1;
      if (b.identity === localParticipantId) return 1;

      return getParticipantName(a).localeCompare(getParticipantName(b), 'ru-RU');
    });
  }, [safeParticipants, localParticipantId]);

  const screenShareParticipant = useMemo(() => {
    return sortedParticipants.find(isParticipantScreenSharing) || null;
  }, [sortedParticipants]);

  useEffect(() => {
    if (!focusedParticipantId) {
      return;
    }

    const focusedParticipantStillExists = sortedParticipants.some(
      (participant) => participant.identity === focusedParticipantId
    );

    if (!focusedParticipantStillExists) {
      setFocusedParticipantId(null);
    }
  }, [focusedParticipantId, sortedParticipants]);

  const visibleParticipants = useMemo(() => {
    if (focusedParticipantId) {
      return sortedParticipants.filter(
        (participant) => participant.identity === focusedParticipantId
      );
    }

    if (screenShareParticipant) {
      return [
        screenShareParticipant,
        ...sortedParticipants.filter(
          (participant) => participant.identity !== screenShareParticipant.identity
        ),
      ];
    }

    return sortedParticipants;
  }, [sortedParticipants, focusedParticipantId, screenShareParticipant]);

  const gridClass = useMemo(() => {
    if (focusedParticipantId) {
      return styles.focusedGrid;
    }

    if (screenShareParticipant) {
      return styles.screenShareGrid;
    }

    const count = visibleParticipants.length;

    if (count <= 1) return styles.grid1;
    if (count <= 2) return styles.grid2;
    if (count <= 4) return styles.grid4;
    if (count <= 6) return styles.grid6;
    if (count <= 9) return styles.grid9;

    return styles.grid12;
  }, [visibleParticipants.length, focusedParticipantId, screenShareParticipant]);

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

    setFocusedParticipantId((prevFocusedId) =>
      prevFocusedId === participant.identity ? null : participant.identity
    );
  };

  if (visibleParticipants.length === 0) {
    return (
      <div className={styles.emptyGrid}>
        <div className={styles.emptyIcon}>
          <Users size={44} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <h2>В созвоне пока нет участников</h2>

        <p>
          Участники появятся здесь после подключения к комнате.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${gridClass}`}>
      {screenShareParticipant && !focusedParticipantId && (
        <div className={styles.screenShareNotice}>
          <ScreenShare size={15} strokeWidth={2} aria-hidden="true" />
          Демонстрация экрана: {getParticipantName(screenShareParticipant)}
        </div>
      )}

      {visibleParticipants.map((participant) => {
        const isLocal = participant.identity === localParticipantId;
        const isFocused = focusedParticipantId === participant.identity;
        const isFocusable = !isLocal;
        const isScreenShareTile =
          screenShareParticipant?.identity === participant.identity &&
          !focusedParticipantId;

        return (
          <div
            key={participant.identity}
            className={`${styles.participantShell} ${
              isFocused ? styles.focusedShell : ''
            } ${isFocusable ? styles.focusableShell : ''} ${
              isScreenShareTile ? styles.screenShareShell : ''
            }`}
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
              isActiveSpeaker={participant.identity === activeSpeakerId}
            />
          </div>
        );
      })}
    </div>
  );
};