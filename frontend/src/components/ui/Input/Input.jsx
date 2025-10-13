import React from 'react';
import styles from './Input.module.css';
import { classNames } from '../../../utils/helpers';

export const Input = ({
  label,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className={classNames(styles.inputContainer, className)}>
      {label && <label className={styles.label}>{label}</label>}
      <input
        className={classNames(styles.input, error && styles.error)}
        {...props}
      />
      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
};