import React, { useId } from 'react';
import styles from './Input.module.css';
import { classNames } from '../../../utils/helpers';

export const Input = ({
  label,
  error,
  helperText,
  className = '',
  id,
  required = false,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={classNames(styles.inputContainer, className)}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <input
        id={inputId}
        className={classNames(styles.input, error && styles.error)}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId || helperId}
        required={required}
        {...props}
      />

      {helperText && !error && (
        <span id={helperId} className={styles.helperText}>
          {helperText}
        </span>
      )}

      {error && (
        <span id={errorId} className={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
};