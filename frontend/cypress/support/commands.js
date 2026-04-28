const defaultUser = {
  id: 1,
  login: 'admin_user',
  email: 'admin@example.com',
  name: 'Admin User',
};

Cypress.Commands.add('mockCommonPrivateRequests', () => {
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
});

Cypress.Commands.add('mockUnauthenticated', () => {
  cy.intercept(
    { method: 'GET', pathname: '/auth/check' },
    {
      statusCode: 200,
      body: { authenticated: false },
    }
  ).as('checkAuth');
});

Cypress.Commands.add('mockAuthenticated', (user = defaultUser) => {
  cy.intercept(
    { method: 'GET', pathname: '/auth/check' },
    {
      statusCode: 200,
      body: {
        authenticated: true,
        user,
      },
    }
  ).as('checkAuth');

  cy.mockCommonPrivateRequests();
});

Cypress.Commands.add('visitAsGuest', (path = '/') => {
  cy.mockUnauthenticated();
  cy.visit(path);
  cy.wait('@checkAuth');
});

Cypress.Commands.add('visitAsAuthenticated', (path = '/workspace', user = defaultUser) => {
  cy.mockAuthenticated(user);
  cy.visit(path);
  cy.wait('@checkAuth');
});

Cypress.Commands.add('fillLoginForm', ({ login, password }) => {
  cy.get('input[name="login"]').should('be.visible').clear().type(login);
  cy.get('input[name="password"]').should('be.visible').clear().type(password);
});

Cypress.Commands.add('fillRegisterForm', ({ login, email, name, password, confirmPassword }) => {
  cy.get('input[name="email"]').should('be.visible').clear().type(email);
  cy.get('input[name="login"]').should('be.visible').clear().type(login);
  cy.get('input[name="name"]').should('be.visible').clear().type(name);
  cy.get('input[name="password"]').should('be.visible').clear().type(password);
  cy.get('input[name="confirmPassword"]').should('be.visible').clear().type(confirmPassword);
});

Cypress.Commands.add('mockRegisterSuccess', () => {
  cy.intercept('POST', '**/users/', (req) => {
    req.reply({
      statusCode: 201,
      body: {
        id: 101,
        login: req.body.login,
        email: req.body.email,
        name: req.body.name,
      },
    });
  }).as('registerRequest');
});