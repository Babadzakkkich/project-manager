import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ExternalLink,
  FolderKanban,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../../hooks/useNotification';
import {
  formatDate,
  getRussianPluralForm,
  getUserRoleTranslation,
  RUSSIAN_PLURAL_FORMS,
} from '../../../utils/helpers';
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
  const isAdmin = userRole === 'admin';

  const usersCount = group.users?.length || 0;
  const projectsCount = group.projects?.length || 0;

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;

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
      <article className={styles.card}>
        <div className={styles.topLine}>
          <div className={styles.groupIcon}>
            <Users size={22} strokeWidth={2} aria-hidden="true" />
          </div>

          <div className={styles.titleSection}>
            <h3 className={styles.name}>{group.name}</h3>

            <div className={styles.badges}>
              {userRole && (
                <span className={`${styles.role} ${styles[userRole] || ''}`}>
                  {getUserRoleTranslation(userRole)}
                </span>
              )}
            </div>
          </div>
        </div>

        {group.description ? (
          <p className={styles.description}>{group.description}</p>
        ) : (
          <p className={styles.descriptionMuted}>Описание группы не указано</p>
        )}

        <div className={styles.metaPanel}>
          <div className={styles.metaItem}>
            <span className={styles.metaIcon}>
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.metaContent}>
              <span className={styles.metaLabel}>Создана</span>
              <span className={styles.metaValue}>{formatDate(group.created_at)}</span>
            </span>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statIcon}>
              <Users size={18} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.statText}>
              <span className={styles.statNumber}>{usersCount}</span>
              <span className={styles.statLabel}>
                {getRussianPluralForm(usersCount, RUSSIAN_PLURAL_FORMS.PARTICIPANT)}
              </span>
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statIcon}>
              <FolderKanban size={18} strokeWidth={2} aria-hidden="true" />
            </span>

            <span className={styles.statText}>
              <span className={styles.statNumber}>{projectsCount}</span>
              <span className={styles.statLabel}>
                {getRussianPluralForm(projectsCount, RUSSIAN_PLURAL_FORMS.PROJECT)}
              </span>
            </span>
          </div>
        </div>

        <div className={styles.footer}>
          <Link
            to={`/groups/${group.id}`}
            className={styles.viewButton}
          >
            Открыть группу
            <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
          </Link>

          {showDeleteButton && isAdmin && (
            <Button
              variant="secondary"
              size="small"
              onClick={handleDeleteClick}
              className={styles.deleteButton}
              disabled={isDeleting}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              {isDeleting ? 'Удаление...' : 'Удалить'}
            </Button>
          )}
        </div>
      </article>

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Удаление группы"
        message={`Вы уверены, что хотите удалить группу "${group.name}"? Это действие нельзя отменить. Все проекты и данные группы будут потеряны.`}
        confirmText={isDeleting ? 'Удаление...' : 'Удалить группу'}
        cancelText="Отмена"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};
