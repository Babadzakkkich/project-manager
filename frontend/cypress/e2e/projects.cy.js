const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

describe('E2E: projects smoke', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('PROJ-01: создание проекта с группой', () => {
  const currentUser = {
    id: 10,
    login: 'admin_user',
    email: 'admin@example.com',
    name: 'Admin User',
  };

  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 5);

  cy.mockAuthenticated(currentUser);

  cy.intercept('GET', '**/groups/my', {
    statusCode: 200,
    body: [
      {
        id: 11,
        name: 'QA Team',
        description: 'Команда тестирования',
        users: [
          { id: 10, login: 'admin_user', role: 'admin' },
          { id: 12, login: 'member_1', role: 'member' },
        ],
        projects: [],
      },
    ],
  }).as('myGroups');

  cy.intercept('POST', '**/projects', (req) => {
    req.reply({
      statusCode: 201,
      body: {
        id: 77,
        ...req.body,
        created_at: new Date().toISOString(),
      },
    });
  }).as('createProject');

  cy.visit('/projects/create');
  cy.wait('@checkAuth');
  cy.wait('@myGroups');

  cy.contains('Создание проекта').should('be.visible');

  cy.get('input[name="title"]').type('Cypress Project');
  cy.get('textarea[name="description"]').type('Проект, созданный e2e-тестом');

  cy.get('input[name="start_date"]').clear().type(formatDate(today));
  cy.get('input[name="end_date"]').clear().type(formatDate(end));

  cy.contains('QA Team').click();
  cy.contains('Выбрано групп: 1').should('be.visible');

  cy.contains('button', 'Создать проект').click();
  cy.wait('@createProject');

  cy.contains('Проект успешно создан!').should('be.visible');
  cy.contains('Перейти к проекту').should('be.visible');
});

  it('PROJ-02: проект не создаётся без выбранной группы', () => {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 5);

  cy.mockAuthenticated();

  cy.intercept('GET', '**/groups/my', {
    statusCode: 200,
    body: [
      {
        id: 11,
        name: 'QA Team',
        description: 'Команда тестирования',
        users: [{ id: 1, login: 'admin_user', role: 'admin' }],
        projects: [],
      },
    ],
  }).as('myGroups');

  cy.visit('/projects/create');
  cy.wait('@checkAuth');
  cy.wait('@myGroups');

  cy.get('input[name="title"]').type('Project without group');
  cy.get('input[name="start_date"]').clear().type(formatDate(today));
  cy.get('input[name="end_date"]').clear().type(formatDate(end));

  cy.contains('button', 'Создать проект').click();

  cy.contains('Выберите хотя бы одну группу').should('be.visible');
});
});