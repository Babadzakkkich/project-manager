import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/layout';
import { AppRoutes } from './routes/AppRoutes';
import { Notification } from './components/ui/Notification';
import { useNotification } from './hooks/useNotification';
import './App.css';

function AppContent() {
  const { notification, hideNotification } = useNotification();

  // Обработчик для toast-уведомлений из системных уведомлений
  useEffect(() => {
    const handleToastShow = (event) => {
      const { message, type, duration, onClick } = event.detail;
      
      // Используем существующую систему toast-уведомлений
      // Но с возможностью переопределить onClick
      const showEvent = new CustomEvent('notification:show', {
        detail: { message, type, duration, onClick }
      });
      window.dispatchEvent(showEvent);
    };

    window.addEventListener('toast:show', handleToastShow);
    return () => window.removeEventListener('toast:show', handleToastShow);
  }, []);

  return (
    <>
      <Layout>
        <AppRoutes />
      </Layout>
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
        duration={notification.duration || 5000}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;