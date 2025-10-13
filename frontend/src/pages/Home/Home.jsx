import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import styles from './Home.module.css';

export const Home = () => {
  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.title}>
            Проектный менеджер
            <span className={styles.highlight}> Syncro</span>
          </h1>
          <p className={styles.subtitle}>
            Эффективное управление проектами, задачами и командами. 
            Создавайте группы, распределяйте задачи и достигайте целей вместе.
          </p>
          <div className={styles.buttons}>
            <Link to="/register">
              <Button variant="primary" size="large">
                Начать
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="primary" size="large">
                Войти
              </Button>
            </Link>
          </div>
        </div>
        <div className={styles.graphic}>
          <div className={styles.circle}></div>
          <div className={styles.square}></div>
          <div className={styles.triangle}></div>
        </div>
      </div>
      
      <div className={styles.features}>
        <div className={styles.feature}>
          <h3>👥 Управление командами</h3>
          <p>Создавайте группы и эффективно распределяйте роли</p>
        </div>
        <div className={styles.feature}>
          <h3>📊 Контроль проектов</h3>
          <p>Отслеживайте прогресс и сроки выполнения</p>
        </div>
        <div className={styles.feature}>
          <h3>✅ Постановка задач</h3>
          <p>Четко формулируйте цели и назначайте ответственных</p>
        </div>
      </div>
    </div>
  );
};