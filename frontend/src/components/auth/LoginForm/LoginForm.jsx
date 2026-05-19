import React, { useState } from 'react';
import { LogIn } from 'lucide-react';

import { useAuthContext } from '../../../contexts/AuthContext';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { FIELD_LIMITS, normalizeTextInput, validatePasswordField } from '../../../utils/validation';
import styles from './LoginForm.module.css';

const LOGIN_LIMIT = FIELD_LIMITS.USER_LOGIN;
const PASSWORD_LIMIT = FIELD_LIMITS.USER_PASSWORD;

export const LoginForm = ({ onSwitchToRegister }) => {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { login } = useAuthContext();

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name] || errors.submit) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
        submit: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.login.trim()) {
      newErrors.login = 'Логин обязателен';
    } else if (formData.login.length > LOGIN_LIMIT) {
      newErrors.login = `Логин не должен превышать ${LOGIN_LIMIT} символов`;
    }

    const passwordError = validatePasswordField(formData.password);

    if (passwordError) {
      newErrors.password = passwordError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const result = await login({
      ...formData,
      login: normalizeTextInput(formData.login),
    });
    setLoading(false);

    if (!result.success) {
      setErrors({ submit: result.error });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>

        <div>
          <h1 className={styles.title}>Вход в Syncro</h1>
          <p className={styles.subtitle}>
            Введите данные аккаунта, чтобы перейти в рабочее пространство.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Логин"
          name="login"
          type="text"
          value={formData.login}
          onChange={handleChange}
          error={errors.login}
          placeholder="Введите логин"
          disabled={loading}
          autoComplete="username"
          maxLength={LOGIN_LIMIT}
        />

        <Input
          label="Пароль"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          placeholder="Введите пароль"
          disabled={loading}
          autoComplete="current-password"
          maxLength={PASSWORD_LIMIT}
        />

        {errors.submit && (
          <div className={styles.submitError} role="alert">
            {errors.submit}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="large"
          loading={loading}
          className={styles.submitButton}
        >
          Войти
        </Button>
      </form>

      <div className={styles.footer}>
        <span>Нет аккаунта?</span>

        <button
          type="button"
          className={styles.switchButton}
          onClick={onSwitchToRegister}
          disabled={loading}
        >
          Создать аккаунт
        </button>
      </div>
    </div>
  );
};