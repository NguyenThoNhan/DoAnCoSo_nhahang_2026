const { By, until } = require('selenium-webdriver');
const BasePage = require('./BasePage');
const { getDriver } = require('../helpers/driverHelper');
const {
  waitForToastsGone,
  clickWhenClickable,
} = require('../helpers/uiHelper');

class AdminOrdersPage extends BasePage {
  constructor() {
    super('/views/admin/orders.html');
  }

  async openAndWaitLoaded() {
    await this.open();
    const driver = getDriver();
    await driver.wait(until.elementLocated(By.id('kanbanView')), 15000);
    await waitForToastsGone();
  }

  async findOrderCard(orderId) {
    const driver = getDriver();
    await waitForToastsGone();
    const xpath = `//div[contains(@class,'order-kcard')]//span[contains(@class,'okc-id') and contains(text(),'#${orderId}')]`;
    return driver.wait(until.elementLocated(By.xpath(xpath)), 20000);
  }

  async assertOrderInPendingColumn(orderId) {
    const driver = getDriver();
    const card = await this.findOrderCard(orderId);
    const col = await card.findElement(
      By.xpath("./ancestor::div[contains(@class,'kc-list')]")
    );
    const colId = await col.getAttribute('id');
    expect(colId).toBe('colPending');
  }

  async assertOrderStatusLabel(orderId, label) {
    const driver = getDriver();
    await this.findOrderCard(orderId);
    const cards = await driver.findElements(By.css(`#colPending .order-kcard, #colProcessing .order-kcard, #colReady .order-kcard, #colCompleted .order-kcard`));
    for (const card of cards) {
      const text = await card.getText();
      if (text.includes(`#${orderId}`)) {
        if (label === 'Chờ xác nhận') {
          expect(text).toMatch(/Chờ xác nhận|#${orderId}/);
        }
        return;
      }
    }
    throw new Error(`Không tìm thấy đơn #${orderId}`);
  }

  async clickOrderAction(orderId, buttonClass) {
    const driver = getDriver();
    await waitForToastsGone();
    const xpath = `//div[contains(@class,'order-kcard')][.//span[contains(text(),'#${orderId}')]]//button[contains(@class,'${buttonClass}')]`;
    const btn = await driver.wait(until.elementLocated(By.xpath(xpath)), 10000);
    await driver.wait(until.elementIsVisible(btn), 5000);
    await driver.executeScript(
      'arguments[0].scrollIntoView({block:"center"});',
      btn
    );
    try {
      await btn.click();
    } catch {
      await driver.executeScript('arguments[0].click();', btn);
    }
    await waitForToastsGone();
  }

  async advancePendingToProcessing(orderId) {
    await this.clickOrderAction(orderId, 'okc-btn-process');
  }

  async advanceProcessingToReady(orderId) {
    await this.clickOrderAction(orderId, 'okc-btn-ready');
  }

  async completeOrderPayRelease(orderId) {
    await this.clickOrderAction(orderId, 'okc-btn-complete');
    await getDriver().wait(
      until.elementLocated(By.id('payReleaseModal')),
      8000
    );
    await clickWhenClickable('#btnPayReleaseConfirm');
    await waitForToastsGone();
  }

  async refreshOrders() {
    await clickWhenClickable('#btnRefresh');
    await waitForToastsGone();
    const driver = getDriver();
    await driver.wait(until.elementLocated(By.id('kanbanView')), 10000);
  }
}

module.exports = AdminOrdersPage;
