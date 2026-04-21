// SRC/COMPONENTS/UI/VIDEOCONFERENCE/REACTIONSBAR.JSX

import React, { useState } from 'react';
import styles from './ReactionsBar.module.css';

const REACTIONS = [
  { emoji: '👍', name: 'like' },
  { emoji: '👎', name: 'dislike' },
  { emoji: '🎉', name: 'celebrate' },
  { emoji: '❓', name: 'question' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '👏', name: 'clap' }
];

export const ReactionsBar = ({ onSendReaction }) => {
  const [showReactions, setShowReactions] = useState(false);
  
  const handleReaction = (reaction) => {
    onSendReaction(reaction.emoji);
    setShowReactions(false);
  };
  
  return (
    <div className={styles.reactionsBar}>
      <button
        className={styles.reactionsButton}
        onClick={() => setShowReactions(!showReactions)}
        title="Реакции"
      >
        <span className={styles.icon}>😊</span>
      </button>
      
      {showReactions && (
        <div className={styles.reactionsPanel}>
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.name}
              className={styles.reactionButton}
              onClick={() => handleReaction(reaction)}
              title={reaction.name}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};