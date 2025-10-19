import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import { getUserRoleTranslation, formatDate } from '../../../utils/helpers';
import styles from './GroupCard.module.css';

export const GroupCard = ({
  group,
  currentUserId,
  onDelete,
  showDeleteButton = true
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showSuccess, showError } = useNotification();

  const getUserRoleInGroup = () => {
    if (!currentUserId || !group.users) return null;
    
    const currentUserInGroup = group.users.find(u => u.id === currentUserId);
    return currentUserInGroup ? currentUserInGroup.role : null;
  };

  const userRole = getUserRoleInGroup();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(group.id, group.name);
      showSuccess(`Группа "${group.name}" успешно удалена`);
    } catch (error) {
      console.error('Error deleting group:', error);
      showError('Не удалось удалить группу');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.name}>{group.name}</h3>
          {userRole && (
            <span className={styles.role}>
              {getUserRoleTranslation(userRole)}
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
                onClick={handleDeleteClick}
                className={styles.deleteButton}
                disabled={isDeleting}
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Удаление группы"
        message={`Вы уверены, что хотите удалить группу "${group.name}"? Это действие нельзя отменить. Все проекты и данные группы будут потеряны.`}
        confirmText={isDeleting ? "Удаление..." : "Удалить группу"}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};