// ============================================================
// Custom Commands для Syncro Project Manager
// ============================================================

// ---------- НАВИГАЦИЯ ----------
Cypress.Commands.add('goToHome', () => {
  cy.visit('/');
});

Cypress.Commands.add('goToRegister', () => {
  cy.visit('/register');
  cy.wait(1000); // Даем время на рендер
});

Cypress.Commands.add('goToLogin', () => {
  cy.visit('/login');
  cy.wait(1000);
});

// ---------- ПРОВЕРКИ СТРАНИЦ ----------
Cypress.Commands.add('assertRegisterPage', () => {
  cy.url().should('include', '/register');
  cy.contains('Регистрация').should('be.visible');
});

Cypress.Commands.add('assertLoginPage', () => {
  cy.url().should('include', '/login');
  cy.contains('Вход в систему').should('be.visible');
});

// ---------- РАБОТА С ФОРМАМИ ----------
Cypress.Commands.add('safeType', (selector, text) => {
  cy.get(selector).clear();
  cy.get(selector).type(text);
});

Cypress.Commands.add('fillRegisterForm', (userData = {}) => {
  const defaultData = {
    login: `testuser${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    name: `Test User`,
    password: 'TestPassword123!',
    confirmPassword: 'TestPassword123!'
  };
  
  const data = { ...defaultData, ...userData };
  
  cy.contains('Логин').parent().find('input').as('loginField');
  cy.get('@loginField').clear();
  cy.get('@loginField').type(data.login);
  
  cy.contains('Email').parent().find('input').as('emailField');
  cy.get('@emailField').clear();
  cy.get('@emailField').type(data.email);
  
  cy.contains('Имя').parent().find('input').as('nameField');
  cy.get('@nameField').clear();
  cy.get('@nameField').type(data.name);
  
  cy.contains('Пароль').parent().find('input').as('passwordField');
  cy.get('@passwordField').clear();
  cy.get('@passwordField').type(data.password);
  
  cy.contains('Подтверждение пароля').parent().find('input').as('confirmField');
  cy.get('@confirmField').clear();
  cy.get('@confirmField').type(data.confirmPassword);
});

Cypress.Commands.add('fillLoginForm', (credentials = {}) => {
  const defaultCreds = {
    login: 'test@example.com',
    password: 'TestPassword123!'
  };
  
  const creds = { ...defaultCreds, ...credentials };
  
  cy.contains('Логин').parent().find('input').as('loginInput');
  cy.get('@loginInput').clear();
  cy.get('@loginInput').type(creds.login);
  
  cy.contains('Пароль').parent().find('input').as('passwordInput');
  cy.get('@passwordInput').clear();
  cy.get('@passwordInput').type(creds.password);
});

Cypress.Commands.add('submitAuthForm', () => {
  cy.contains('button', 'Зарегистрироваться').click({ force: true }) ||
  cy.contains('button', 'Войти').click({ force: true });
  
  cy.wait(1000);
});

// ---------- API МОКИ для ваших endpoint'ов ----------
Cypress.Commands.add('mockRegisterSuccess', () => {
  cy.intercept('POST', '**/auth/register', {
    statusCode: 201,
    body: {
      message: 'Пользователь успешно зарегистрирован',
      user: {
        id: 1,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User'
      }
    }
  }).as('registerRequest');
});

Cypress.Commands.add('mockRegisterError', (error = 'Пользователь уже существует') => {
  cy.intercept('POST', '**/auth/register', {
    statusCode: 400,
    body: { detail: error }
  }).as('registerError');
});

Cypress.Commands.add('mockLoginSuccess', () => {
  cy.intercept('POST', '**/auth/login', {
    statusCode: 200,
    body: {
      access_token: 'fake-jwt-token-12345',
      token_type: 'bearer',
      user: {
        id: 1,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User'
      }
    }
  }).as('loginRequest');
});

Cypress.Commands.add('mockLoginError', (error = 'Неверные учетные данные') => {
  cy.intercept('POST', '**/auth/login', {
    statusCode: 401,
    body: { detail: error }
  }).as('loginError');
});

Cypress.Commands.add('mockLogoutSuccess', () => {
  cy.intercept('POST', '**/auth/logout', {
    statusCode: 200,
    body: { message: 'Logged out successfully' }
  }).as('logoutRequest');
});

// ---------- ПОЛЬЗОВАТЕЛЬСКИЕ СЦЕНАРИИ ----------
Cypress.Commands.add('loginWithMock', (credentials) => {
  cy.mockLoginSuccess();
  cy.goToLogin();
  cy.fillLoginForm(credentials);
  cy.submitAuthForm();
  cy.wait('@loginRequest');
});

Cypress.Commands.add('logoutWithMock', () => {
  cy.mockLogoutSuccess();
  cy.get('[data-testid="user-menu"], button').contains('Выйти').click({ force: true });
  cy.wait('@logoutRequest');
});