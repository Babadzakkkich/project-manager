import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

import { usersAPI } from '../../../services/api/users';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import {
  FIELD_LIMITS,
  normalizeTextInput,
  validateEmailField,
  validateLoginField,
  validatePasswordField,
  validateTextField,
} from '../../../utils/validation';
import styles from './RegisterForm.module.css';

const NAME_LIMIT = FIELD_LIMITS.USER_NAME;
const EMAIL_LIMIT = FIELD_LIMITS.USER_EMAIL;
const LOGIN_LIMIT = FIELD_LIMITS.USER_LOGIN;
const PASSWORD_LIMIT = FIELD_LIMITS.USER_PASSWORD;

export const RegisterForm = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    login: '',
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    personalDataAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
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

    const loginError = validateLoginField(formData.login);

    if (loginError) {
      newErrors.login = loginError;
    }

    const emailError = validateEmailField(formData.email);

    if (emailError) {
      newErrors.email = emailError;
    }

    const nameError = validateTextField(formData.name, {
      label: 'Имя',
      min: 2,
      max: NAME_LIMIT,
    });

    if (nameError) {
      newErrors.name = nameError;
    }

    const passwordError = validatePasswordField(formData.password);

    if (passwordError) {
      newErrors.password = passwordError;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Подтверждение пароля обязательно';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
    }

    if (!formData.personalDataAccepted) {
      newErrors.personalDataAccepted = 'Необходимо дать согласие на обработку персональных данных';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await usersAPI.register({
        login: normalizeTextInput(formData.login),
        email: normalizeTextInput(formData.email),
        name: normalizeTextInput(formData.name),
        password: formData.password,
        personal_data_accepted: formData.personalDataAccepted,
      });

      setSuccess(true);
      setErrors({});
    } catch (error) {
      const detail = error.response?.data?.detail;
      const errorMessage = Array.isArray(detail)
        ? detail.map(item => item?.msg || item).join('\n')
        : detail || 'Ошибка регистрации';

      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successContainer}>
          <div className={styles.successIcon}>
            <CheckCircle2 size={34} strokeWidth={2} aria-hidden="true" />
          </div>

          <h2 className={styles.successTitle}>Аккаунт создан</h2>

          <p className={styles.successMessage}>
            Регистрация завершена. Теперь вы можете войти в Syncro и перейти к
            рабочему пространству.
          </p>

          <Button
            variant="primary"
            size="large"
            onClick={onSwitchToLogin}
            className={styles.successButton}
          >
            Войти в систему
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Регистрация</h1>
          <p className={styles.subtitle}>
            Создайте аккаунт, чтобы начать работу с проектами и задачами.
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
          placeholder="Придумайте логин"
          disabled={loading}
          autoComplete="username"
          maxLength={LOGIN_LIMIT}
          helperText={`3–${LOGIN_LIMIT} символов, латиница и цифры`}
        />

        <Input
          label="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          placeholder="Введите email"
          disabled={loading}
          autoComplete="email"
          maxLength={EMAIL_LIMIT}
        />

        <Input
          label="Имя"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          placeholder="Введите имя"
          disabled={loading}
          autoComplete="name"
          maxLength={NAME_LIMIT}
          helperText={`От 2 до ${NAME_LIMIT} символов`}
        />

        <Input
          label="Пароль"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          placeholder="Придумайте пароль"
          disabled={loading}
          autoComplete="new-password"
          maxLength={PASSWORD_LIMIT}
        />

        <Input
          label="Подтверждение пароля"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          placeholder="Повторите пароль"
          disabled={loading}
          autoComplete="new-password"
          maxLength={PASSWORD_LIMIT}
        />


        <div className={styles.consentBlock}>
          <label className={styles.consentLabel}>
            <input
              className={styles.consentCheckbox}
              type="checkbox"
              name="personalDataAccepted"
              checked={formData.personalDataAccepted}
              onChange={handleChange}
              disabled={loading}
            />

            <span>
              Я даю согласие на обработку персональных данных и ознакомлен(а) с{' '}
              <Link to="/privacy" className={styles.consentLink} target="_blank" rel="noopener noreferrer">
                политикой обработки персональных данных
              </Link>
              .
            </span>
          </label>

          {errors.personalDataAccepted && (
            <div className={styles.fieldError} role="alert">
              {errors.personalDataAccepted}
            </div>
          )}
        </div>

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
          Зарегистрироваться
        </Button>
      </form>

      <div className={styles.footer}>
        <span>Уже есть аккаунт?</span>

        <button
          type="button"
          className={styles.switchButton}
          onClick={onSwitchToLogin}
          disabled={loading}
        >
          Войти
        </button>
      </div>
    </div>
  );
};