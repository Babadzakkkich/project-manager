describe('Полный цикл аутентификации (исправленный)', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
  });

  it('Полный цикл с правильным использованием .then()', () => {
    cy.goToHome();
    cy.contains('Проектный менеджер Syncro').should('be.visible');
    
    cy.contains('Начать').click();
    cy.assertRegisterPage();
    
    cy.mockRegisterSuccess();
    
    const timestamp = Date.now();
    const registrationData = {
      login: `newuser${timestamp}`,
      email: `newuser${timestamp}@example.com`,
      name: `New User ${timestamp}`,
      password: 'Password123!',
      confirmPassword: 'Password123!'
    };
    
    cy.fillRegisterForm(registrationData);
    cy.submitForm();
    cy.wait('@registerRequest');
    
    cy.assertLoginPage();
    
    cy.mockLoginSuccess();
    
    cy.contains('Логин').parent().find('input').clear().type(registrationData.email);
    cy.contains('Пароль').parent().find('input').clear().type(registrationData.password);
    cy.submitForm();
    
    cy.wait('@loginRequest');
    
    cy.url().should('include', '/dashboard');
    cy.contains('Добро пожаловать').should('be.visible');
    
    cy.logout();
    
    cy.assertLoginPage();
  });

  it('Регистрация с использованием .then() для данных', () => {
    cy.mockRegisterSuccess();
    cy.goToRegister();
    
    cy.fillRegisterForm().then((formData) => {
      cy.log('Данные формы:', formData);
      cy.submitForm();
      
      return cy.wait('@registerRequest');
    }).then((interception) => {
      expect(interception.request.body).to.have.property('email');
      expect(interception.request.body).to.have.property('password');
    });
  });
});