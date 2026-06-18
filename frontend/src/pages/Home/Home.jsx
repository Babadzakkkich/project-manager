import React from 'react';
import {
  ArrowRight,
  Bell,
  FolderKanban,
  Users,
  Video,
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import logo from '../../assets/logo.png';
import styles from './Home.module.css';

const FEATURES = [
  {
    icon: Users,
    title: 'Команды и роли',
    description: 'Создание групп, назначение участников и разграничение прав доступа.',
  },
  {
    icon: FolderKanban,
    title: 'Проекты и задачи',
    description: 'Связь проектов, групп, задач, исполнителей, сроков и статусов.',
  },
  {
    icon: Bell,
    title: 'Уведомления',
    description: 'Оповещения о приглашениях, изменениях задач, проектах и созвонах.',
  },
  {
    icon: Video,
    title: 'Рабочие созвоны',
    description: 'Обсуждение проектов, групп и отдельных задач в едином пространстве.',
  },
];

export const Home = () => {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />
      <div className={styles.backgroundGlowSecond} />

      <section className={styles.hero}>
        <div className={styles.content}>
          <div className={styles.brand}>
            <img src={logo} alt="Syncro" className={styles.logo} />
          </div>

          <h1 className={styles.title}>
            Рабочее пространство для проектов, задач и команд
          </h1>

          <p className={styles.subtitle}>
            Syncro объединяет группы, проекты, задачи, уведомления и рабочие
            созвоны в одном интерфейсе, чтобы участники команды видели общий
            контекст и быстрее переходили от планирования к выполнению.
          </p>

          <div className={styles.actions}>
            <Button to="/login" variant="primary" size="large">
              Начать работу
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Button>

            <Button to="/register" variant="secondary" size="large">
              Зарегистрироваться
            </Button>
          </div>
        </div>

        <div className={styles.featuresPanel} aria-label="Возможности Syncro">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;

            return (
              <article key={feature.title} className={styles.feature}>
                <div className={styles.featureIcon}>
                  <Icon size={26} strokeWidth={2} aria-hidden="true" />
                </div>

                <div className={styles.featureContent}>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};