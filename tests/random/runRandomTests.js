/**
 * Random Testing — GoMeal (PHẦN 3.4)
 * Chạy: npm run test:random
 * Kết quả: tests/random/results.json
 *
 * Sinh ngẫu nhiên ≥500 bộ dữ liệu, gọi hàm thực tế (pureLogic mirror controller),
 * so sánh với kết quả mong đợi tính theo công thức.
 */

const fs = require('fs');
const path = require('path');
const {
  calculateOrderTotal,
  applyPromotion,
  validateLoginInput,
  validateFoodInput,
} = require('../helpers/pureLogic');

const MIN_ITERATIONS = parseInt(process.env.RANDOM_ITERATIONS || '500', 10);
const RESULTS_FILE = path.join(__dirname, 'results.json');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function randomItems() {
  const count = randomInt(1, 10);
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      priceAtOrder: randomInt(10000, 500000),
      quantity: randomInt(1, 5),
    });
  }
  return items;
}

/** Món combo: giá combo cố định + món lẻ kèm theo */
function randomComboItems() {
  const comboPrice = randomInt(50000, 300000);
  const items = [{ priceAtOrder: comboPrice, quantity: 1, itemName: 'Combo' }];
  const extra = randomInt(0, 3);
  for (let i = 0; i < extra; i++) {
    items.push({
      priceAtOrder: randomInt(10000, 80000),
      quantity: randomInt(1, 3),
    });
  }
  return items;
}

function randomPromo(subtotal) {
  if (Math.random() < 0.5) return null;
  const isPercent = Math.random() < 0.5;
  return {
    id: randomInt(1, 999),
    type: isPercent ? 'percent' : 'fixed',
    value: isPercent
      ? randomInt(0, 100)
      : randomInt(10000, Math.min(200000, Math.max(subtotal, 10000))),
    min_order_amount: randomInt(0, Math.floor(subtotal * 0.8)),
  };
}

function randomEmail() {
  const domains = ['gmail.com', 'gomeal.vn', 'test.com'];
  if (Math.random() < 0.2) return '';
  if (Math.random() < 0.1) return 'invalid-email';
  return `user${randomInt(1, 9999)}@${randomChoice(domains)}`;
}

function randomPassword() {
  if (Math.random() < 0.2) return '';
  return 'P@ss' + randomInt(1000, 9999);
}

function createSuite(name, description) {
  return {
    name,
    description,
    iterations: 0,
    passed: 0,
    failed: 0,
    passRate: '0%',
  };
}

function recordFailure(allFailures, suiteName, iteration, payload) {
  if (allFailures.length >= 30) return;
  allFailures.push({ suite: suiteName, iteration, ...payload });
}

/** Suite 1: Tính tổng tiền đơn (nhiều món, có/không KM) */
function runOrderTotalSuite(suite, iterations, failures) {
  for (let i = 0; i < iterations; i++) {
    suite.iterations++;
    const items = randomItems();
    const subtotal = items.reduce(
      (s, it) => s + it.priceAtOrder * it.quantity,
      0
    );
    const promoRow = randomPromo(subtotal);

    let promoForCalc = null;
    let expectedDiscount = 0;
    if (promoRow) {
      promoForCalc = { type: promoRow.type, value: promoRow.value };
      const applied = applyPromotion(promoRow, subtotal);
      expectedDiscount = applied.ok ? applied.discount_amount : 0;
    }

    const actual = calculateOrderTotal(items, promoForCalc);
    const expectedTotal = subtotal - expectedDiscount;
    const ok =
      actual.subtotal === subtotal && actual.total === expectedTotal;

    if (ok) suite.passed++;
    else {
      suite.failed++;
      recordFailure(failures, suite.name, i + 1, {
        items,
        promo: promoRow,
        expected: { subtotal, discount: expectedDiscount, total: expectedTotal },
        actual,
      });
    }
  }
}

/** Suite 2: Đơn có combo + KM */
function runComboSuite(suite, iterations, failures) {
  for (let i = 0; i < iterations; i++) {
    suite.iterations++;
    const items = randomComboItems();
    const subtotal = items.reduce(
      (s, it) => s + it.priceAtOrder * it.quantity,
      0
    );
    const promo = randomPromo(subtotal);
    let promoForCalc = null;
    let expectedDiscount = 0;
    if (promo) {
      promoForCalc = { type: promo.type, value: promo.value };
      const applied = applyPromotion(promo, subtotal);
      expectedDiscount = applied.ok ? applied.discount_amount : 0;
    }

    const actual = calculateOrderTotal(items, promoForCalc);
    const expectedTotal = subtotal - expectedDiscount;
    const ok = actual.total === expectedTotal;

    if (ok) suite.passed++;
    else {
      suite.failed++;
      recordFailure(failures, suite.name, i + 1, {
        items,
        expectedTotal,
        actual: actual.total,
      });
    }
  }
}

/** Suite 3: Áp mã khuyến mãi (applyPromotion) */
function runPromotionSuite(suite, iterations, failures) {
  for (let i = 0; i < iterations; i++) {
    suite.iterations++;
    const subtotal = randomInt(50000, 2000000);
    const promo = randomPromo(subtotal) || {
      id: 1,
      type: 'percent',
      value: randomInt(5, 30),
      min_order_amount: 0,
    };

    const actual = applyPromotion(promo, subtotal);
    let expectedOk = true;
    let expectedDiscount = 0;
    let expectedStatus = 200;

    if (!promo) {
      expectedOk = false;
      expectedStatus = 404;
    } else if (subtotal < promo.min_order_amount) {
      expectedOk = false;
      expectedStatus = 400;
    } else {
      expectedDiscount =
        promo.type === 'percent'
          ? (subtotal * promo.value) / 100
          : promo.value;
    }

    const ok =
      actual.ok === expectedOk &&
      (expectedOk
        ? actual.discount_amount === expectedDiscount && actual.status === 200
        : actual.status === expectedStatus);

    if (ok) suite.passed++;
    else {
      suite.failed++;
      recordFailure(failures, suite.name, i + 1, {
        subtotal,
        promo,
        expected: { ok: expectedOk, status: expectedStatus, discount: expectedDiscount },
        actual,
      });
    }
  }
}

/** Suite 4: Validate đăng nhập */
function runLoginValidateSuite(suite, iterations, failures) {
  for (let i = 0; i < iterations; i++) {
    suite.iterations++;
    const email = randomEmail();
    const password = randomPassword();
    const actual = validateLoginInput(email, password);
    const expectedValid = !!(email && password);

    const ok =
      actual.valid === expectedValid &&
      (!expectedValid ? actual.status === 400 : true);

    if (ok) suite.passed++;
    else {
      suite.failed++;
      recordFailure(failures, suite.name, i + 1, {
        email,
        password: password ? '***' : '',
        expectedValid,
        actual,
      });
    }
  }
}

/** Suite 5: Validate tạo món */
function runFoodValidateSuite(suite, iterations, failures) {
  for (let i = 0; i < iterations; i++) {
    suite.iterations++;
    const name = Math.random() < 0.15 ? '' : `Mon ${randomInt(1, 999)}`;
    const category_id =
      Math.random() < 0.15 ? null : randomInt(1, 20);
    const price =
      Math.random() < 0.15 ? 0 : randomInt(1000, 500000);

    const actual = validateFoodInput({ name, category_id, price });
    const expectedValid = !!(name && category_id && price);

    const ok =
      actual.valid === expectedValid &&
      (!expectedValid ? actual.status === 400 : true);

    if (ok) suite.passed++;
    else {
      suite.failed++;
      recordFailure(failures, suite.name, i + 1, {
        input: { name, category_id, price },
        expectedValid,
        actual,
      });
    }
  }
}

function runRandomTests() {
  const totalTarget = Math.max(MIN_ITERATIONS, 500);
  const orderIter = Math.floor(totalTarget * 0.5);
  const comboIter = Math.floor(totalTarget * 0.15);
  const promoIter = Math.floor(totalTarget * 0.15);
  const loginIter = Math.floor(totalTarget * 0.1);
  const foodIter =
    totalTarget - orderIter - comboIter - promoIter - loginIter;

  const failures = [];
  const suites = [
    createSuite(
      'orderTotal',
      'Tính tổng tiền đơn (1–10 món, giá 10k–500k, qty 1–5, KM ngẫu nhiên)'
    ),
    createSuite('comboOrder', 'Tính tổng đơn có combo + món lẻ + KM'),
    createSuite('applyPromotion', 'Xử lý mã khuyến mãi (% / fixed, min_order)'),
    createSuite('validateLogin', 'Validate input đăng nhập (email/password)'),
    createSuite('validateFood', 'Validate input tạo món (name/category/price)'),
  ];

  runOrderTotalSuite(suites[0], orderIter, failures);
  runComboSuite(suites[1], comboIter, failures);
  runPromotionSuite(suites[2], promoIter, failures);
  runLoginValidateSuite(suites[3], loginIter, failures);
  runFoodValidateSuite(suites[4], foodIter, failures);

  suites.forEach((s) => {
    s.passRate =
      s.iterations > 0
        ? `${((s.passed / s.iterations) * 100).toFixed(2)}%`
        : '0%';
  });

  const total = suites.reduce((n, s) => n + s.iterations, 0);
  const passed = suites.reduce((n, s) => n + s.passed, 0);
  const failed = suites.reduce((n, s) => n + s.failed, 0);

  const results = {
    module: 'Random Testing — GoMeal (multi-suite)',
    summary: {
      total,
      passed,
      failed,
      passRate: `${((passed / total) * 100).toFixed(2)}%`,
    },
    suites,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    failures,
    config: {
      minIterations: MIN_ITERATIONS,
      distribution: {
        orderTotal: orderIter,
        comboOrder: comboIter,
        applyPromotion: promoIter,
        validateLogin: loginIter,
        validateFood: foodIter,
      },
    },
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');

  console.log('═══════════════════════════════════════════════');
  console.log('  RANDOM TESTING — GoMeal (multi-suite)');
  console.log('═══════════════════════════════════════════════');
  suites.forEach((s) => {
    console.log(
      `  ${s.name.padEnd(18)} ${s.passed}/${s.iterations} pass (${s.passRate})`
    );
  });
  console.log('───────────────────────────────────────────────');
  console.log(`  TỔNG             ${passed}/${total} pass (${results.summary.passRate})`);
  console.log(`  File kết quả     ${RESULTS_FILE}`);
  console.log('═══════════════════════════════════════════════');

  if (failed > 0) process.exitCode = 1;
}

runRandomTests();
