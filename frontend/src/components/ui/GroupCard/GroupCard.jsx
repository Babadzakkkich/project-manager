import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import styles from './GroupCard.module.css';

export const GroupCard = ({
  group,
  currentUserId,
  onDelete,
  showDeleteButton = true
}) => {
  const getUserRoleInGroup = () => {
    if (!currentUserId || !group.users) return null;
    
    const currentUserInGroup = group.users.find(u => u.id === currentUserId);
    return currentUserInGroup ? currentUserInGroup.role : null;
  };

  const getRoleTranslation = (role) => {
    const roleTranslations = {
      'admin': 'Администратор',
      'member': 'Участник'
    };
    return roleTranslations[role] || role;
  };

  const userRole = getUserRoleInGroup();
  const isAdmin = userRole === 'admin';

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{group.name}</h3>
        {userRole && (
          <span className={styles.role}>
            {getRoleTranslation(userRole)}
          </span>
        )}
      </div>
      
      {group.description && (
        <p className={styles.description}>{group.description}</p>
      )}
      
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNumber}>{group.users?.length || 0}</span>
          <span className={styles.statLabel}>участников</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNumber}>{group.projects?.length || 0}</span>
          <span className={styles.statLabel}>проектов</span>
        </div>
      </div>
      
      <div className={styles.footer}>
        <span className={styles.createdDate}>
          Создана: {formatDate(group.created_at)}
        </span>
        <div className={styles.actions}>
          <Link 
            to={`/groups/${group.id}`} 
            className={styles.viewButton}
          >
            Подробнее
          </Link>
          {showDeleteButton && isAdmin && (
            <Button
              variant="secondary"
              size="small"
              onClick={() => onDelete(group.id, group.name)}
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