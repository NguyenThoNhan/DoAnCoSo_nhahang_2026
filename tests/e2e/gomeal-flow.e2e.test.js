/**
 * E2E — Luồng khách đặt món + Admin xử lý đơn
 * Yêu cầu: npm start đang chạy + MySQL có dữ liệu seed
 *
 * Page Object Model: tests/e2e/pages/
 */

const LoginPage = require('./pages/LoginPage');
const MenuPage = require('./pages/MenuPage');
const AdminOrdersPage = require('./pages/AdminOrdersPage');
const {
  createDriver,
  takeScreenshot,
  quitDriver,
} = require('./helpers/driverHelper');
const api = require('./helpers/apiHelper');
const { ADMIN_EMAIL, ADMIN_PASSWORD } = require('./config');

describe('GoMeal E2E — Selenium WebDriver', () => {
  let orderId;
  let guestToken;
  let adminToken;
  let stockBefore;
  let expectedDeduct = 0;

  beforeAll(async () => {
    await api.assertServerRunning();
    adminToken = await api.loginAdmin();
    await createDriver();
  });

  afterAll(async () => {
    await quitDriver();
  });

  afterEach(async function () {
    if (this.currentTest && this.currentTest.state === 'failed') {
      await takeScreenshot(this.currentTest.title);
    }
  });

  describe('Luồng 1 — Khách đặt món', () => {
    test('Landing → menu (simulate QR) → giỏ hàng → KM → đặt món', async () => {
      const session = await api.setupGuestSession();
      guestToken = session.guestToken;
      const menu = await api.getMenu();
      const food = menu[0];

      const menuPage = new MenuPage();
      await menuPage.openWithGuestSession(session);

      if (food.category_id) {
        await menuPage.selectCategoryById(food.category_id);
      }

      await menuPage.addFirstFoodToCart();

      await menuPage.applyCoupon(require('./config').INVALID_PROMO);
      const invalidMsg = await menuPage.getCouponStatusText();
      expect(invalidMsg.toLowerCase()).toMatch(/không hợp lệ|hết hạn|invalid/i);

      const promo = await api.getActivePromotion(adminToken);
      if (promo && promo.code) {
        await menuPage.applyCoupon(promo.code);
        const okMsg = await menuPage.getCouponStatusText();
        expect(okMsg.toLowerCase()).toMatch(/thành công|giảm/i);
      }

      const recipe = await api.getFoodRecipe(food.id);
      if (recipe.length > 0) {
        const ingsBefore = await api.getIngredients(adminToken);
        stockBefore = Object.fromEntries(
          ingsBefore.map((i) => [i.id, Number(i.stock_quantity)])
        );
        expectedDeduct = recipe.reduce((sum, r) => {
          return sum + Number(r.quantity_required || 0);
        }, 0);
      }

      await menuPage.submitOrder();
      orderId = await menuPage.waitForOrderSuccess();
      expect(orderId).toBeTruthy();

      const { status, body } = await api.getOrderById(guestToken, orderId);
      expect(status).toBe(200);
      expect(body.status).toBe('pending');
    });
  });

  describe('Luồng 2 — Admin xử lý đơn', () => {
    test('Đăng nhập → cập nhật trạng thái → hoàn tất → kiểm tra kho', async () => {
      if (!orderId) {
        throw new Error(
          'Luồng 2 bỏ qua: Luồng 1 chưa tạo đơn (orderId undefined). Kiểm tra Luồng 1 trước.'
        );
      }

      const loginPage = new LoginPage();
      await loginPage.loginAsAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);

      const ordersPage = new AdminOrdersPage();
      await ordersPage.openAndWaitLoaded();
      await ordersPage.refreshOrders();

      await ordersPage.assertOrderInPendingColumn(orderId);

      await ordersPage.advancePendingToProcessing(orderId);
      await ordersPage.refreshOrders();

      await ordersPage.advanceProcessingToReady(orderId);
      await ordersPage.refreshOrders();

      await ordersPage.completeOrderPayRelease(orderId);
      await ordersPage.refreshOrders();

      const { body: orderAfter } = await api.getOrderById(guestToken, orderId);
      expect(orderAfter.status).toBe('completed');

      if (stockBefore && expectedDeduct > 0) {
        const ingsAfter = await api.getIngredients(adminToken);
        const recipe = await api.getFoodRecipe(
          (await api.getMenu())[0].id
        );
        for (const r of recipe) {
          const before = stockBefore[r.ingredient_id];
          if (before == null) continue;
          const after = Number(
            ingsAfter.find((i) => i.id === r.ingredient_id)?.stock_quantity
          );
          expect(after).toBeLessThanOrEqual(before);
        }
      }
    });
  });
});
