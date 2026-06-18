import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FolderKanban,
  PhoneCall,
  Plus,
  Radio,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react';

import { conferencesAPI } from '../../services/api/conferences';
import { Button } from '../../components/ui/Button';
import { useNotification } from '../../hooks/useNotification';
import {
  CONFERENCE_ROOM_TYPES,
  CONFERENCE_ROOM_TYPE_TRANSLATIONS,
} from '../../utils/constants';
import {
  formatRelativeTime,
  formatRussianCount,
  handleApiError,
} from '../../utils/helpers';
import {
  FIELD_LIMITS,
  clampNumber,
  validateTextField,
} from '../../utils/validation';
import styles from './Conferences.module.css';

const CONFERENCE_TITLE_LIMIT = FIELD_LIMITS.CONFERENCE_TITLE;
const INVITE_QUERY_LIMIT = FIELD_LIMITS.CONFERENCE_INVITE_QUERY;
const MIN_CONFERENCE_PARTICIPANTS = 2;
const MAX_CONFERENCE_PARTICIPANTS = 30;

const PARTICIPANT_FORMS = ['участник', 'участника', 'участников'];
const ROOM_FORMS = ['созвон', 'созвона', 'созвонов'];

const ROOM_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'ended', label: 'Завершённые' },
];

const getRoomTypeConfig = (type) => {
  switch (type) {
    case CONFERENCE_ROOM_TYPES.PROJECT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Проект',
        Icon: FolderKanban,
      };

    case CONFERENCE_ROOM_TYPES.GROUP:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Группа',
        Icon: Users,
      };

    case CONFERENCE_ROOM_TYPES.TASK:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Задача',
        Icon: ClipboardList,
      };

    case CONFERENCE_ROOM_TYPES.INSTANT:
      return {
        label: CONFERENCE_ROOM_TYPE_TRANSLATIONS[type] || 'Мгновенный',
        Icon: Zap,
      };

    default:
      return {
        label: 'Созвон',
        Icon: Video,
      };
  }
};

const getRoomContext = (room) => {
  if (room.project?.title) {
    return {
      label: 'Проект',
      value: room.project.title,
      Icon: FolderKanban,
    };
  }

  if (room.group?.name) {
    return {
      label: 'Группа',
      value: room.group.name,
      Icon: Users,
    };
  }

  if (room.task?.title) {
    return {
      label: 'Задача',
      value: room.task.title,
      Icon: ClipboardList,
    };
  }

  return null;
};

const getCreatorName = (creator) => {
  return creator?.name || creator?.login || creator?.email || 'Неизвестно';
};

const getRoomTime = (room) => {
  if (room.started_at) {
    return formatRelativeTime(room.started_at);
  }

  if (room.created_at) {
    return formatRelativeTime(room.created_at);
  }

  return '—';
};

const formatDuration = (seconds) => {
  const totalSeconds = Number(seconds) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsLeft = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${secondsLeft} с`;
  }

  return `${secondsLeft} с`;
};

const formatKickDateTime = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getActiveKickInfo = (room) => {
  const kickedUntil = room?.current_user_kicked_until;
  const kickedUntilTime = kickedUntil ? new Date(kickedUntil).getTime() : 0;
  const isKicked = Boolean(
    room?.is_current_user_kicked &&
    kickedUntilTime &&
    !Number.isNaN(kickedUntilTime) &&
    kickedUntilTime > Date.now()
  );

  return {
    isKicked,
    kickedUntil,
    kickedUntilLabel: formatKickDateTime(kickedUntil),
    reason: room?.current_user_kick_reason?.trim() || '',
  };
};

const getKickFeedbackMessage = ({ message, kickedUntil, reason } = {}) => {
  const kickedUntilLabel = formatKickDateTime(kickedUntil);
  const parts = [message || 'Вход в созвон временно заблокирован'];

  if (kickedUntilLabel) {
    parts.push(`Доступ будет открыт ${kickedUntilLabel}.`);
  }

  if (reason) {
    parts.push(`Причина: ${reason}.`);
  }

  return parts.join(' ');
};

const formatUserLabel = (user) => {
  return user?.name || user?.login || user?.email || 'Пользователь';
};

export const Conferences = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { showError, showSuccess } = useNotification();

  const loadingRoomsRef = useRef(false);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeFilter, setActiveFilter] = useState('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    room_type: CONFERENCE_ROOM_TYPES.INSTANT,
    max_participants: 30,
  });
  const [createErrors, setCreateErrors] = useState({});

  const [invitableUsers, setInvitableUsers] = useState([]);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedInvitedUsers, setSelectedInvitedUsers] = useState([]);

  const [statsRoom, setStatsRoom] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  const loadRooms = useCallback(async ({ initial = false, manual = false } = {}) => {
    if (loadingRoomsRef.current) return;

    loadingRoomsRef.current = true;

    try {
      if (initial) {
        setLoading(true);
      }

      if (manual) {
        setRefreshing(true);
      }

      const availableRooms = await conferencesAPI.getAvailableRooms('all');
      setRooms(Array.isArray(availableRooms) ? availableRooms : []);
    } catch (err) {
      console.error('Error loading conferences:', err);

      if (initial || manual) {
        showError(`Не удалось загрузить список созвонов: ${handleApiError(err)}`);
      }
    } finally {
      loadingRoomsRef.current = false;

      if (initial) {
        setLoading(false);
      }

      if (manual) {
        setRefreshing(false);
      }
    }
  }, [showError]);

  const loadInvitableUsers = useCallback(async () => {
    if (!showCreateModal) return;

    setInviteLoading(true);

    try {
      const users = await conferencesAPI.getInvitableUsers({
        query: inviteQuery.trim() || undefined,
        limit: 50,
      });

      setInvitableUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      console.error('Error loading invitable users:', err);
      setInvitableUsers([]);
      showError(`Не удалось загрузить пользователей: ${handleApiError(err)}`);
    } finally {
      setInviteLoading(false);
    }
  }, [inviteQuery, showCreateModal, showError]);

  useEffect(() => {
    loadRooms({ initial: true });

    const intervalId = setInterval(() => {
      loadRooms();
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadRooms]);

  useEffect(() => {
    const handleFocus = () => {
      loadRooms();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadRooms]);

  useEffect(() => {
    const kickFeedback = location.state?.conferenceKickFeedback;

    if (!kickFeedback) {
      return;
    }

    showError(getKickFeedbackMessage({
      message: kickFeedback.message,
      kickedUntil: kickFeedback.kickedUntil,
      reason: kickFeedback.reason,
    }));

    navigate(location.pathname, { replace: true, state: {} });
    loadRooms();
  }, [location.pathname, location.state, loadRooms, navigate, showError]);

  useEffect(() => {
    if (!showCreateModal) return undefined;

    const timeoutId = setTimeout(() => {
      loadInvitableUsers();
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [loadInvitableUsers, showCreateModal]);

  const counters = useMemo(() => {
    const activeRooms = rooms.filter((room) => room.is_active).length;
    const endedRooms = rooms.filter((room) => !room.is_active).length;
    const participants = rooms.reduce(
      (total, room) => total + (room.participants_count || 0),
      0
    );

    return {
      total: rooms.length,
      active: activeRooms,
      ended: endedRooms,
      participants,
    };
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    if (activeFilter === 'active') {
      return rooms.filter((room) => room.is_active);
    }

    if (activeFilter === 'ended') {
      return rooms.filter((room) => !room.is_active);
    }

    return rooms;
  }, [rooms, activeFilter]);

  const filterCounts = {
    all: counters.total,
    active: counters.active,
    ended: counters.ended,
  };

  const handleRefresh = () => {
    loadRooms({ manual: true });
  };

  const clearCreateError = (fieldName) => {
    if (!createErrors[fieldName] && !createErrors.submit) return;

    setCreateErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      delete next.submit;
      return next;
    });
  };

  const handleCreateFormChange = (fieldName, value) => {
    setCreateForm((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    clearCreateError(fieldName);
  };

  const handleCreateInstant = async (event) => {
    event?.preventDefault();

    const title = createForm.title.trim();

    const titleError = validateTextField(title, {
      label: 'Название созвона',
      min: 2,
      max: CONFERENCE_TITLE_LIMIT,
    });
    const newErrors = {};

    if (titleError) {
      newErrors.title = titleError;
    }

    const maxParticipants = clampNumber(
      createForm.max_participants,
      MIN_CONFERENCE_PARTICIPANTS,
      MAX_CONFERENCE_PARTICIPANTS,
      MAX_CONFERENCE_PARTICIPANTS
    );

    if (!String(createForm.max_participants).trim()) {
      newErrors.max_participants = 'Укажите максимальное количество участников';
    } else if (Number(createForm.max_participants) < MIN_CONFERENCE_PARTICIPANTS) {
      newErrors.max_participants = `Минимум ${MIN_CONFERENCE_PARTICIPANTS} участника`;
    } else if (Number(createForm.max_participants) > MAX_CONFERENCE_PARTICIPANTS) {
      newErrors.max_participants = `Максимум ${MAX_CONFERENCE_PARTICIPANTS} участников`;
    }

    if (Object.keys(newErrors).length > 0) {
      setCreateErrors(newErrors);
      return;
    }

    setCreateLoading(true);

    try {
      const room = await conferencesAPI.createRoom({
        title,
        room_type: CONFERENCE_ROOM_TYPES.INSTANT,
        max_participants: maxParticipants,
        invited_user_ids: selectedInvitedUsers.map((user) => user.id),
      });

      setShowCreateModal(false);
      setCreateForm({
        title: '',
        room_type: CONFERENCE_ROOM_TYPES.INSTANT,
        max_participants: 30,
      });
      setInviteQuery('');
      setInvitableUsers([]);
      setSelectedInvitedUsers([]);
      setCreateErrors({});

      showSuccess('Созвон создан');
      navigate(`/conferences/${room.id}`);
    } catch (err) {
      console.error('Error creating conference:', err);
      setCreateErrors({ submit: `Не удалось создать созвон: ${handleApiError(err)}` });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinRoom = (room) => {
    const kickInfo = getActiveKickInfo(room);

    if (kickInfo.isKicked) {
      showError(getKickFeedbackMessage({
        message: 'Вы временно удалены из этого созвона.',
        kickedUntil: kickInfo.kickedUntil,
        reason: kickInfo.reason,
      }));
      return;
    }

    navigate(`/conferences/${room.id}`);
  };

  const handleCloseCreateModal = () => {
    if (createLoading) return;

    setShowCreateModal(false);
    setCreateForm({
      title: '',
      room_type: CONFERENCE_ROOM_TYPES.INSTANT,
      max_participants: 30,
    });
    setInviteQuery('');
    setInvitableUsers([]);
    setSelectedInvitedUsers([]);
    setCreateErrors({});
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      handleCloseCreateModal();
    }
  };

  const handleStatsOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      setStatsRoom(null);
      setStatsData(null);
      setStatsError('');
    }
  };

  const toggleInvitedUser = (user) => {
    setSelectedInvitedUsers((prev) => {
      if (prev.some((item) => item.id === user.id)) {
        return prev.filter((item) => item.id !== user.id);
      }

      return [...prev, user];
    });
  };

  const isUserSelected = (userId) => {
    return selectedInvitedUsers.some((user) => user.id === userId);
  };

  const handleOpenStats = async (room) => {
    setStatsRoom(room);
    setStatsData(null);
    setStatsError('');
    setStatsLoading(true);

    try {
      const data = await conferencesAPI.getRoomStats(room.id);
      setStatsData(data);
    } catch (err) {
      console.error('Error loading conference stats:', err);
      setStatsError(handleApiError(err));
    } finally {
      setStatsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка созвонов...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.toolbar}>
        <div className={styles.toolbarMain}>
          <div className={styles.pageMark}>
            <Radio size={17} strokeWidth={2} aria-hidden="true" />
            Созвоны
          </div>

          <div className={styles.filters}>
            {ROOM_FILTERS.map((filter) => {
              const count = filterCounts[filter.key] || 0;

              return (
                <button
                  key={filter.key}
                  type="button"
                  className={`${styles.filterButton} ${
                    activeFilter === filter.key ? styles.active : ''
                  }`}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  {filter.label}

                  {count > 0 && (
                    <span className={styles.filterCount}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.metaPill}>
            <Users size={15} strokeWidth={2} aria-hidden="true" />
            {formatRussianCount(counters.participants, PARTICIPANT_FORMS)}
          </div>

          <Button
            variant="secondary"
            size="medium"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              strokeWidth={2}
              aria-hidden="true"
            />
            {refreshing ? 'Обновление...' : 'Обновить'}
          </Button>

          <Button
            variant="primary"
            size="medium"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Создать созвон
          </Button>
        </div>
      </section>

      {filteredRooms.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            {activeFilter === 'active' ? (
              <PhoneCall size={46} strokeWidth={1.8} aria-hidden="true" />
            ) : activeFilter === 'ended' ? (
              <CheckCircle2 size={46} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Search size={46} strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <h2>
            {activeFilter === 'active'
              ? 'Нет активных созвонов'
              : activeFilter === 'ended'
                ? 'Нет завершённых созвонов'
                : 'Созвоны не найдены'}
          </h2>

          <p>
            {activeFilter === 'active'
              ? 'Создайте мгновенный созвон или дождитесь, когда созвон начнётся в группе, проекте или задаче.'
              : 'Попробуйте выбрать другой фильтр или обновить список.'}
          </p>

          {activeFilter === 'active' && (
            <Button
              variant="primary"
              size="medium"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Создать созвон
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.roomsList}>
          {filteredRooms.map((room) => {
            const participantsCount = room.participants_count || 0;
            const roomType = getRoomTypeConfig(room.room_type);
            const context = getRoomContext(room);
            const RoomTypeIcon = roomType.Icon;
            const ContextIcon = context?.Icon;
            const kickInfo = getActiveKickInfo(room);
            const roomIsBlocked = room.is_active && kickInfo.isKicked;

            return (
              <article
                key={room.id}
                className={`${styles.roomCard} ${
                  room.is_active ? styles.activeRoom : styles.endedRoom
                } ${roomIsBlocked ? styles.blockedRoom : ''}`}
              >
                <div className={styles.roomMain}>
                  <div className={styles.roomIcon}>
                    <RoomTypeIcon size={22} strokeWidth={2} aria-hidden="true" />
                  </div>

                  <div className={styles.roomText}>
                    <div className={styles.roomBadges}>
                      <span className={styles.roomType}>
                        {roomType.label}
                      </span>

                      <span
                        className={`${styles.statusBadge} ${
                          roomIsBlocked
                            ? styles.statusBlocked
                            : room.is_active
                              ? styles.statusActive
                              : styles.statusEnded
                        }`}
                      >
                        {roomIsBlocked ? (
                          <AlertTriangle size={13} strokeWidth={2.2} aria-hidden="true" />
                        ) : room.is_active ? (
                          <Radio size={13} strokeWidth={2.2} aria-hidden="true" />
                        ) : (
                          <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" />
                        )}

                        {roomIsBlocked ? 'Вход ограничен' : room.is_active ? 'Идёт' : 'Завершён'}
                      </span>
                    </div>

                    <h3 className={styles.roomTitle}>
                      {room.title}
                    </h3>

                    <div className={styles.roomMeta}>
                      <span>
                        Создатель: <strong>{getCreatorName(room.creator)}</strong>
                      </span>

                      <span>
                        <Users size={14} strokeWidth={2} aria-hidden="true" />
                        {participantsCount}/{room.max_participants || 30}
                      </span>

                      <span>
                        <Clock3 size={14} strokeWidth={2} aria-hidden="true" />
                        {getRoomTime(room)}
                      </span>
                    </div>

                    {context && (
                      <div className={styles.roomContext}>
                        <ContextIcon size={14} strokeWidth={2} aria-hidden="true" />
                        <span>{context.label}: {context.value}</span>
                      </div>
                    )}

                    {roomIsBlocked && (
                      <div className={styles.roomKickNotice}>
                        <span>
                          Вход будет доступен {kickInfo.kickedUntilLabel || 'после окончания блокировки'}
                          {kickInfo.reason ? `. Причина: ${kickInfo.reason}` : '. Причина не указана.'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.roomActions}>
                  {room.is_active ? (
                    <Button
                      variant={roomIsBlocked ? 'secondary' : 'primary'}
                      size="medium"
                      onClick={() => handleJoinRoom(room)}
                      className={styles.joinButton}
                      disabled={roomIsBlocked}
                      title={roomIsBlocked ? getKickFeedbackMessage({
                        message: 'Вы временно удалены из этого созвона.',
                        kickedUntil: kickInfo.kickedUntil,
                        reason: kickInfo.reason,
                      }) : undefined}
                    >
                      {roomIsBlocked ? (
                        <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <PhoneCall size={16} strokeWidth={2} aria-hidden="true" />
                      )}
                      {roomIsBlocked ? 'Недоступно' : 'Войти'}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="medium"
                      onClick={() => handleOpenStats(room)}
                      className={styles.joinButton}
                    >
                      <BarChart3 size={16} strokeWidth={2} aria-hidden="true" />
                      Статистика
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div
          className={styles.modalOverlay}
          onClick={handleOverlayClick}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-conference-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="create-conference-title">
                  Создать созвон
                </h2>
              </div>

              <button
                className={styles.closeButton}
                onClick={handleCloseCreateModal}
                type="button"
                disabled={createLoading}
                aria-label="Закрыть окно создания созвона"
              >
                <X size={20} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <form
              className={styles.modalContent}
              onSubmit={handleCreateInstant}
            >
              <div className={styles.formGroup}>
                <label htmlFor="conference-title">
                  Название созвона
                </label>

                <input
                  id="conference-title"
                  type="text"
                  value={createForm.title}
                  onChange={(event) => handleCreateFormChange('title', event.target.value)}
                  placeholder="Например: Быстрое обсуждение задач"
                  className={`${styles.input} ${createErrors.title ? styles.inputError : ''}`}
                  aria-invalid={Boolean(createErrors.title)}
                  disabled={createLoading}
                  maxLength={CONFERENCE_TITLE_LIMIT}
                  autoFocus
                />

                {createErrors.title ? (
                  <span className={styles.fieldError} role="alert">
                    {createErrors.title}
                  </span>
                ) : (
                  <span className={styles.fieldHelper}>
                    От 2 до {CONFERENCE_TITLE_LIMIT} символов
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="conference-max-participants">
                  Максимум участников
                </label>

                <input
                  id="conference-max-participants"
                  type="number"
                  min={MIN_CONFERENCE_PARTICIPANTS}
                  max={MAX_CONFERENCE_PARTICIPANTS}
                  value={createForm.max_participants}
                  onChange={(event) => handleCreateFormChange('max_participants', event.target.value)}
                  className={`${styles.input} ${createErrors.max_participants ? styles.inputError : ''}`}
                  aria-invalid={Boolean(createErrors.max_participants)}
                  disabled={createLoading}
                />

                {createErrors.max_participants ? (
                  <span className={styles.fieldError} role="alert">
                    {createErrors.max_participants}
                  </span>
                ) : (
                  <span className={styles.fieldHelper}>
                    От {MIN_CONFERENCE_PARTICIPANTS} до {MAX_CONFERENCE_PARTICIPANTS} участников
                  </span>
                )}
              </div>

              <div className={styles.inviteSection}>
                <div className={styles.inviteTopline}>
                  <label htmlFor="conference-invite-search">
                    Пригласить участников
                  </label>

                  {selectedInvitedUsers.length > 0 && (
                    <span>
                      {formatRussianCount(selectedInvitedUsers.length, PARTICIPANT_FORMS)}
                    </span>
                  )}
                </div>

                {selectedInvitedUsers.length > 0 && (
                  <div className={styles.selectedUsers}>
                    {selectedInvitedUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={styles.selectedUser}
                        onClick={() => toggleInvitedUser(user)}
                        disabled={createLoading}
                      >
                        {formatUserLabel(user)}
                        <X size={13} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.inviteSearch}>
                  <Search size={15} strokeWidth={2} aria-hidden="true" />
                  <input
                    id="conference-invite-search"
                    type="text"
                    value={inviteQuery}
                    onChange={(event) => setInviteQuery(event.target.value)}
                    placeholder="Поиск по имени, логину или email"
                    maxLength={INVITE_QUERY_LIMIT}
                    disabled={createLoading}
                  />
                </div>

                <div className={styles.usersList}>
                  {inviteLoading ? (
                    <div className={styles.usersState}>
                      Загрузка пользователей...
                    </div>
                  ) : invitableUsers.length === 0 ? (
                    <div className={styles.usersState}>
                      Нет доступных пользователей
                    </div>
                  ) : (
                    invitableUsers.map((user) => {
                      const selected = isUserSelected(user.id);

                      return (
                        <button
                          key={user.id}
                          type="button"
                          className={`${styles.userOption} ${
                            selected ? styles.userOptionSelected : ''
                          }`}
                          onClick={() => toggleInvitedUser(user)}
                          disabled={createLoading}
                        >
                          <span className={styles.userAvatar}>
                            <UserPlus size={15} strokeWidth={2} aria-hidden="true" />
                          </span>

                          <span className={styles.userInfo}>
                            <strong>{formatUserLabel(user)}</strong>
                            <small>{user.email}</small>
                          </span>

                          {selected && (
                            <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className={styles.modalHint}>
                <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
                Мгновенный созвон не привязывается к проекту, группе или задаче.
              </div>

              {createErrors.submit && (
                <div className={styles.submitError} role="alert">
                  {createErrors.submit}
                </div>
              )}

              <div className={styles.modalActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCloseCreateModal}
                  disabled={createLoading}
                >
                  Отмена
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={createLoading}
                  disabled={!createForm.title.trim() || createLoading}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden="true" />
                  Создать
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {statsRoom && (
        <div
          className={styles.modalOverlay}
          onClick={handleStatsOverlayClick}
        >
          <div
            className={`${styles.modal} ${styles.statsModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="conference-stats-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="conference-stats-title">
                  Статистика созвона
                </h2>
              </div>

              <button
                className={styles.closeButton}
                onClick={() => {
                  setStatsRoom(null);
                  setStatsData(null);
                  setStatsError('');
                }}
                type="button"
                aria-label="Закрыть статистику созвона"
              >
                <X size={20} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalContent}>
              <h3 className={styles.statsTitle}>{statsRoom.title}</h3>

              {statsLoading ? (
                <div className={styles.usersState}>
                  Загрузка статистики...
                </div>
              ) : statsError ? (
                <div className={styles.statsError}>
                  {statsError}
                </div>
              ) : statsData ? (
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <span>Участников</span>
                    <strong>{statsData.participant_count ?? 0}</strong>
                  </div>

                  <div className={styles.statCard}>
                    <span>Пик участников</span>
                    <strong>{statsData.peak_participants ?? 0}</strong>
                  </div>

                  <div className={styles.statCard}>
                    <span>Длительность</span>
                    <strong>{formatDuration(statsData.duration_seconds)}</strong>
                  </div>

                  <div className={styles.statCard}>
                    <span>Сообщений</span>
                    <strong>{statsData.messages_count ?? 0}</strong>
                  </div>
                </div>
              ) : (
                <div className={styles.usersState}>
                  Статистика недоступна
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};