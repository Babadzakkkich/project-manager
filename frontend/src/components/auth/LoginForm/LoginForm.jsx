import React, { useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import styles from './LoginForm.module.css';

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
    }
    
    if (!formData.password) {
      newErrors.password = 'Пароль обязателен';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Пароль должен содержать минимум 6 символов';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    const result = await login(formData);
    setLoading(false);
    
    if (!result.success) {
      setErrors({ submit: result.error });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Вход в систему</h1>
        <p className={styles.subtitle}>Добро пожаловать обратно!</p>
      </div>
      
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Логин"
          name="login"
          type="text"
          value={formData.login}
          onChange={handleChange}
          error={errors.login}
          placeholder="Введите ваш логин"
          disabled={loading}
        />
        
        <Input
          label="Пароль"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          placeholder="Введите ваш пароль"
          disabled={loading}
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
          Войти
        </Button>
      </form>
      
      <div className={styles.footer}>
        <p>Ещё нет аккаунта?</p>
        <button 
          type="button" 
          className={styles.switchButton}
          onClick={onSwitchToRegister}
          disabled={loading}
        >
          Зарегистрироваться
        </button>
      </div>
    </div>
  );
};