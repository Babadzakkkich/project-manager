import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import styles from './Layout.module.css';

export const Layout = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className={styles.publicLayout}>
        <main className={styles.publicMain}>{children}</main>
      </div>
    );
  }

  return (
    <div className={`${styles.layout} ${isSidebarCollapsed ? styles.collapsed : ''}`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className={styles.shell}>
        <Topbar />

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
};