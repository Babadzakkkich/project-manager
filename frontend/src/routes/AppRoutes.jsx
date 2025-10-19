import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { Home } from '../pages/Home';
import { Login } from '../pages/Login';
import { Workspace } from '../pages/Workspace';
import { CreateGroup } from '../pages/GroupsPages/CreateGroup';
import { Groups } from '../pages/GroupsPages/Groups';
import { GroupDetail } from '../pages/GroupsPages/GroupDetail';
import { CreateProject } from '../pages/ProjectsPages/CreateProject/CreateProject';
import { Projects } from '../pages/ProjectsPages/Projects/Projects';
import { ProjectDetail } from '../pages/ProjectsPages/ProjectDetail/ProjectDetail';
import { CreateTask } from '../pages/TasksPages/CreateTask/CreateTask';
import { Tasks } from '../pages/TasksPages/Tasks/Tasks';
import { TaskDetail } from '../pages/TasksPages/TaskDetail/TaskDetail';
import { Profile } from '../pages/Profile/Profile';

const LoadingSpinner = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    fontSize: '18px',
    color: '#666',
    flexDirection: 'column',
    gap: '16px'
  }}>
    <div>Проверка авторизации...</div>
    <div style={{ 
      width: '40px', 
      height: '40px', 
      border: '4px solid #f3f3f3', 
      borderTop: '4px solid #004B23', 
      borderRadius: '50%', 
      animation: 'spin 1s linear infinite' 
    }}></div>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading, authChecked } = useAuthContext();
  
  if (loading && !authChecked) {
    return <LoadingSpinner />;
  }
  
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading, authChecked } = useAuthContext();
  
  if (loading && !authChecked) {
    return <LoadingSpinner />;
  }
  
  return !isAuthenticated ? children : <Navigate to="/workspace" replace />;
};

// Главная страница с автоматической переадресацией
const HomeRoute = () => {
  const { isAuthenticated, loading, authChecked } = useAuthContext();
  
  if (loading && !authChecked) {
    return <LoadingSpinner />;
  }
  
  // Если авторизован - редирект на workspace, иначе показываем главную
  return isAuthenticated ? <Navigate to="/workspace" replace /> : <Home />;
};

const DashboardPage = () => (
  <div style={{ padding: '40px' }}>
    <h1>Панель управления</h1>
    <p>Добро пожаловать в Syncro!</p>
  </div>
);

export const AppRoutes = () => {
  return (
    <Routes>
      {/* Главная страница с автоматической переадресацией */}
      <Route path="/" element={<HomeRoute />} />
      
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      <Route 
        path="/register" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <PrivateRoute>
            <Profile />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/workspace" 
        element={
          <PrivateRoute>
            <Workspace />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/groups" 
        element={
          <PrivateRoute>
            <Groups />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/groups/:groupId" 
        element={
          <PrivateRoute>
            <GroupDetail />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/projects" 
        element={
          <PrivateRoute>
            <Projects />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/projects/:projectId" 
        element={
          <PrivateRoute>
            <ProjectDetail />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/tasks" 
        element={
          <PrivateRoute>
            <Tasks />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/tasks/:taskId" 
        element={
          <PrivateRoute>
            <TaskDetail />
          </PrivateRoute>
        } 
      />
      
      {/* Маршруты для создания */}
      <Route 
        path="/groups/create" 
        element={
          <PrivateRoute>
            <CreateGroup />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/projects/create" 
        element={
          <PrivateRoute>
            <CreateProject />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/tasks/create" 
        element={
          <PrivateRoute>
            <CreateTask />
          </PrivateRoute>
        } 
      />
      
      {/* Резервный маршрут для всех остальных путей */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};