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
  to, // Добавляем поддержку ссылок
  ...props 
}) => {
  const buttonClass = classNames(
    styles.button,
    styles[variant],
    styles[size],
    disabled && styles.disabled,
    loading && styles.loading,
    className
  );

  // Если передан to, рендерим как Link
  if (to) {
    return (
      <Link
        to={to}
        className={buttonClass}
        {...props}
      >
        {loading ? 'Загрузка...' : children}
      </Link>
    );
  }

  // Иначе как обычную кнопку
  return (
    <button
      className={buttonClass}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Загрузка...' : children}
    </button>
  );
};