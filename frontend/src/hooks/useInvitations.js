import { useState, useEffect, useCallback } from 'react';
import { groupsAPI } from '../services/api/groups';
import { useNotification } from './useNotification';

export const useInvitations = () => {
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotification();

  const loadPendingInvitations = useCallback(async () => {
    try {
      setLoading(true);
      const invitations = await groupsAPI.getPendingInvitations();
      setPendingInvitations(invitations);
    } catch (error) {
      console.error('Error loading invitations:', error);
      // Не показываем ошибку пользователю, просто логируем
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptInvitation = useCallback(async (token, groupName) => {
    try {
      const result = await groupsAPI.acceptInvitation(token);
      if (result.success) {
        showSuccess(`Вы присоединились к группе "${groupName}"`);
        await loadPendingInvitations();
        return true;
      }
      return false;
    } catch (error) {
      const message = error.response?.data?.detail || 'Не удалось принять приглашение';
      showError(message);
      return false;
    }
  }, [loadPendingInvitations, showSuccess, showError]);

  const declineInvitation = useCallback(async (token) => {
    try {
      const result = await groupsAPI.declineInvitation(token);
      if (result.success) {
        showSuccess('Приглашение отклонено');
        await loadPendingInvitations();
        return true;
      }
      return false;
    } catch (error) {
      const message = error.response?.data?.detail || 'Не удалось отклонить приглашение';
      showError(message);
      return false;
    }
  }, [loadPendingInvitations, showSuccess, showError]);

  useEffect(() => {
    loadPendingInvitations();
  }, [loadPendingInvitations]);

  return {
    pendingInvitations,
    loading,
    loadPendingInvitations,
    acceptInvitation,
    declineInvitation
  };
};