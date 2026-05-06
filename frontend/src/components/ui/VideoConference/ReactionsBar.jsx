import React, { useEffect, useRef, useState } from 'react';
import {
  CONFERENCE_ICONS,
  renderIconComponent,
} from '../../../utils/icons';
import styles from './ReactionsBar.module.css';

const REACTIONS = [
  { emoji: '👍', name: 'Нравится' },
  { emoji: '👏', name: 'Аплодисменты' },
  { emoji: '😂', name: 'Смех' },
  { emoji: '❤️', name: 'Сердце' },
  { emoji: '🔥', name: 'Огонь' },
  { emoji: '🎉', name: 'Праздник' },
  { emoji: '🤔', name: 'Думаю' },
  { emoji: '👀', name: 'Смотрю' },
];

export const ReactionsBar = ({ onSendReaction }) => {
  const [showReactions, setShowReactions] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        !showReactions ||
        panelRef.current?.contains(event.target) ||
        buttonRef.current?.contains(event.target)
      ) {
        return;
      }

      setShowReactions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showReactions]);

  const handleReaction = (reaction) => {
    onSendReaction?.(reaction.emoji);

    // Важно: панель намеренно не закрываем.
    // Так можно быстро нажимать несколько реакций подряд.
  };

  return (
    <div className={styles.reactionsBar}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.reactionsButton} ${showReactions ? styles.active : ''}`}
        onClick={() => setShowReactions(prev => !prev)}
        title="Реакции"
        aria-label="Реакции"
        aria-expanded={showReactions}
      >
        <span className={styles.icon}>
          {renderIconComponent(CONFERENCE_ICONS.REACTIONS, { size: 24 })}
        </span>
      </button>
      
      {showReactions && (
        <div
          ref={panelRef}
          className={styles.reactionsPanel}
        >
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.name}
              type="button"
              className={styles.reactionButton}
              onClick={() => handleReaction(reaction)}
              title={reaction.name}
              aria-label={reaction.name}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
