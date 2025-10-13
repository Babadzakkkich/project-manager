import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../contexts/AuthContext';
import logo from '../../../assets/logo.png';
import profileIcon from '../../../assets/profile_icon.svg';
import styles from './Header.module.css';

export const Header = () => {
  const { user, logout, isAuthenticated } = useAuthContext();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setIsDropdownOpen(false);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleProfileClick = () => {
    // Пока просто закрываем dropdown, позже добавим страницу профиля
    setIsDropdownOpen(false);
  };

  // Не показываем header если пользователь не авторизован
  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <Link to="/workspace" className={styles.logo}>
          <img src={logo} alt="Syncro" className={styles.logoImage} />
        </Link>
        
        <nav className={styles.nav}>
          <Link to="/groups" className={styles.navLink}>
            Группы
          </Link>
          <Link to="/projects" className={styles.navLink}>
            Проекты
          </Link>
          <Link to="/tasks" className={styles.navLink}>
            Задачи
          </Link>
        </nav>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.profileMenu} ref={dropdownRef}>
          <button 
            className={styles.profileButton}
            onClick={toggleDropdown}
            aria-expanded={isDropdownOpen}
          >
            <img 
              src={profileIcon} 
              alt="Профиль" 
              className={styles.profileIcon}
            />
          </button>
          
          {isDropdownOpen && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>
                <div className={styles.userInfo}>
                  <div className={styles.userLogin}>{user?.login}</div>
                  <div className={styles.userEmail}>{user?.email}</div>
                </div>
              </div>
              
              <div className={styles.dropdownDivider}></div>
              
              <button 
                className={styles.dropdownItem}
                onClick={handleProfileClick}
              >
                Перейти в профиль
              </button>
              
              <div className={styles.dropdownDivider}></div>
              
              <button 
                className={`${styles.dropdownItem} ${styles.logoutItem}`}
                onClick={handleLogout}
              >
                Выйти из аккаунта
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};