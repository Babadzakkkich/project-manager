describe('Главная страница Project Manager Syncro', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('1. Загружает главную страницу', () => {
    cy.url().should('eq', 'http://localhost:3000/');
    
    cy.get('body').should('exist');
    cy.get('div').should('exist');
    
    cy.wait(1000);
  });

  it('2. Показывает основной заголовок', () => {
    cy.contains('Проектный менеджер', { matchCase: false }).should('exist');
    cy.contains('Syncro', { matchCase: false }).should('exist');
  });

  it('3. Показывает описание проекта', () => {
    cy.contains('Эффективное управление').should('exist');
    cy.contains('Создавайте группы').should('exist');
  });

  it('4. Видит кнопки "Начать" и "Войти"', () => {
    cy.contains('Начать').should('exist');
    cy.contains('Войти').should('exist');
    
    cy.contains('Начать').parent('a').should('have.attr', 'href', '/register');
    cy.contains('Войти').parent('a').should('have.attr', 'href', '/login');
  });

  it('5. Кнопки ведут на правильные страницы', () => {
    cy.contains('Начать').click();
    cy.url().should('include', '/register');
    cy.go('back');
    
    cy.contains('Войти').click();
    cy.url().should('include', '/login');
    cy.go('back');
  });

  it('6. Показывает преимущества', () => {
    cy.contains('Управление командами').should('exist');
    cy.contains('Контроль проектов').should('exist');
    cy.contains('Постановка задач').should('exist');
  });

  it('7. Проверяет эмодзи в преимуществах', () => {
    cy.contains('👥').should('exist');
    cy.contains('📊').should('exist');
    cy.contains('✅').should('exist');
  });
});