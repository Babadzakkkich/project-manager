import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';
import { classNames } from '../../../utils/helpers';

export const Button = ({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  className = '',
  to,
  type = 'button',
  ...props
}) => {
  const isDisabled = disabled || loading;

  const buttonClass = classNames(
    styles.button,
    styles[variant],
    styles[size],
    isDisabled && styles.disabled,
    loading && styles.loading,
    className
  );

  const content = (
    <>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.content}>
        {loading ? 'Загрузка...' : children}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={buttonClass}
        aria-disabled={isDisabled}
        tabIndex={isDisabled ? -1 : undefined}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }

          props.onClick?.(event);
        }}
        {...props}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className={buttonClass}
      disabled={isDisabled}
      type={type}
      {...props}
    >
      {content}
    </button>
  );
};