import React from 'react';
import { Link } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, EffectCards } from 'swiper/modules'; // Убрали Autoplay

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-cards';

import { Button } from '../../components/ui/Button';
import styles from './Home.module.css';

export const Home = () => {
  const cards = [
    { 
      id: 1, 
      color: 'linear-gradient(135deg, #38B000, #004B23)', 
      icon: '👥',
      title: 'Управление командами',
      description: 'Создавайте группы, назначайте роли и координируйте работу участников'
    },
    { 
      id: 2, 
      color: 'linear-gradient(135deg, #007200, #004B23)', 
      icon: '📊',
      title: 'Контроль проектов',
      description: 'Отслеживайте прогресс, сроки выполнения и загруженность команды'
    },
    { 
      id: 3, 
      color: 'linear-gradient(135deg, #006400, #004B23)', 
      icon: '✅',
      title: 'Постановка задач',
      description: 'Четко формулируйте цели, назначайте ответственных и контролируйте выполнение'
    },
    { 
      id: 4, 
      color: 'linear-gradient(135deg, #38B000, #006400)', 
      icon: '📈',
      title: 'Аналитика проектов',
      description: 'Детальная статистика по задачам, срокам и эффективности команды'
    },
    { 
      id: 5, 
      color: 'linear-gradient(135deg, #007200, #38B000)', 
      icon: '🔔',
      title: 'Уведомления',
      description: 'Мгновенные оповещения о новых задачах, дедлайнах и изменениях'
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.title}>
            Проектный менеджер
            <span className={styles.highlight}> Syncro</span>
          </h1>
          <p className={styles.subtitle}>
            Эффективное управление проектами, задачами и командами. 
            Создавайте группы, распределяйте задачи и достигайте целей вместе.
          </p>
          <div className={styles.buttons}>
            <Link to="/register">
              <Button variant="primary" size="large">
                Начать
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="primary" size="large">
                Войти
              </Button>
            </Link>
          </div>
        </div>
        
        <div className={styles.swiperContainer}>
          <Swiper
            effect="cards"
            modules={[EffectCards, Pagination]}
            pagination={{ 
              clickable: true,
              dynamicBullets: true,
            }}
            cardsEffect={{
              slideShadows: true,
              rotate: true,
              perSlideOffset: 8,
              perSlideRotate: 2,
            }}
            grabCursor={true}
            className={styles.mySwiper}
          >
            {cards.map((card) => (
              <SwiperSlide key={card.id} className={styles.swiperSlide}>
                <div 
                  className={styles.cardContent}
                  style={{ background: card.color }}
                >
                  <div className={styles.cardIcon}>{card.icon}</div>
                  <h3 className={styles.cardTitle}>{card.title}</h3>
                  <p className={styles.cardDescription}>{card.description}</p>
                  <div className={styles.cardFooter}>
                    <span className={styles.cardFeature}>Подробнее →</span>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
      
      <div className={styles.features}>
        <div className={styles.feature}>
          <h3>👥 Управление командами</h3>
          <p>Создавайте группы и эффективно распределяйте роли</p>
        </div>
        <div className={styles.feature}>
          <h3>📊 Контроль проектов</h3>
          <p>Отслеживайте прогресс и сроки выполнения</p>
        </div>
        <div className={styles.feature}>
          <h3>✅ Постановка задач</h3>
          <p>Четко формулируйте цели и назначайте ответственных</p>
        </div>
      </div>
    </div>
  );
};