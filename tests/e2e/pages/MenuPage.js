const { By, until } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { getDriver } = require('../helpers/driverHelper');
const { BASE_URL } = require('../config');

class MenuPage extends BasePage {
  constructor() {
    super('/views/user/menu.html');
  }

  /**
   * Luồng tự nhiên: Landing (index.html) → set session guest → vào menu.
   * Simulate sau khi quét QR thành công.
   */
  async openWithGuestSession({ guestToken, tableName, tableId }) {
    const driver = getDriver();

    // Bước 1: mở trang chủ GoMeal (index.html tại BASE_URL)
    await driver.get(BASE_URL);
    await driver.wait(until.elementLocated(By.css('body#top')), 15000);
    await driver.wait(async () => {
      const title = await driver.getTitle();
      return title.toLowerCase().includes('gomeal');
    }, 10000);

    // Bước 2: ghi session guest vào localStorage (cùng origin)
    await driver.executeScript(
      `localStorage.setItem('guestToken', arguments[0]);
       localStorage.setItem('tableName', arguments[1]);
       localStorage.setItem('tableId', arguments[2]);
       localStorage.removeItem('localCart');`,
      guestToken,
      tableName,
      String(tableId)
    );

    // Bước 3: chuyển sang trang đặt món
    await this.open();
    await this.waitForMenuLoaded();
  }

  async waitForMenuLoaded() {
    const driver = getDriver();
    await driver.wait(until.elementLocated(By.css('#mpFoodGrid .mp-food-card')), 20000);
    await driver.wait(async () => {
      const count = await driver.findElements(By.css('#mpFoodGrid .mp-food-card'));
      return count.length > 0;
    }, 20000);
  }

  async selectCategoryById(categoryId) {
    const driver = getDriver();
    const btn = await driver.findElement(
      By.css(`.mp-cat-btn[data-cat="${categoryId}"]`)
    );
    await btn.click();
    await driver.sleep(500);
  }

  async addFirstFoodToCart() {
    const driver = getDriver();
    const addBtn = await driver.findElement(
      By.css('#mpFoodGrid .mp-food-card .mp-food-add')
    );
    await addBtn.click();
    await driver.wait(async () => {
      const badge = await driver.findElement(By.id('mpCartCount'));
      const n = parseInt(await badge.getText(), 10);
      return n >= 1;
    }, 5000);
  }

  async applyCoupon(code) {
    await this.type('#mpCouponInp', code);
    await this.click('#mpCouponBtn');
    await getDriver().sleep(800);
  }

  async getCouponStatusText() {
    const el = await getDriver().findElement(By.id('mpCouponStatusMsg'));
    return el.getText();
  }

  async submitOrder() {
    const driver = getDriver();
    await driver.wait(async () => {
      const btn = await driver.findElement(By.id('mpCheckoutBtn'));
      return !(await btn.getAttribute('disabled'));
    }, 5000);
    await this.click('#mpCheckoutBtn');
    await getDriver().wait(
      until.elementLocated(By.css('#mpConfirmOverlay.show')),
      5000
    );
    await this.click('#mpConfirmSubmit');
  }

  async waitForOrderSuccess() {
    const driver = getDriver();
    await driver.wait(async () => {
      const id = await driver.executeScript(
        "return localStorage.getItem('lastOrderId');"
      );
      return !!id;
    }, 15000);
    return driver.executeScript("return localStorage.getItem('lastOrderId');");
  }
}

module.exports = MenuPage;
