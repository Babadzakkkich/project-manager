import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { LoginForm } from '../../components/auth/LoginForm';
import { RegisterForm } from '../../components/auth/RegisterForm';
import styles from './Login.module.css';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { isAuthenticated } = useAuthContext();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={styles.backgroundPattern}></div>
      </div>
      <div className={styles.content}>
        <div className={styles.formContainer}>
          {isLogin ? (
            <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
          )}
        </div>
        <div className={styles.infoPanel}>
          <h2 className={styles.infoTitle}>Syncro</h2>
          <p className={styles.infoText}>
            Присоединяйтесь к тысячам команд, которые уже используют Syncro для управления своими проектами.
          </p>
          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>👥</span>
              <span>Управление командами</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📊</span>
              <span>Контроль проектов</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>✅</span>
              <span>Постановка задач</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};