import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { getProjectStatusTranslation } from '../../../utils/projectStatus';
import styles from './ProjectCard.module.css';

export const ProjectCard = ({
  project,
  showDetailsButton = true,
  compact = false,
  showDeleteButton = false,
  userRole, // Добавляем новое свойство для отображения роли
  onDelete
}) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusClass = (status) => {
    const statusClasses = {
      'in_progress': styles.statusInProgress,
      'completed': styles.statusCompleted,
      'planned': styles.statusPlanned,
      'on_hold': styles.statusOnHold,
      'cancelled': styles.statusCancelled
    };
    return statusClasses[status] || styles.statusDefault;
  };

  const getRoleTranslation = (role) => {
    const roleTranslations = {
      'admin': 'Администратор',
      'member': 'Участник'
    };
    return roleTranslations[role] || role;
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  if (compact) {
    return (
      <div className={styles.cardCompact}>
        <div className={styles.compactHeader}>
          <div className={styles.compactTitleSection}>
            <h4 className={styles.compactTitle}>{project.title}</h4>
            {userRole && (
              <span className={`${styles.userRole} ${styles[userRole]}`}>
                {getRoleTranslation(userRole)}
              </span>
            )}
          </div>
          <span className={`${styles.status} ${getStatusClass(project.status)}`}>
            {getProjectStatusTranslation(project.status)}
          </span>
        </div>
        {project.description && (
          <p className={styles.compactDescription}>{project.description}</p>
        )}
        <div className={styles.compactDates}>
          <span>до {formatDate(project.end_date)}</span>
        </div>
        {showDetailsButton && (
          <Link 
            to={`/projects/${project.id}`} 
            className={styles.viewButton}
          >
            Подробнее
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>{project.title}</h3>
          {userRole && (
            <span className={`${styles.userRole} ${styles[userRole]}`}>
              {getRoleTranslation(userRole)}
            </span>
          )}
        </div>
        <span className={`${styles.status} ${getStatusClass(project.status)}`}>
          {getProjectStatusTranslation(project.status)}
        </span>
      </div>
      
      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}
      
      <div className={styles.dates}>
        <div className={styles.dateItem}>
          <span className={styles.dateLabel}>Начало:</span>
          <span className={styles.dateValue}>{formatDate(project.start_date)}</span>
        </div>
        <div className={styles.dateItem}>
          <span className={styles.dateLabel}>Окончание:</span>
          <span className={styles.dateValue}>{formatDate(project.end_date)}</span>
        </div>
      </div>
      
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNumber}>{project.tasks?.length || 0}</span>
          <span className={styles.statLabel}>задач</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNumber}>{project.groups?.length || 0}</span>
          <span className={styles.statLabel}>групп</span>
        </div>
      </div>
      
      <div className={styles.footer}>
        <div className={styles.footerActions}>
          {showDetailsButton && (
            <Link 
              to={`/projects/${project.id}`} 
              className={styles.viewButton}
            >
              Подробнее
            </Link>
          )}
          {showDeleteButton && (
            <Button
              variant="secondary"
              size="small"
              onClick={handleDeleteClick}
              className={styles.deleteButton}
            >
              Удалить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};