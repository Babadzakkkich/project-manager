import React from 'react';
import { Header } from './Header';
import styles from './Layout.module.css';

export const Layout = ({ children }) => {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
};