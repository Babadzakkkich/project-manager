const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

const createTaskUser = {
  id: 1,
  login: 'admin_user',
  email: 'admin@example.com',
  name: 'Admin User',
};

const projectFixture = {
  id: 101,
  title: 'Project Alpha',
  description: 'Тестовый проект',
  groups: [
    {
      id: 201,
      name: 'QA Team',
      description: 'Группа тестирования',
    },
  ],
};

const groupDetailFixture = {
  id: 201,
  name: 'QA Team',
  description: 'Группа тестирования',
  users: [
    {
      id: 1,
      login: 'admin_user',
      email: 'admin@example.com',
      role: 'admin',
    },
    {
      id: 2,
      login: 'member_1',
      email: 'member1@example.com',
      role: 'member',
    },
  ],
};

const taskDetailFixture = {
  id: 501,
  title: 'Подготовить smoke e2e',
  description: 'Проверка создания и изменения статуса',
  status: 'todo',
  priority: 'medium',
  start_date: new Date().toISOString(),
  deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  tags: ['qa', 'smoke'],
  created_at: new Date().toISOString(),
  project: {
    id: 101,
    title: 'Project Alpha',
  },
  group: {
    id: 201,
    name: 'QA Team',
    users: [
      {
        id: 1,
        login: 'admin_user',
        email: 'admin@example.com',
        role: 'admin',
      },
      {
        id: 2,
        login: 'member_1',
        email: 'member1@example.com',
        role: 'member',
      },
    ],
  },
  assignees: [
    {
      id: 2,
      login: 'member_1',
      email: 'member1@example.com',
    },
  ],
};

describe('E2E: tasks smoke', () => {
  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it('TASK-01: создание задачи через UI', () => {
    const today = new Date();
    const deadline = new Date();
    deadline.setDate(today.getDate() + 5);

    cy.mockAuthenticated(createTaskUser);

    cy.intercept('GET', '**/projects/my', {
      statusCode: 200,
      body: [projectFixture],
    }).as('myProjects');

    cy.intercept('GET', '**/groups/201', {
      statusCode: 200,
      body: groupDetailFixture,
    }).as('groupDetail');

    cy.intercept('POST', '**/tasks/create_for_users', (req) => {
      expect(req.body.title).to.eq('Smoke Task');
      expect(req.body.project_id).to.eq(101);
      expect(req.body.group_id).to.eq(201);
      expect(req.body.assignee_ids).to.deep.eq([2]);

      req.reply({
        statusCode: 201,
        body: {
          id: 900,
          ...req.body,
        },
      });
    }).as('createTask');

    cy.visit('/tasks/create');
    cy.wait('@checkAuth');
    cy.wait('@myProjects');

    cy.contains('Создание задачи').should('be.visible');

    cy.get('input[name="title"]').type('Smoke Task');
    cy.get('textarea[name="description"]').type('Задача создана e2e-тестом');

    cy.get('input[name="start_date"]').clear().type(formatDate(today));
    cy.get('input[name="deadline"]').clear().type(formatDate(deadline));

    cy.get('select[name="project_id"]').select('101');
    cy.get('select[name="group_id"]').should('not.be.disabled').select('201');
    cy.wait('@groupDetail');

    cy.contains('Выбрано исполнителей: 0 из 2').should('be.visible');
    cy.contains('member_1').click();
    cy.contains('Выбрано исполнителей: 1 из 2').should('be.visible');

    cy.contains('button', 'Создать задачу').click();
    cy.wait('@createTask');

    cy.contains('Задача успешно создана!').should('be.visible');
    cy.contains('Перейти к задаче').should('be.visible');
  });

  it('TASK-02: пустая форма задачи не создаёт задачу', () => {
  cy.mockAuthenticated(createTaskUser);

  cy.intercept('GET', '**/projects/my', {
    statusCode: 200,
    body: [projectFixture],
  }).as('myProjects');

  cy.intercept('POST', '**/tasks/create_for_users', {
    statusCode: 201,
    body: {
      id: 999,
      title: 'Should not be created',
    },
  }).as('createTask');

  cy.visit('/tasks/create');
  cy.wait('@checkAuth');
  cy.wait('@myProjects');

  cy.contains('Создание задачи').should('be.visible');

  cy.contains('button', 'Создать задачу').click();

  cy.get('@createTask.all').should('have.length', 0);
  cy.url().should('include', '/tasks/create');
  cy.contains('Создание задачи').should('be.visible');
});

  it('TASK-03: после выбора группы отображается список доступных исполнителей', () => {
  const today = new Date();
  const deadline = new Date();
  deadline.setDate(today.getDate() + 5);

  cy.mockAuthenticated(createTaskUser);

  cy.intercept('GET', '**/projects/my', {
    statusCode: 200,
    body: [projectFixture],
  }).as('myProjects');

  cy.intercept('GET', '**/groups/201', {
    statusCode: 200,
    body: groupDetailFixture,
  }).as('groupDetail');

  cy.visit('/tasks/create');
  cy.wait('@checkAuth');
  cy.wait('@myProjects');

  cy.get('input[name="title"]').type('Smoke Task');
  cy.get('input[name="start_date"]').clear().type(formatDate(today));
  cy.get('input[name="deadline"]').clear().type(formatDate(deadline));
  cy.get('select[name="project_id"]').select('101');
  cy.get('select[name="group_id"]').select('201');

  cy.wait('@groupDetail');

  cy.contains('admin_user').should('be.visible');
  cy.contains('member_1').should('be.visible');
  cy.contains('Выбрано исполнителей').should('be.visible');
});

  it('TASK-04: пользователь может выбрать исполнителя перед созданием задачи', () => {
  const today = new Date();
  const deadline = new Date();
  deadline.setDate(today.getDate() + 5);

  cy.mockAuthenticated(createTaskUser);

  cy.intercept('GET', '**/projects/my', {
    statusCode: 200,
    body: [projectFixture],
  }).as('myProjects');

  cy.intercept('GET', '**/groups/201', {
    statusCode: 200,
    body: groupDetailFixture,
  }).as('groupDetail');

  cy.visit('/tasks/create');
  cy.wait('@checkAuth');
  cy.wait('@myProjects');

  cy.get('input[name="title"]').type('Smoke Task');
  cy.get('input[name="start_date"]').clear().type(formatDate(today));
  cy.get('input[name="deadline"]').clear().type(formatDate(deadline));
  cy.get('select[name="project_id"]').select('101');
  cy.get('select[name="group_id"]').select('201');

  cy.wait('@groupDetail');

  cy.contains('Выбрано исполнителей: 0').should('be.visible');
  cy.contains('member_1').click();
  cy.contains('Выбрано исполнителей: 1').should('be.visible');
});
});