import React, { useState } from 'react';
import { usersAPI } from '../../../services/api/users';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import styles from './RegisterForm.module.css';

export const RegisterForm = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    login: '',
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.login.trim()) {
      newErrors.login = 'Логин обязателен';
    } else if (formData.login.length < 3) {
      newErrors.login = 'Логин должен содержать минимум 3 символа';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email обязателен';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Введите корректный email';
    }
    
    if (!formData.name.trim()) {
      newErrors.name = 'Имя обязательно';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Имя должно содержать минимум 2 символа';
    }
    
    if (!formData.password) {
      newErrors.password = 'Пароль обязателен';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Пароль должен содержать минимум 6 символов';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Подтверждение пароля обязательно';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
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
        login: formData.login,
        email: formData.email,
        name: formData.name,
        password: formData.password,
      });
      
      setSuccess(true);
      setErrors({});
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Ошибка регистрации';
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successContainer}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Регистрация успешна!</h2>
          <p className={styles.successMessage}>
            Ваш аккаунт был успешно создан. Теперь вы можете войти в систему.
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
        <h1 className={styles.title}>Регистрация</h1>
        <p className={styles.subtitle}>Создайте новый аккаунт</p>
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
        />
        
        <Input
          label="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          placeholder="Введите ваш email"
          disabled={loading}
          autoComplete="email"
        />
        
        <Input
          label="Имя"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          placeholder="Введите ваше имя"
          disabled={loading}
          autoComplete="name"
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
        />
        
        {errors.submit && (
          <div className={styles.submitError}>{errors.submit}</div>
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
        <p>Уже есть аккаунт?</p>
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