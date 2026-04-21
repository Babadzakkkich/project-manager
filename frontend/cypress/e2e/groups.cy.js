describe('E2E: groups smoke', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('GROUP-01: создание группы через UI', () => {
    cy.mockAuthenticated({
      id: 1,
      login: 'admin_user',
      email: 'admin@example.com',
      name: 'Admin User',
    });

    cy.intercept('POST', '**/groups/', (req) => {
      req.reply({
        statusCode: 201,
        body: {
          id: 55,
          name: req.body.name,
          description: req.body.description,
          users: [],
          projects: [],
        },
      });
    }).as('createGroup');

    cy.visit('/groups/create');
    cy.wait('@checkAuth');

    cy.contains('Создание групп').should('be.visible');

    cy.get('input[name="name_0"]').type('QA Auto Group');
    cy.get('textarea[name="description_0"]').type('Группа для e2e-проверки');

    cy.contains('button', 'Создать группу').click();
    cy.wait('@createGroup');

    cy.contains('Группы успешно созданы!').should('be.visible');
    cy.contains('Группа "QA Auto Group"').should('be.visible');
  });

  it('GROUP-02: кнопка создания группы неактивна, пока не заполнено название', () => {
  cy.mockAuthenticated({
    id: 1,
    login: 'admin_user',
    email: 'admin@example.com',
    name: 'Admin User',
  });

  cy.visit('/groups/create');
  cy.wait('@checkAuth');

  cy.contains('Создание групп').should('be.visible');

  cy.contains('button', 'Создать группу').should('be.disabled');

  cy.get('input[name="name_0"]').type('QA Auto Group');

  cy.contains('button', 'Создать группу').should('not.be.disabled');
  });
});