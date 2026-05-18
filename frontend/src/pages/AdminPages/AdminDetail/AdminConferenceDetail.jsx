import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Square } from 'lucide-react';

import { adminAPI } from '../../../services/api/admin';
import { Button } from '../../../components/ui/Button';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { AdminLayout } from '../AdminLayout';
import { formatDate, handleApiError } from '../../../utils/helpers';
import {
  CONFERENCE_ROOM_TYPES,
  CONFERENCE_ROOM_TYPE_TRANSLATIONS,
} from '../../../utils/constants';
import styles from './AdminDetail.module.css';

const getRoomTypeLabel = (type) => {
  return CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || type || 'Не указан';
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return 'Не рассчитано';

  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'Не рассчитано';

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const restSeconds = value % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${restSeconds} сек`;
  }

  return `${restSeconds} сек`;
};

const getUserName = (user) => {
  return user?.name || user?.login || user?.email || 'Неизвестно';
};

const getConferenceRelation = (room) => {
  if (!room) return null;

  if (room.room_type === CONFERENCE_ROOM_TYPES.TASK && room.task) {
    return {
      label: 'Задача',
      value: room.task.title,
      to: `/admin/tasks/${room.task.id}`,
    };
  }

  if (room.room_type === CONFERENCE_ROOM_TYPES.PROJECT && room.project) {
    return {
      label: 'Проект',
      value: room.project.title,
      to: `/admin/projects/${room.project.id}`,
    };
  }

  if (room.room_type === CONFERENCE_ROOM_TYPES.GROUP && room.group) {
    return {
      label: 'Группа',
      value: room.group.name,
      to: `/admin/groups/${room.group.id}`,
    };
  }

  if (room.task) {
    return {
      label: 'Задача',
      value: room.task.title,
      to: `/admin/tasks/${room.task.id}`,
    };
  }

  if (room.project) {
    return {
      label: 'Проект',
      value: room.project.title,
      to: `/admin/projects/${room.project.id}`,
    };
  }

  if (room.group) {
    return {
      label: 'Группа',
      value: room.group.name,
      to: `/admin/groups/${room.group.id}`,
    };
  }

  return null;
};

const RelationCard = ({ relation }) => {
  if (!relation) return null;

  const content = (
    <>
      <div className={styles.relationCardHeader}>
        <h4 className={styles.relationCardTitle}>{relation.label}</h4>
      </div>
      <p className={styles.relationCardText}>{relation.value}</p>
    </>
  );

  return relation.to ? (
    <Link className={styles.relationCard} to={relation.to}>
      {content}
    </Link>
  ) : (
    <div className={styles.relationCard}>{content}</div>
  );
};


const showAdminToast = (message, type = 'success') => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { message, type, duration: 5000 },
    })
  );
};

export const AdminConferenceDetail = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadRoom = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await adminAPI.getConferenceById(roomId);
      setRoom(data);
    } catch (requestError) {
      setError(handleApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  const handleForceEnd = async () => {
    setActionLoading(true);
    setError('');

    try {
      const data = await adminAPI.forceEndConference(roomId);
      setRoom(data);
      showAdminToast('Созвон завершён');
      setConfirmOpen(false);
    } catch (requestError) {
      const message = handleApiError(requestError);
      setError(message);
      showAdminToast(`Не удалось завершить созвон: ${message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const latestStats = room?.latest_stats || room?.stats?.[0] || null;

  const isInstantConference = room?.room_type === CONFERENCE_ROOM_TYPES.INSTANT;
  const relation = useMemo(() => getConferenceRelation(room), [room]);

  return (
    <AdminLayout
      title="Просмотр созвона"
      actions={
        <div className={styles.toolbarActions}>
          <Button variant="secondary" onClick={() => navigate('/admin/conferences')}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            К списку
          </Button>

          {room?.is_active && (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Square size={16} strokeWidth={2} aria-hidden="true" />
              Завершить
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : !room ? (
        <div className={styles.empty}>Созвон не найден.</div>
      ) : (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h3 className={styles.panelTitle}>{room.title}</h3>
              </div>

              <div className={styles.badges}>
                <span
                  className={`${styles.badge} ${
                    room.is_active ? styles.conferenceActive : styles.conferenceInactive
                  }`}
                >
                  {room.is_active ? 'Активен' : 'Завершён'}
                </span>

                <span className={styles.badge}>{getRoomTypeLabel(room.room_type)}</span>
              </div>
            </div>

            <div className={styles.panelBody}>
              <div className={styles.grid}>
                <div className={styles.metaCard}>
                  <span>Room name</span>
                  <strong>{room.room_name}</strong>
                </div>

                <div className={styles.metaCard}>
                  <span>Создатель</span>
                  <strong>{getUserName(room.creator) || `ID ${room.created_by}`}</strong>
                </div>

                <div className={styles.metaCard}>
                  <span>Лимит</span>
                  <strong>{room.max_participants}</strong>
                </div>

                {isInstantConference && (
                  <div className={styles.metaCard}>
                    <span>Приглашены</span>
                    <strong>{room.invited_users_count || 0}</strong>
                  </div>
                )}

                <div className={styles.metaCard}>
                  <span>Создан</span>
                  <strong>{formatDate(room.created_at)}</strong>
                </div>

                <div className={styles.metaCard}>
                  <span>Начало</span>
                  <strong>{formatDate(room.started_at)}</strong>
                </div>

                <div className={styles.metaCard}>
                  <span>Завершение</span>
                  <strong>{formatDate(room.ended_at)}</strong>
                </div>

                <div className={styles.metaCard}>
                  <span>Длительность</span>
                  <strong>{formatDuration(latestStats?.duration_seconds)}</strong>
                </div>
              </div>
            </div>
          </section>

          <div className={styles.detailGrid}>
            <div className={styles.stack}>
              {!isInstantConference && relation && (
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Привязка созвона</h3>
                  </div>

                  <div className={styles.sectionBody}>
                    <div className={styles.cardGrid}>
                      <RelationCard relation={relation} />
                    </div>
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Участники</h3>
                </div>

                <div className={styles.sectionBody}>
                  {room.participants?.length ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Пользователь</th>
                            <th>Вход</th>
                            <th>Выход</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>

                        <tbody>
                          {room.participants.map((participant) => (
                            <tr key={participant.id}>
                              <td className={styles.primaryCell}>
                                {getUserName(participant.user) || `ID ${participant.user_id}`}
                              </td>
                              <td>{formatDate(participant.joined_at)}</td>
                              <td>{formatDate(participant.left_at)}</td>
                              <td>
                                <span
                                  className={`${styles.badge} ${
                                    participant.is_active
                                      ? styles.conferenceActive
                                      : styles.conferenceInactive
                                  }`}
                                >
                                  {participant.is_active ? 'В комнате' : 'Вышел'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>Участников нет.</div>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Сообщения</h3>
                </div>

                <div className={styles.sectionBody}>
                  {room.messages?.length ? (
                    <div className={styles.messageList}>
                      {room.messages.map((message) => (
                        <article key={message.id} className={styles.messageItem}>
                          <div className={styles.messageHeader}>
                            <strong>{getUserName(message.user) || `ID ${message.user_id}`}</strong>
                            <span>{formatDate(message.created_at)}</span>
                          </div>
                          <p>{message.message}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>Сообщений нет.</div>
                  )}
                </div>
              </section>
            </div>

            <div className={styles.stack}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Статистика</h3>
                </div>

                <div className={styles.sectionBody}>
                  <div className={styles.gridCompact}>
                    <div className={styles.metaCard}>
                      <span>Участников всего</span>
                      <strong>{room.participants_count}</strong>
                    </div>

                    <div className={styles.metaCard}>
                      <span>Сейчас в комнате</span>
                      <strong>{room.active_participants_count}</strong>
                    </div>

                    <div className={styles.metaCard}>
                      <span>Пик участников</span>
                      <strong>{latestStats?.peak_participants ?? 'Не рассчитано'}</strong>
                    </div>

                    <div className={styles.metaCard}>
                      <span>Сообщений</span>
                      <strong>{latestStats?.messages_count ?? room.messages_count}</strong>
                    </div>
                  </div>
                </div>
              </section>

              {isInstantConference && (
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Приглашённые</h3>
                  </div>

                  <div className={styles.sectionBody}>
                    {room.invited_users?.length ? (
                      <div className={styles.badges}>
                        {room.invited_users.map((invitedUser) => (
                          <span key={invitedUser.id} className={styles.badge}>
                            {getUserName(invitedUser)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyInline}>Приглашённых нет.</div>
                    )}
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Снимки статистики</h3>
                </div>

                <div className={styles.sectionBody}>
                  {room.stats?.length ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата</th>
                            <th>Участники</th>
                            <th>Длительность</th>
                          </tr>
                        </thead>

                        <tbody>
                          {room.stats.map((stats) => (
                            <tr key={stats.id}>
                              <td>{formatDate(stats.created_at)}</td>
                              <td>{stats.participant_count ?? '—'}</td>
                              <td>{formatDuration(stats.duration_seconds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>Статистика ещё не собрана.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleForceEnd}
        title="Завершение созвона"
        message={`Принудительно завершить созвон "${room?.title}"?`}
        confirmText="Завершить созвон"
        cancelText="Отмена"
        variant="danger"
        isLoading={actionLoading}
      />
    </AdminLayout>
  );
};