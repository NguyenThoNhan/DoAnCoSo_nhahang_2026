const { By, until } = require('selenium-webdriver');
const { getDriver } = require('../helpers/driverHelper');
const { BASE_URL, TIMEOUT } = require('../config');

class BasePage {
  constructor(path = '') {
    this.path = path;
  }

  async open() {
    const driver = getDriver();
    await driver.get(`${BASE_URL}${this.path}`);
  }

  async waitForSelector(css, timeout = TIMEOUT) {
    const driver = getDriver();
    return driver.wait(until.elementLocated(By.css(css)), timeout);
  }

  async click(css) {
    const el = await this.waitForSelector(css);
    await el.click();
  }

  async type(css, text) {
    const el = await this.waitForSelector(css);
    await el.clear();
    await el.sendKeys(text);
  }

  async getText(css) {
    const el = await this.waitForSelector(css);
    return el.getText();
  }

  async isDisplayed(css) {
    try {
      const el = await getDriver().findElement(By.css(css));
      return el.isDisplayed();
    } catch {
      return false;
    }
  }
}

module.exports = BasePage;
