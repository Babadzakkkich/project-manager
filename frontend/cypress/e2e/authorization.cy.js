describe('E2E: authorization smoke', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('AUTH-01: главная страница доступна гостю', () => {
    cy.visitAsGuest('/');

    cy.contains('Проектный менеджер').should('be.visible');
    cy.contains('Syncro').should('be.visible');
    cy.contains('Начать').should('be.visible');
    cy.contains('Войти').should('be.visible');
  });

  it('AUTH-02: успешная регистрация', () => {
    const suffix = Date.now();

    cy.mockRegisterSuccess();
    cy.visitAsGuest('/register');

    cy.fillRegisterForm({
      login: `user_${suffix}`,
      email: `user_${suffix}@example.com`,
      name: 'Test User',
      password: 'Password123',
      confirmPassword: 'Password123',
    });

    cy.contains('button', 'Зарегистрироваться').click();
    cy.wait('@registerRequest');

    cy.contains('Регистрация успешна!').should('be.visible');
    cy.contains('Войти в систему').should('be.visible');
  });

  it('AUTH-03: регистрация не проходит при несовпадении паролей', () => {
    cy.visitAsGuest('/register');

    cy.fillRegisterForm({
      login: 'user_test',
      email: 'user_test@example.com',
      name: 'Mismatch User',
      password: 'Password123',
      confirmPassword: 'Password999',
    });

    cy.contains('button', 'Зарегистрироваться').click();

    cy.contains('Пароли не совпадают').should('be.visible');
  });

  it('AUTH-04: успешный вход и переход в workspace', () => {
    const user = {
      id: 7,
      login: 'member_1',
      email: 'member_1@example.com',
      name: 'Member One',
    };

    let authCheckCount = 0;
    cy.intercept(
      { method: 'GET', pathname: '/auth/check' },
      (req) => {
        authCheckCount += 1;

        if (authCheckCount === 1) {
          req.reply({
            statusCode: 200,
            body: { authenticated: false },
          });
        } else {
          req.reply({
            statusCode: 200,
            body: {
              authenticated: true,
              user,
            },
          });
        }
      }
    ).as('checkAuthFlow');

    cy.intercept('POST', '**/auth/login', {
      statusCode: 200,
      body: { message: 'Успешный вход в систему' },
    }).as('loginRequest');

    cy.intercept(
      { method: 'GET', pathname: '/notifications/' },
      { statusCode: 200, body: [] }
    ).as('notificationsList');

    cy.intercept(
      { method: 'GET', pathname: '/notifications/unread/count' },
      { statusCode: 200, body: { count: 0 } }
    ).as('notificationsUnread');

    cy.intercept(
      { method: 'GET', pathname: '/groups/invitations/pending' },
      { statusCode: 200, body: [] }
    ).as('pendingInvitations');

    cy.intercept('GET', '**/projects/my', {
      statusCode: 200,
      body: [],
    }).as('myProjects');

    cy.intercept('GET', '**/tasks/my', {
      statusCode: 200,
      body: [],
    }).as('myTasks');

    cy.visit('/login');

    cy.get('input[name="login"]').should('be.visible').type('member_1');
    cy.get('input[name="password"]').should('be.visible').type('Password123');

    cy.contains('button', 'Войти').click();

    cy.wait('@loginRequest');
    cy.wait('@myProjects');
    cy.wait('@myTasks');
    cy.wait('@notificationsList');
    cy.wait('@notificationsUnread');
    cy.wait('@pendingInvitations');

    cy.url().should('include', '/workspace');
    cy.contains('Рабочее пространство').should('be.visible');
    cy.contains('Быстрые действия').should('be.visible');
  });

  it('AUTH-05: неуспешный вход оставляет пользователя на странице логина', () => {
    cy.intercept(
      { method: 'GET', pathname: '/auth/check' },
      {
        statusCode: 200,
        body: { authenticated: false },
      }
    ).as('checkAuthInitial');

    cy.intercept('POST', '**/auth/login', {
      statusCode: 401,
      body: { detail: 'Неверные учетные данные' },
    }).as('loginRequest');

    cy.intercept('POST', '**/auth/refresh', {
      statusCode: 401,
      body: { detail: 'Refresh token invalid' },
    }).as('refreshAfterFailedLogin');

    cy.visit('/login');
    cy.wait('@checkAuthInitial');

    cy.get('input[name="login"]').should('be.visible').type('wrong_user');
    cy.get('input[name="password"]').should('be.visible').type('wrongpass');

    cy.contains('button', 'Войти').click();

    cy.wait('@loginRequest');
    cy.wait('@refreshAfterFailedLogin');

    cy.url().should('include', '/login');

    cy.get('body').should(($body) => {
      const text = $body.text();
      expect(
        /неверн|ошиб|invalid|unauthorized/i.test(text),
        `Ожидался текст ошибки, фактический текст страницы:\n${text}`
      ).to.eq(true);
    });
  });

  it('AUTH-06: авторизованный пользователь выходит из системы', () => {
    cy.mockAuthenticated({
      id: 5,
      login: 'qa_admin',
      email: 'qa_admin@example.com',
      name: 'QA Admin',
    });

    cy.intercept('GET', '**/projects/my', { statusCode: 200, body: [] }).as('myProjects');
    cy.intercept('GET', '**/tasks/my', { statusCode: 200, body: [] }).as('myTasks');

    cy.intercept('POST', '**/auth/logout', {
      statusCode: 200,
      body: { detail: 'Успешный выход из системы' },
    }).as('logoutRequest');

    cy.visit('/workspace');
    cy.wait('@checkAuth');
    cy.wait('@myProjects');
    cy.wait('@myTasks');

    cy.get('button[aria-expanded="false"], button[aria-expanded="true"]').last().click();
    cy.contains('Выйти из аккаунта').click();

    cy.wait('@logoutRequest');
    cy.url().should('include', '/login');
  });
});