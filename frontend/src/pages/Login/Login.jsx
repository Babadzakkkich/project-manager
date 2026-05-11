import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useAuthContext } from '../../contexts/AuthContext';
import { LoginForm } from '../../components/auth/LoginForm';
import { RegisterForm } from '../../components/auth/RegisterForm';
import styles from './Login.module.css';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { isAuthenticated } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/register') {
      setIsLogin(false);
    } else if (location.pathname === '/login') {
      setIsLogin(true);
    }
  }, [location.pathname]);

  if (isAuthenticated) {
    return <Navigate to="/workspace" replace />;
  }

  const switchToLogin = () => {
    setIsLogin(true);
    navigate('/login');
  };

  const switchToRegister = () => {
    setIsLogin(false);
    navigate('/register');
  };

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />

      <div className={styles.shell}>
        <section className={styles.formPanel}>
          <Link to="/" className={styles.backLink}>
            <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
            На главную
          </Link>

          {isLogin ? (
            <LoginForm onSwitchToRegister={switchToRegister} />
          ) : (
            <RegisterForm onSwitchToLogin={switchToLogin} />
          )}
        </section>

        <section className={styles.infoPanel}>

          <h1 className={styles.title}>
            Вход в среду управления проектной деятельностью
          </h1>

          <p className={styles.subtitle}>
            Авторизуйтесь в Syncro, чтобы перейти к группам, проектам, задачам,
            уведомлениям и рабочим созвонам. Если аккаунта ещё нет, создайте его
            через форму регистрации.
          </p>
        </section>
      </div>
    </main>
  );
};