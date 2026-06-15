const fs = require('fs');
const path = require('path');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { SCREENSHOT_DIR } = require('../config');

let _driver = null;

async function createDriver() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const options = new chrome.Options();
  options.addArguments('--window-size=1400,900');
  options.addArguments('--disable-gpu');
  // options.addArguments('--headless=new'); // bỏ comment nếu muốn chạy ẩn

  _driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  await _driver.manage().setTimeouts({ implicit: 5000, pageLoad: 30000 });
  return _driver;
}

function getDriver() {
  if (!_driver) throw new Error('Driver chưa khởi tạo. Gọi createDriver() trước.');
  return _driver;
}

async function takeScreenshot(label) {
  if (!_driver) return;
  const safe = String(label).replace(/[^\w\-]+/g, '_').slice(0, 80);
  const file = path.join(
    SCREENSHOT_DIR,
    `${Date.now()}_${safe}.png`
  );
  const img = await _driver.takeScreenshot();
  fs.writeFileSync(file, img, 'base64');
  console.log(`📸 Screenshot: ${file}`);
  return file;
}

async function quitDriver() {
  if (_driver) {
    await _driver.quit();
    _driver = null;
  }
}

module.exports = {
  createDriver,
  getDriver,
  takeScreenshot,
  quitDriver,
};
