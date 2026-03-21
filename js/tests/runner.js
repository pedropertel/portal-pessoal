// ── Mini Test Framework — roda no browser sem dependências ──

const suites = [];
let currentSuite = null;

export function describe(name, fn) {
  currentSuite = { name, tests: [], passed: 0, failed: 0 };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

export function it(name, fn) {
  if (!currentSuite) throw new Error('it() must be inside describe()');
  currentSuite.tests.push({ name, fn });
}

export function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function runAll() {
  const container = document.getElementById('results') || document.body;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    const suiteEl = document.createElement('div');
    suiteEl.className = 'suite';
    const title = document.createElement('h2');
    title.textContent = suite.name;
    suiteEl.appendChild(title);

    for (const test of suite.tests) {
      const testEl = document.createElement('div');
      testEl.className = 'test';
      try {
        await test.fn();
        testEl.className = 'test pass';
        testEl.textContent = `✓ ${test.name}`;
        suite.passed++;
        totalPassed++;
      } catch (e) {
        testEl.className = 'test fail';
        testEl.textContent = `✗ ${test.name} — ${e.message}`;
        suite.failed++;
        totalFailed++;
      }
      suiteEl.appendChild(testEl);
    }

    title.textContent += ` (${suite.passed}/${suite.tests.length})`;
    container.appendChild(suiteEl);
  }

  // Summary
  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = `Total: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} total`;
  summary.style.color = totalFailed > 0 ? '#e74c3c' : '#2ecc71';
  container.prepend(summary);
}
