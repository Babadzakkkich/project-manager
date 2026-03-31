describe('Простая регистрация (рабочий вариант)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.goToRegister();
  });

  it('1. Проверяет что страница регистрации загружается', () => {
    cy.contains('Регистрация').should('be.visible');
    cy.contains('Создайте новый аккаунт').should('be.visible');
    
    const fields = ['Логин', 'Email', 'Имя', 'Пароль', 'Подтверждение пароля'];
    fields.forEach(field => {
      cy.contains(field).should('be.visible');
    });
    
    cy.contains('button', 'Зарегистрироваться').should('be.visible');
  });

  it('2. Заполняет форму и отправляет (с моком API)', () => {
    cy.intercept('POST', '**/auth/register', {
      statusCode: 201,
      body: { message: 'Success' }
    }).as('registerApi');
    
    cy.contains('Логин').parent().find('input').as('loginInput');
    cy.get('@loginInput').clear();
    cy.get('@loginInput').type(`testuser${Date.now()}`);
    
    cy.contains('Email').parent().find('input').as('emailInput');
    cy.get('@emailInput').clear();
    cy.get('@emailInput').type(`test${Date.now()}@example.com`);
    
    cy.contains('Имя').parent().find('input').as('nameInput');
    cy.get('@nameInput').clear();
    cy.get('@nameInput').type('Test User');
    
    cy.contains('Пароль').parent().find('input').as('passwordInput');
    cy.get('@passwordInput').clear();
    cy.get('@passwordInput').type('TestPassword123!');
    
    cy.contains('Подтверждение пароля').parent().find('input').as('confirmInput');
    cy.get('@confirmInput').clear();
    cy.get('@confirmInput').type('TestPassword123!');
    
    cy.contains('button', 'Зарегистрироваться').click();
    
    cy.wait('@registerApi', { timeout: 10000 });
    
    cy.contains('успеш', { matchCase: false }).should('be.visible') ||
    cy.url().should('include', '/login');
  });

  it('3. Показывает ошибку при несовпадении паролей', () => {
    cy.contains('Логин').parent().find('input').type('testuser');
    cy.contains('Email').parent().find('input').type('test@example.com');
    cy.contains('Имя').parent().find('input').type('Test User');
    cy.contains('Пароль').parent().find('input').type('Password123');
    cy.contains('Подтверждение пароля').parent().find('input').type('DifferentPassword');
    
    cy.contains('button', 'Зарегистрироваться').click();
    
    cy.contains('парол', { matchCase: false }).should('be.visible');
  });

  it('4. Ссылка на вход работает', () => {
    cy.contains('Уже есть аккаунт?').should('be.visible');
    cy.contains('a', 'Войти').click();
    
    cy.url().should('include', '/login');
    cy.contains('Вход в систему').should('be.visible');
  });
});