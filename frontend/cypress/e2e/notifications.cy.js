const notificationsUser = {
  id: 1,
  login: 'admin_user',
  email: 'admin@example.com',
  name: 'Admin User',
};

const notificationItems = [
  {
    id: 1001,
    type: 'task_created',
    title: 'Создана новая задача',
    content: 'Задача "Smoke Task" была создана',
    is_read: false,
    priority: 'medium',
    created_at: new Date().toISOString(),
    data: {
      task_id: 501,
    },
  },
  {
    id: 1002,
    type: 'project_created',
    title: 'Создан проект',
    content: 'Проект "Project Alpha" был создан',
    is_read: true,
    priority: 'low',
    created_at: new Date().toISOString(),
    data: {
      project_id: 101,
    },
  },
];

const pendingInvitation = {
  id: 3001,
  token: 'invite-token-123',
  group_name: 'QA Team',
  invited_by: 'admin_user',
  role: 'member',
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe('E2E: notifications smoke', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('NOTIF-01: отображается список уведомлений и счетчик непрочитанных', () => {
    cy.mockAuthenticated(notificationsUser);

    cy.intercept('GET', '**/notifications/?*', {
      statusCode: 200,
      body: {
        items: notificationItems,
        unread_count: 1,
      },
    }).as('getNotifications');

    cy.intercept('GET', '**/notifications/unread/count', {
      statusCode: 200,
      body: { count: 1 },
    }).as('getUnreadCount');

    cy.intercept('GET', '**/groups/invitations/pending', {
      statusCode: 200,
      body: [],
    }).as('getPendingInvitations');

    cy.visit('/notifications');
    cy.wait('@checkAuth');
    cy.wait('@getNotifications');
    cy.wait('@getUnreadCount');
    cy.wait('@getPendingInvitations');

    cy.contains('Уведомления').should('be.visible');
    cy.contains('Создана новая задача').should('be.visible');
    cy.contains('Создан проект').should('be.visible');
    cy.contains('Отметить все как прочитанные (1)').should('be.visible');
  });

  it('NOTIF-02: пользователь видит действие для пометки уведомлений как прочитанных', () => {
  cy.mockAuthenticated(notificationsUser);

  cy.intercept('GET', '**/notifications/?*', {
    statusCode: 200,
    body: {
      items: notificationItems,
      unread_count: 1,
    },
  }).as('getNotifications');

  cy.intercept('GET', '**/notifications/unread/count', {
    statusCode: 200,
    body: { count: 1 },
  }).as('getUnreadCount');

  cy.intercept('GET', '**/groups/invitations/pending', {
    statusCode: 200,
    body: [],
  }).as('getPendingInvitations');

  cy.visit('/notifications');
  cy.wait('@checkAuth');
  cy.wait('@getNotifications');
  cy.wait('@getUnreadCount');
  cy.wait('@getPendingInvitations');

  cy.contains('Уведомления').should('be.visible');
  cy.contains('Создана новая задача').should('be.visible');

  cy.get('body').should(($body) => {
    const text = $body.text();
    expect(
      /отметить все как прочитанные/i.test(text),
      `Не найдено действие "Отметить все как прочитанные". Текст страницы:\n${text}`
    ).to.eq(true);
  });
});

  it('NOTIF-03: приглашение отображается пользователю', () => {
  cy.mockAuthenticated(notificationsUser);

  cy.intercept('GET', '**/notifications/?*', {
    statusCode: 200,
    body: {
      items: [],
      unread_count: 0,
    },
  }).as('getNotifications');

  cy.intercept('GET', '**/notifications/unread/count', {
    statusCode: 200,
    body: { count: 0 },
  }).as('getUnreadCount');

  cy.intercept('GET', '**/groups/invitations/pending', {
    statusCode: 200,
    body: [pendingInvitation],
  }).as('getPendingInvitations');

  cy.visit('/notifications');
  cy.wait('@checkAuth');
  cy.wait('@getNotifications');
  cy.wait('@getUnreadCount');
  cy.wait('@getPendingInvitations');

  cy.contains('Уведомления').should('be.visible');
  cy.get('body').should(($body) => {
    const text = $body.text();
    expect(
      /qa team/i.test(text),
      `Не найдено название группы в приглашении. Текст страницы:\n${text}`
    ).to.eq(true);
  });

  cy.get('body').should(($body) => {
    const text = $body.text();
    expect(
      /принять|accept/i.test(text),
      `Не найдена кнопка/действие принятия приглашения. Текст страницы:\n${text}`
    ).to.eq(true);
  });
});

  it('NOTIF-04: пустое состояние отображается при отсутствии уведомлений и приглашений', () => {
    cy.mockAuthenticated(notificationsUser);

    cy.intercept('GET', '**/notifications/?*', {
      statusCode: 200,
      body: {
        items: [],
        unread_count: 0,
      },
    }).as('getNotifications');

    cy.intercept('GET', '**/notifications/unread/count', {
      statusCode: 200,
      body: { count: 0 },
    }).as('getUnreadCount');

    cy.intercept('GET', '**/groups/invitations/pending', {
      statusCode: 200,
      body: [],
    }).as('getPendingInvitations');

    cy.visit('/notifications');
    cy.wait('@checkAuth');
    cy.wait('@getNotifications');
    cy.wait('@getUnreadCount');
    cy.wait('@getPendingInvitations');

    cy.contains('Нет уведомлений').should('be.visible');
  });
});