import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  History,
  MessageSquare,
  Pencil,
  Reply,
  Send,
  Trash2,
} from 'lucide-react';

import { tasksAPI } from '../../../services/api/tasks';
import { Button } from '../../../components/ui/Button';
import { handleApiError } from '../../../utils/helpers';
import {
  getTaskPriorityTranslation,
  getTaskStatusTranslation,
} from '../../../utils/taskStatus';
import styles from './TaskActivityPanel.module.css';

const COMMENT_LIMIT = 2000;
const QUOTE_LIMIT = 180;

const ACTION_LABELS = {
  task_created: 'Задача создана',
  title_changed: 'Название изменено',
  description_changed: 'Описание изменено',
  status_changed: 'Статус изменён',
  status_change: 'Статус изменён',
  priority_changed: 'Приоритет изменён',
  priority_change: 'Приоритет изменён',
  deadline_changed: 'Срок изменён',
  start_date_changed: 'Дата начала изменена',
  tags_changed: 'Теги изменены',
  assignees_added: 'Добавлены исполнители',
  assignees_removed: 'Удалены исполнители',
};

const getUserName = (user) => user?.name || user?.login || user?.email || 'Пользователь';
const getUserInitial = (user) => getUserName(user).charAt(0).toUpperCase();

const formatDateTime = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncateText = (value, limit = QUOTE_LIMIT) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');

  if (!text) return 'Комментарий удалён';
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
};

const getValueLabel = (action, value) => {
  if (!value) return '—';

  if (action?.includes('status')) {
    return getTaskStatusTranslation(value);
  }

  if (action?.includes('priority')) {
    return getTaskPriorityTranslation(value);
  }

  if (action?.includes('deadline') || action?.includes('start_date')) {
    return formatDateTime(value);
  }

  return String(value);
};

const renderCommentText = (text) => {
  const parts = String(text || '').split(/(@[A-Za-z0-9_]{3,50})/g);

  return parts.map((part, index) => {
    if (/^@[A-Za-z0-9_]{3,50}$/.test(part)) {
      return (
        <span key={`${part}-${index}`} className={styles.mentionText}>
          {part}
        </span>
      );
    }

    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
};

const parseDetails = (details) => {
  if (!details || typeof details !== 'string') return null;

  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
};

const getCommentQuote = (comment) => {
  if (!comment) {
    return {
      author: 'Комментарий',
      content: 'Исходный комментарий недоступен',
      isDeleted: true,
    };
  }

  return {
    author: getUserName(comment.author),
    content: truncateText(comment.content),
    isDeleted: comment.is_deleted,
  };
};

export const TaskActivityPanel = ({
  taskId,
  groupUsers = [],
  currentUser,
  canManageAllComments = false,
  onError,
  onSuccess,
}) => {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFeed, setActiveFeed] = useState('comments');
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editText, setEditText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const mentionableUsers = useMemo(() => {
    return (groupUsers || [])
      .filter((item) => item?.login)
      .sort((a, b) => getUserName(a).localeCompare(getUserName(b), 'ru'));
  }, [groupUsers]);

  const comments = useMemo(() => {
    return timeline
      .filter((item) => item.type === 'comment' && item.comment)
      .map((item) => item.comment);
  }, [timeline]);

  const activities = useMemo(() => {
    return timeline.filter((item) => item.type === 'activity');
  }, [timeline]);

  const commentById = useMemo(() => {
    const map = new Map();

    comments.forEach((comment) => {
      map.set(comment.id, comment);
    });

    return map;
  }, [comments]);

  const loadTimeline = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      const data = await tasksAPI.getTimeline(taskId);
      setTimeline(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading task timeline:', err);
      onError?.(`Не удалось загрузить активность: ${handleApiError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [taskId, onError]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const appendMention = (login, target = 'new') => {
    const mention = `@${login}`;

    if (target === 'edit') {
      setEditText((prev) => {
        const separator = prev && !prev.endsWith(' ') ? ' ' : '';
        return `${prev}${separator}${mention} `;
      });
      return;
    }

    setCommentText((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${separator}${mention} `;
    });
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();

    const preparedText = commentText.trim();
    if (!preparedText || submitting) return;

    try {
      setSubmitting(true);
      await tasksAPI.createComment(taskId, {
        content: preparedText,
        parent_id: replyTo?.id || null,
      });

      setCommentText('');
      setReplyTo(null);
      await loadTimeline();
      onSuccess?.(replyTo ? 'Ответ добавлен' : 'Комментарий добавлен');
    } catch (err) {
      console.error('Error creating comment:', err);
      onError?.(`Не удалось добавить комментарий: ${handleApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartReply = (comment) => {
    setReplyTo(comment);
    setActiveFeed('comments');
  };

  const handleStartEdit = (comment) => {
    setEditingComment(comment);
    setEditText(comment.content || '');
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditText('');
  };

  const handleUpdateComment = async (e) => {
    e.preventDefault();

    if (!editingComment || !editText.trim()) return;

    try {
      setUpdatingId(editingComment.id);
      await tasksAPI.updateComment(taskId, editingComment.id, {
        content: editText.trim(),
      });

      handleCancelEdit();
      await loadTimeline();
      onSuccess?.('Комментарий обновлён');
    } catch (err) {
      console.error('Error updating comment:', err);
      onError?.(`Не удалось обновить комментарий: ${handleApiError(err)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!commentId || deletingId) return;

    try {
      setDeletingId(commentId);
      await tasksAPI.deleteComment(taskId, commentId);
      await loadTimeline();
      onSuccess?.('Комментарий удалён');
    } catch (err) {
      console.error('Error deleting comment:', err);
      onError?.(`Не удалось удалить комментарий: ${handleApiError(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const renderActivityDetails = (item) => {
    const details = parseDetails(item.details);

    if (item.action === 'assignees_added' || item.action === 'assignees_removed') {
      return item.new_value || item.old_value || null;
    }

    if (item.old_value || item.new_value) {
      return (
        <span>
          {getValueLabel(item.action, item.old_value)} → {getValueLabel(item.action, item.new_value)}
        </span>
      );
    }

    if (details?.comment_id) {
      return `Комментарий #${details.comment_id}`;
    }

    return null;
  };

  const renderQuote = (parentComment, compact = false) => {
    const quote = getCommentQuote(parentComment);

    return (
      <div className={`${styles.replyQuote} ${compact ? styles.replyQuoteCompact : ''}`}>
        <span className={styles.replyQuoteAuthor}>{quote.author}</span>
        <span className={`${styles.replyQuoteText} ${quote.isDeleted ? styles.deletedQuote : ''}`}>
          {quote.content}
        </span>
      </div>
    );
  };

  const renderCommentItem = (comment) => {
    if (!comment) return null;

    const isOwnComment = comment.author_id === currentUser?.id;
    const canEditComment = isOwnComment && !comment.is_deleted;
    const canDeleteComment = (isOwnComment || canManageAllComments) && !comment.is_deleted;
    const isReply = Boolean(comment.parent_id);
    const parentComment = isReply ? commentById.get(comment.parent_id) : null;
    const isEditing = editingComment?.id === comment.id;

    return (
      <article
        key={`comment-${comment.id}`}
        className={`${styles.timelineItem} ${styles.commentItem} ${isReply ? styles.replyItem : ''}`}
      >
        <div className={styles.avatar}>{getUserInitial(comment.author)}</div>

        <div className={styles.itemBody}>
          <div className={styles.itemHeader}>
            <div className={styles.itemAuthorLine}>
              <span className={styles.authorName}>{getUserName(comment.author)}</span>
              {comment.author_id === currentUser?.id && (
                <span className={styles.youBadge}>Вы</span>
              )}
              {isReply && (
                <span className={styles.replyBadge}>Ответ</span>
              )}
            </div>

            <span className={styles.itemDate}>{formatDateTime(comment.created_at)}</span>
          </div>

          {isReply && renderQuote(parentComment)}

          {isEditing ? (
            <form className={styles.editCommentForm} onSubmit={handleUpdateComment}>
              <textarea
                className={styles.commentTextarea}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={COMMENT_LIMIT}
                rows={3}
                disabled={updatingId === comment.id}
              />

              {mentionableUsers.length > 0 && (
                <div className={styles.mentionRow}>
                  {mentionableUsers.slice(0, 6).map((mentionUser) => (
                    <button
                      key={mentionUser.id}
                      type="button"
                      className={styles.mentionButton}
                      onClick={() => appendMention(mentionUser.login, 'edit')}
                      disabled={updatingId === comment.id}
                    >
                      @{mentionUser.login}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.commentActions}>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  loading={updatingId === comment.id}
                  disabled={!editText.trim() || updatingId === comment.id}
                >
                  Сохранить
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleCancelEdit}
                  disabled={updatingId === comment.id}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <p className={`${styles.commentText} ${comment.is_deleted ? styles.deletedComment : ''}`}>
              {renderCommentText(comment.content)}
            </p>
          )}

          {!isEditing && (
            <div className={styles.itemFooter}>
              {comment.is_edited && !comment.is_deleted && <span>изменён</span>}

              {!comment.is_deleted && (
                <button
                  type="button"
                  className={styles.inlineAction}
                  onClick={() => handleStartReply(comment)}
                >
                  <Reply size={14} strokeWidth={2.2} aria-hidden="true" />
                  Ответить
                </button>
              )}

              {canEditComment && (
                <button
                  type="button"
                  className={styles.inlineAction}
                  onClick={() => handleStartEdit(comment)}
                >
                  <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                  Изменить
                </button>
              )}

              {canDeleteComment && (
                <button
                  type="button"
                  className={`${styles.inlineAction} ${styles.dangerAction}`}
                  onClick={() => handleDeleteComment(comment.id)}
                  disabled={deletingId === comment.id}
                >
                  <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  {deletingId === comment.id ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  const renderActivityItem = (item) => {
    const activityDetails = renderActivityDetails(item);

    return (
      <article key={`activity-${item.id}`} className={`${styles.timelineItem} ${styles.activityItem}`}>
        <div className={styles.activityIcon}>
          <History size={16} strokeWidth={2.1} aria-hidden="true" />
        </div>

        <div className={styles.itemBody}>
          <div className={styles.itemHeader}>
            <div className={styles.itemAuthorLine}>
              <span className={styles.authorName}>{getUserName(item.actor)}</span>
              <span className={styles.activityLabel}>
                {ACTION_LABELS[item.action] || item.action || 'Действие'}
              </span>
            </div>

            <span className={styles.itemDate}>{formatDateTime(item.created_at)}</span>
          </div>

          {activityDetails && <p className={styles.activityDetails}>{activityDetails}</p>}
        </div>
      </article>
    );
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Активность задачи</h2>
          <p>Комментарии и системная история разделены, чтобы лента не смешивала обсуждение с техническими изменениями.</p>
        </div>

        {loading && (
          <span className={styles.loadingLabel}>
            <Clock3 size={14} strokeWidth={2.2} aria-hidden="true" />
            Обновление
          </span>
        )}
      </div>

      <div className={styles.feedTabs} role="tablist" aria-label="Разделы активности задачи">
        <button
          type="button"
          className={`${styles.feedTab} ${activeFeed === 'comments' ? styles.feedTabActive : ''}`}
          onClick={() => setActiveFeed('comments')}
        >
          Комментарии
          <span>{comments.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.feedTab} ${activeFeed === 'history' ? styles.feedTabActive : ''}`}
          onClick={() => setActiveFeed('history')}
        >
          История изменений
          <span>{activities.length}</span>
        </button>
      </div>

      {activeFeed === 'comments' ? (
        <>
          {replyTo && (
            <div className={styles.replyNotice}>
              <div className={styles.replyNoticeMain}>
                <Reply size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>Ответ на комментарий</span>
              </div>
              {renderQuote(replyTo, true)}
              <button type="button" onClick={() => setReplyTo(null)}>Отменить</button>
            </div>
          )}

          <form className={styles.commentForm} onSubmit={handleSubmitComment}>
            <textarea
              className={styles.commentTextarea}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={replyTo ? 'Напишите ответ...' : 'Напишите комментарий. Для упоминания используйте @login'}
              maxLength={COMMENT_LIMIT}
              rows={4}
              disabled={submitting}
            />

            <div className={styles.commentFormFooter}>
              {mentionableUsers.length > 0 && (
                <div className={styles.mentionRow}>
                  {mentionableUsers.slice(0, 8).map((mentionUser) => (
                    <button
                      key={mentionUser.id}
                      type="button"
                      className={styles.mentionButton}
                      onClick={() => appendMention(mentionUser.login)}
                      disabled={submitting}
                    >
                      @{mentionUser.login}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.submitRow}>
                <span className={styles.counter}>{commentText.length}/{COMMENT_LIMIT}</span>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  loading={submitting}
                  disabled={!commentText.trim() || submitting}
                >
                  <Send size={15} strokeWidth={2.2} aria-hidden="true" />
                  {replyTo ? 'Ответить' : 'Отправить'}
                </Button>
              </div>
            </div>
          </form>

          {comments.length > 0 ? (
            <div className={styles.timeline}>
              {comments.map(renderCommentItem)}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <MessageSquare size={38} strokeWidth={1.8} aria-hidden="true" />
              <h3>Комментариев пока нет</h3>
              <p>Оставьте первый комментарий, задайте вопрос или упомяните участника через @login.</p>
            </div>
          )}
        </>
      ) : (
        activities.length > 0 ? (
          <div className={styles.timeline}>
            {activities.map(renderActivityItem)}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <History size={38} strokeWidth={1.8} aria-hidden="true" />
            <h3>Истории пока нет</h3>
            <p>Изменения статуса, приоритета, сроков и исполнителей появятся здесь.</p>
          </div>
        )
      )}
    </section>
  );
};
