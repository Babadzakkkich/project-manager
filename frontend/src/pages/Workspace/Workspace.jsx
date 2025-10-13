import React from 'react';
import { Button } from '../../components/ui/Button';
import plusIcon from '../../assets/plus_icon.svg';
import styles from './Workspace.module.css';

export const Workspace = () => {
  // Временные данные (позже заменим на реальные из API)
  const recentProjects = [];
  const recentTasks = [];

  return (
    <div className={styles.workspace}>
      <div className={styles.container}>
        {/* Левая колонка - Быстрые действия */}
        <div className={styles.leftColumn}>
          <h2 className={styles.sectionTitle}>Быстрые действия</h2>
          
          <div className={styles.actionsGrid}>
            <Button
              to="/groups/create"
              variant="action"
              className={styles.actionButton}
            >
              <div className={styles.actionContent}>
                <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                <span className={styles.actionText}>Создать группу</span>
              </div>
            </Button>
            
            <Button
              to="/projects/create"
              variant="action"
              className={styles.actionButton}
            >
              <div className={styles.actionContent}>
                <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                <span className={styles.actionText}>Создать проект</span>
              </div>
            </Button>
            
            <Button
              to="/tasks/create"
              variant="action"
              className={styles.actionButton}
            >
              <div className={styles.actionContent}>
                <img src={plusIcon} alt="Создать" className={styles.actionIcon} />
                <span className={styles.actionText}>Создать задачу</span>
              </div>
            </Button>
          </div>
        </div>

        {/* Правая колонка - Недавние */}
        <div className={styles.rightColumn}>
          {/* Недавние проекты */}
          <div className={styles.recentSection}>
            <h3 className={styles.recentTitle}>Недавние проекты</h3>
            <div className={styles.recentContent}>
              {recentProjects.length > 0 ? (
                <div className={styles.recentList}>
                  {/* Здесь будут проекты */}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>Пока нет недавних проектов</p>
                  <span>Созданные проекты будут отображаться здесь</span>
                </div>
              )}
            </div>
          </div>

          {/* Недавние задачи */}
          <div className={styles.recentSection}>
            <h3 className={styles.recentTitle}>Недавние задачи</h3>
            <div className={styles.recentContent}>
              {recentTasks.length > 0 ? (
                <div className={styles.recentList}>
                  {/* Здесь будут задачи */}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>Пока нет недавних задач</p>
                  <span>Созданные задачи будут отображаться здесь</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};