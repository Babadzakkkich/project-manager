export const classNames = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('ru-RU');
};