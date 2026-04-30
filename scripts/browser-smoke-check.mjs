import { spawn } from 'node:child_process';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const APP_PORT = Number(process.env.SMOKE_PORT || 4174);
const DEBUG_PORT = Number(process.env.SMOKE_DEBUG_PORT || 9229);
const HOST = '127.0.0.1';
const APP_URL = process.env.SMOKE_URL || `http://${HOST}:${APP_PORT}`;
const CHROME = process.env.CHROME_BIN || '/bin/chromium-browser';

const processes = [];

const cleanup = () => {
  for (const child of processes.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

function spawnTracked(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  processes.push(child);
  return child;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`${url} returned ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error(`Timeout requesting ${url}`)));
  });
}

function requestOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitUntil(label, fn, timeoutMs = 30000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ''}`);
}

function addSocketMessageListener(ws, handler) {
  if (typeof ws.on === 'function') {
    ws.on('message', handler);
    return () => ws.off('message', handler);
  }

  const listener = (event) => handler(event.data);
  ws.addEventListener('message', listener);
  return () => ws.removeEventListener('message', listener);
}

async function websocketRequest(ws, method, params = {}) {
  const id = ++websocketRequest.id;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      removeListener();
      reject(new Error(`Chrome command timed out: ${method}`));
    }, 10000);

    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (message.id !== id) return;
      clearTimeout(timeout);
      removeListener();
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result || {});
    };

    const removeListener = addSocketMessageListener(ws, onMessage);
  });
}
websocketRequest.id = 0;

async function connectToChrome() {
  const tabs = await requestJson(`http://${HOST}:${DEBUG_PORT}/json`);
  const page = tabs.find(tab => tab.type === 'page') || tabs[0];
  if (!page?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page found');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return ws;
}

async function assertPageLoaded(ws, path, expectedText) {
  const errors = [];
  const onConsole = (data) => {
    const message = JSON.parse(data.toString());
    if (message.method !== 'Runtime.consoleAPICalled') return;
    const type = message.params?.type;
    const text = (message.params?.args || []).map(arg => arg.value || arg.description || '').join(' ');
    if (type === 'error') errors.push(text);
  };
  const removeConsoleListener = addSocketMessageListener(ws, onConsole);

  await websocketRequest(ws, 'Page.navigate', { url: `${APP_URL}${path}` });
  await waitUntil(`page ${path}`, async () => {
    const { result } = await websocketRequest(ws, 'Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    return result?.value === 'complete';
  });
  await delay(1200);

  const { result } = await websocketRequest(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const root = document.getElementById('root');
      const bodyText = document.body.innerText || '';
      const rootBox = root?.getBoundingClientRect();
      const hasVisibleRoot = !!root && root.childElementCount > 0 && rootBox.height > 40 && rootBox.width > 40;
      const hasExpectedText = bodyText.includes(${JSON.stringify(expectedText)});
      const hasRecoveryError = bodyText.includes('Something went wrong');
      return { hasVisibleRoot, hasExpectedText, hasRecoveryError, bodyText: bodyText.slice(0, 600) };
    })()`,
    returnByValue: true,
  });

  removeConsoleListener();
  const state = result?.value;
  if (!state?.hasVisibleRoot || !state?.hasExpectedText || state?.hasRecoveryError) {
    throw new Error(`Smoke check failed for ${path}: ${JSON.stringify(state)}${errors.length ? ` Console errors: ${errors.join(' | ')}` : ''}`);
  }
}

async function main() {
  const server = spawnTracked('bun', ['x', 'vite', '--host', HOST, '--port', String(APP_PORT), '--strictPort'], {
    env: { ...process.env, BROWSER: 'none' },
  });

  server.stderr.on('data', chunk => process.stderr.write(chunk));
  server.stdout.on('data', chunk => process.stdout.write(chunk));

  await waitUntil('Vite server', () => requestOk(APP_URL), 45000);

  const chrome = spawnTracked(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`,
    'about:blank',
  ]);
  chrome.stderr.on('data', () => {});

  await waitUntil('Chrome debugger', () => requestJson(`http://${HOST}:${DEBUG_PORT}/json/version`), 20000);
  const ws = await connectToChrome();

  await websocketRequest(ws, 'Runtime.enable');
  await websocketRequest(ws, 'Page.enable');
  await websocketRequest(ws, 'Page.navigate', { url: APP_URL });
  await waitUntil('initial origin', async () => {
    const { result } = await websocketRequest(ws, 'Runtime.evaluate', { expression: 'location.origin', returnByValue: true });
    return result?.value === APP_URL;
  });
  await websocketRequest(ws, 'Runtime.evaluate', {
    expression: `localStorage.setItem('calculator-auth','true'); localStorage.setItem('calculator-user','Aryan'); localStorage.setItem('calculator-username','aryan'); localStorage.setItem('cgap-auth','true');`,
  });

  await assertPageLoaded(ws, '/', 'CGAP');
  await assertPageLoaded(ws, '/cgap', 'Contract');

  ws.close();
  console.log('Browser smoke check passed: app rendered without a blank screen.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(() => {
  cleanup();
});
