const { By, until } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { getDriver } = require('../helpers/driverHelper');

class LoginPage extends BasePage {
  constructor() {
    super('/views/auth/login.html');
  }

  async loginAsAdmin(email, password) {
    await this.open();
    const driver = getDriver();
    await driver.wait(until.elementLocated(By.css('.rtab-admin')), 10000);
    await driver.findElement(By.css('.rtab-admin')).click();
    await this.type('#email', email);
    await this.type('#password', password);
    await this.click('#btnSubmit');
    await driver.wait(
      async () => (await driver.getCurrentUrl()).includes('/views/admin/'),
      15000
    );
  }
}

module.exports = LoginPage;
