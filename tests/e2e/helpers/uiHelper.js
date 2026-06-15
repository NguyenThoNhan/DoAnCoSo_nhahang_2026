const { By, until } = require('selenium-webdriver');
const { getDriver } = require('./driverHelper');

const TOAST_CONTAINER = '#toastContainer';
const TOAST_MAX_WAIT_MS = 6500;

/**
 * Đợi toast admin biến mất (toast tự remove sau 5s).
 * Nếu quá lâu → xóa toast bằng JS để không che nút bấm.
 */
async function waitForToastsGone(timeoutMs = TOAST_MAX_WAIT_MS) {
  const driver = getDriver();
  try {
    await driver.wait(async () => {
      const count = await driver.executeScript(
        `const c = document.querySelector('${TOAST_CONTAINER}');
         return c ? c.children.length : 0;`
      );
      return count === 0;
    }, timeoutMs);
  } catch {
    await driver.executeScript(
      `const c = document.querySelector('${TOAST_CONTAINER}');
       if (c) c.innerHTML = '';`
    );
  }
}

/**
 * Click an toàn: đợi toast hết → element visible + enabled → scroll → click (JS fallback).
 */
async function clickWhenClickable(css, timeoutMs = 15000) {
  const driver = getDriver();
  await waitForToastsGone();

  const el = await driver.wait(until.elementLocated(By.css(css)), timeoutMs);
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  await driver.wait(until.elementIsEnabled(el), timeoutMs);

  await driver.executeScript(
    'arguments[0].scrollIntoView({block:"center",inline:"center"});',
    el
  );

  try {
    await driver.wait(until.elementIsEnabled(el), 3000);
    await el.click();
  } catch {
    await driver.executeScript('arguments[0].click();', el);
  }
}

module.exports = {
  waitForToastsGone,
  clickWhenClickable,
};
