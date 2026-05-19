export const FIELD_LIMITS = {
  GROUP_NAME: 100,
  GROUP_DESCRIPTION: 500,
  PROJECT_TITLE: 150,
  PROJECT_DESCRIPTION: 700,
  TASK_TITLE: 200,
  TASK_DESCRIPTION: 1000,
  TASK_TAG: 32,
  TASK_TAGS: 10,
  CONFERENCE_TITLE: 200,
  CONFERENCE_INVITE_QUERY: 120,
  CONFERENCE_KICK_REASON: 300,
  COMMENT: 2000,
  USER_LOGIN: 50,
  USER_NAME: 100,
  USER_EMAIL: 254,
  USER_PASSWORD: 72,
};

const TEXT_WITH_MEANING_RE = /[\p{L}\p{N}]/u;
const TAG_ALLOWED_RE = /^[\p{L}\p{N}_\- ]+$/u;
const LOGIN_ALLOWED_RE = /^[a-zA-Z0-9_.-]+$/;

export const normalizeTextInput = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const hasMeaningfulText = (value) => TEXT_WITH_MEANING_RE.test(String(value || ''));

export const validateTextField = (
  value,
  {
    label = 'Поле',
    min = 1,
    max,
    required = true,
    requireMeaningful = true,
  } = {}
) => {
  const prepared = normalizeTextInput(value);

  if (required && !prepared) {
    return `${label} обязательно`;
  }

  if (!prepared) {
    return '';
  }

  if (prepared.length < min) {
    return `${label} должно содержать минимум ${min} символа`;
  }

  if (typeof max === 'number' && prepared.length > max) {
    return `${label} не должно превышать ${max} символов`;
  }

  if (requireMeaningful && !hasMeaningfulText(prepared)) {
    return `${label} должно содержать хотя бы одну букву или цифру`;
  }

  return '';
};

export const validateOptionalTextField = (value, options = {}) => validateTextField(value, {
  ...options,
  required: false,
});

export const validateEmailField = (value, { label = 'Email', required = true } = {}) => {
  const prepared = normalizeTextInput(value);

  if (required && !prepared) {
    return `${label} обязателен`;
  }

  if (!prepared) {
    return '';
  }

  if (prepared.length > FIELD_LIMITS.USER_EMAIL) {
    return `${label} не должен превышать ${FIELD_LIMITS.USER_EMAIL} символа`;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prepared)) {
    return `Введите корректный ${label.toLowerCase()}`;
  }

  return '';
};

export const validateLoginField = (value) => {
  const prepared = normalizeTextInput(value);

  if (!prepared) {
    return 'Логин обязателен';
  }

  if (prepared.length < 3) {
    return 'Логин должен содержать минимум 3 символа';
  }

  if (prepared.length > FIELD_LIMITS.USER_LOGIN) {
    return `Логин не должен превышать ${FIELD_LIMITS.USER_LOGIN} символов`;
  }

  if (!LOGIN_ALLOWED_RE.test(prepared)) {
    return 'Логин может содержать латинские буквы, цифры, точку, дефис и подчёркивание';
  }

  return '';
};

export const validatePasswordField = (value, { label = 'Пароль' } = {}) => {
  if (!value) {
    return `${label} обязателен`;
  }

  if (value.length < 6) {
    return `${label} должен содержать минимум 6 символов`;
  }

  if (value.length > FIELD_LIMITS.USER_PASSWORD) {
    return `${label} не должен превышать ${FIELD_LIMITS.USER_PASSWORD} символа`;
  }

  return '';
};

export const normalizeTaskTag = (value) => normalizeTextInput(value).replace(/^#+/, '');

export const validateTaskTag = (value, existingTags = []) => {
  const tag = normalizeTaskTag(value);

  if (!tag) {
    return { tag, error: '' };
  }

  if (existingTags.length >= FIELD_LIMITS.TASK_TAGS) {
    return {
      tag,
      error: `Можно добавить не больше ${FIELD_LIMITS.TASK_TAGS} тегов`,
    };
  }

  if (tag.length < 2) {
    return { tag, error: 'Тег должен содержать минимум 2 символа' };
  }

  if (tag.length > FIELD_LIMITS.TASK_TAG) {
    return {
      tag,
      error: `Тег не должен превышать ${FIELD_LIMITS.TASK_TAG} символа`,
    };
  }

  if (!hasMeaningfulText(tag)) {
    return { tag, error: 'Тег должен содержать хотя бы одну букву или цифру' };
  }

  if (!TAG_ALLOWED_RE.test(tag)) {
    return {
      tag,
      error: 'Тег может содержать буквы, цифры, пробел, дефис и подчёркивание',
    };
  }

  const normalizedTag = tag.toLowerCase();
  const hasDuplicate = existingTags.some((item) => String(item).toLowerCase() === normalizedTag);

  if (hasDuplicate) {
    return { tag, error: 'Такой тег уже добавлен' };
  }

  return { tag, error: '' };
};

export const validateTaskTags = (tags = []) => {
  if (!Array.isArray(tags)) {
    return '';
  }

  if (tags.length > FIELD_LIMITS.TASK_TAGS) {
    return `Можно добавить не больше ${FIELD_LIMITS.TASK_TAGS} тегов`;
  }

  const normalizedTags = tags.map((tag) => normalizeTaskTag(tag).toLowerCase());

  if (new Set(normalizedTags).size !== normalizedTags.length) {
    return 'Теги не должны повторяться';
  }

  for (const tag of tags) {
    const preparedTag = normalizeTaskTag(tag);

    if (!preparedTag) {
      return 'Тег не должен быть пустым';
    }

    if (preparedTag.length < 2) {
      return 'Тег должен содержать минимум 2 символа';
    }

    if (preparedTag.length > FIELD_LIMITS.TASK_TAG) {
      return `Тег не должен превышать ${FIELD_LIMITS.TASK_TAG} символа`;
    }

    if (!hasMeaningfulText(preparedTag)) {
      return 'Тег должен содержать хотя бы одну букву или цифру';
    }

    if (!TAG_ALLOWED_RE.test(preparedTag)) {
      return 'Тег может содержать буквы, цифры, пробел, дефис и подчёркивание';
    }
  }

  return '';
};

export const clampNumber = (value, min, max, fallback = min) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
};
