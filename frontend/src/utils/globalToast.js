export const showGlobalToast = (message, type = 'info', duration = 5000) => {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: {
        message,
        type,
        duration,
      },
    })
  );
};

export const showGlobalSuccess = (message, duration = 5000) => {
  showGlobalToast(message, 'success', duration);
};

export const showGlobalError = (message, duration = 5000) => {
  showGlobalToast(message, 'error', duration);
};