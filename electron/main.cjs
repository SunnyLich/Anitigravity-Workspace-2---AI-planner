const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const extract = require('extract-zip');

const DEFAULT_OTP_VERSION = '2.8.1';
const DEFAULT_OTP_SERIALIZATION_VERSION_ID = '203';
const OTP_VERSION = String(process.env.TRIPOPTIMIZER_MANAGED_OTP_VERSION || DEFAULT_OTP_VERSION).trim() || DEFAULT_OTP_VERSION;
const OTP_SERIALIZATION_VERSION_ID = String(process.env.TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID || DEFAULT_OTP_SERIALIZATION_VERSION_ID).trim() || DEFAULT_OTP_SERIALIZATION_VERSION_ID;
const OTP_JAR_OVERRIDE_PATH = String(process.env.TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH || '').trim();
const DEFAULT_OTP_JAR_URL = `https://repo1.maven.org/maven2/org/opentripplanner/otp-shaded/${OTP_VERSION}/otp-shaded-${OTP_VERSION}.jar`;
const OTP_JAR_URL = String(process.env.TRIPOPTIMIZER_MANAGED_OTP_JAR_URL || DEFAULT_OTP_JAR_URL).trim() || DEFAULT_OTP_JAR_URL;
const OTP_JAR_NAME = getManagedOtpJarName();
const JRE_DOWNLOAD_URL = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B7/OpenJDK21U-jre_x64_windows_hotspot_21.0.10_7.zip';
const DEFAULT_LOCAL_OTP_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_OTP_PORT = 8080;
const STARTUP_TIMEOUT_MS = 90000;
const PROBE_TIMEOUT_MS = 2500;
const OTP_GRAPH_HEADER_BYTES = 64;

const runtimeState = {
  child: null,
  isStarting: false,
  lastError: '',
  lastLogLine: '',
  managedBaseUrl: DEFAULT_LOCAL_OTP_BASE_URL,
};

const shutdownState = {
  inProgress: false,
  promise: null,
};

function getManagedOtpJarName() {
  if (OTP_JAR_OVERRIDE_PATH) {
    return path.basename(OTP_JAR_OVERRIDE_PATH);
  }

  try {
    return path.basename(new URL(OTP_JAR_URL).pathname) || `otp-shaded-${OTP_VERSION}.jar`;
  } catch {
    return `otp-shaded-${OTP_VERSION}.jar`;
  }
}

function getManagedOtpArtifactDescription() {
  if (OTP_JAR_OVERRIDE_PATH) {
    return `custom jar at ${OTP_JAR_OVERRIDE_PATH}`;
  }

  if (OTP_JAR_URL !== DEFAULT_OTP_JAR_URL) {
    return `custom jar URL ${OTP_JAR_URL}`;
  }

  return `OTP ${OTP_VERSION}`;
}

function isManagedChildRunning() {
  return Boolean(runtimeState.child && !runtimeState.child.killed && runtimeState.child.exitCode === null);
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function normalizeOtpBaseUrl(rawValue) {
  const fallback = new URL(DEFAULT_LOCAL_OTP_BASE_URL);

  try {
    const parsed = new URL(String(rawValue || '').trim() || DEFAULT_LOCAL_OTP_BASE_URL);
    if (!isLocalHost(parsed.hostname)) {
      return fallback.toString().replace(/\/$/, '');
    }

    if (!parsed.port) {
      parsed.port = String(DEFAULT_OTP_PORT);
    }

    parsed.pathname = '/';
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback.toString().replace(/\/$/, '');
  }
}

function getOtpApiBaseCandidates(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl).replace(/\/+$/, '');
  const withOtp = normalizedBaseUrl.endsWith('/otp') ? normalizedBaseUrl : `${normalizedBaseUrl}/otp`;
  return [...new Set([withOtp, normalizedBaseUrl])];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canBindPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      server.close(() => {
        if (error && error.code === 'EADDRINUSE') {
          resolve(false);
          return;
        }

        reject(error);
      });
    });

    server.listen(port, () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(true);
      });
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseLooksLikeOtp(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const bodyText = await response.text();

  if (contentType.includes('application/json')) {
    return bodyText.includes('UP')
      || bodyText.includes('planConnection')
      || bodyText.includes('errors')
      || bodyText.includes('data');
  }

  return /opentripplanner|otp|graphql/i.test(bodyText);
}

async function probeOtp(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);

  for (const apiBase of getOtpApiBaseCandidates(normalizedBaseUrl)) {
    const healthUrl = `${apiBase}/actuator/health`;

    try {
      const healthResponse = await fetchWithTimeout(healthUrl, {
        headers: { accept: 'application/json' },
      });

      if (healthResponse.ok && await responseLooksLikeOtp(healthResponse)) {
        return {
          running: true,
          source: 'health',
          detectedUrl: healthUrl,
          baseUrl: normalizedBaseUrl,
        };
      }
    } catch {
      // Ignore and continue probing.
    }

    for (const graphqlUrl of [`${apiBase}/routers/default/index/graphql`, `${apiBase}/gtfs/v1`]) {
      try {
        const graphqlResponse = await fetchWithTimeout(graphqlUrl, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ query: 'query { __typename }' }),
        });

        if ((graphqlResponse.ok || graphqlResponse.status === 400) && await responseLooksLikeOtp(graphqlResponse)) {
          return {
            running: true,
            source: 'graphql',
            detectedUrl: graphqlUrl,
            baseUrl: normalizedBaseUrl,
          };
        }
      } catch {
        // Ignore and continue probing.
      }
    }

    try {
      const rootResponse = await fetchWithTimeout(apiBase, { redirect: 'manual' });
      if (rootResponse.ok && await responseLooksLikeOtp(rootResponse)) {
        return {
          running: true,
          source: 'root',
          detectedUrl: apiBase,
          baseUrl: normalizedBaseUrl,
        };
      }
    } catch {
      // Ignore and continue probing.
    }
  }

  return {
    running: false,
    source: 'unreachable',
    detectedUrl: '',
    baseUrl: normalizedBaseUrl,
  };
}

function getRuntimeRoot() {
  return path.join(app.getPath('userData'), 'otp-runtime');
}

function getBundledTransitDataDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'otp-assets')
    : path.join(__dirname, '..', 'src', 'data', 'Transit');
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readGraphSerializationVersionId(graphPath) {
  const handle = await fsp.open(graphPath, 'r');
  const buffer = Buffer.alloc(OTP_GRAPH_HEADER_BYTES);

  try {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const headerText = buffer.subarray(0, bytesRead).toString('utf8');
    const match = headerText.match(/^OpenTripPlannerGraph;0*([^;]+);/);
    return match ? String(match[1] || '').trim() : '';
  } finally {
    await handle.close();
  }
}

async function assertManagedGraphCompatibility(transitDataDir) {
  const graphPath = path.join(transitDataDir, 'graph.obj');
  const graphSerializationVersionId = await readGraphSerializationVersionId(graphPath);

  if (!graphSerializationVersionId || graphSerializationVersionId === OTP_SERIALIZATION_VERSION_ID) {
    return;
  }

  throw new Error(
    `Bundled graph.obj requires OTP serialization ${graphSerializationVersionId}, but managed OTP is configured for ${getManagedOtpArtifactDescription()} with serialization ${OTP_SERIALIZATION_VERSION_ID}. Rebuild graph.obj with a matching OTP version, or set TRIPOPTIMIZER_MANAGED_OTP_JAR_PATH or TRIPOPTIMIZER_MANAGED_OTP_JAR_URL together with TRIPOPTIMIZER_MANAGED_OTP_SERIALIZATION_ID to a compatible OTP build.`,
  );
}

async function findJavaBinary(rootDir) {
  if (!await fileExists(rootDir)) return '';

  const queue = [{ dirPath: rootDir, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    const javaCandidate = path.join(current.dirPath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

    if (await fileExists(javaCandidate)) {
      return javaCandidate;
    }

    if (current.depth >= 2) {
      continue;
    }

    const entries = await fsp.readdir(current.dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dirPath: path.join(current.dirPath, entry.name), depth: current.depth + 1 });
      }
    }
  }

  return '';
}

function parseJavaMajorVersion(versionOutput) {
  const raw = String(versionOutput || '');
  const match = raw.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) return 0;
  const primary = Number(match[1]);
  if (!Number.isFinite(primary)) return 0;
  return primary;
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function resolveJavaRuntime() {
  const runtimeRoot = getRuntimeRoot();
  const bundledJreRoot = path.join(runtimeRoot, 'jre');
  const bundledJava = await findJavaBinary(bundledJreRoot);
  if (bundledJava) {
    return { command: bundledJava, source: 'bundled-jre' };
  }

  try {
    const { stdout, stderr } = await execFileAsync('java', ['-version']);
    const versionText = `${stdout}\n${stderr}`;
    if (parseJavaMajorVersion(versionText) >= 21) {
      return { command: 'java', source: 'system-java' };
    }
  } catch {
    // Fall through to downloading a portable JRE.
  }

  const downloadedJava = await installBundledJre();
  return { command: downloadedJava, source: 'downloaded-jre' };
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await ensureDirectory(path.dirname(destinationPath));

  const fileStream = fs.createWriteStream(destinationPath);
  await pipeline(Readable.fromWeb(response.body), fileStream);
}

async function installBundledJre() {
  const runtimeRoot = getRuntimeRoot();
  const downloadsDir = path.join(runtimeRoot, 'downloads');
  const archivePath = path.join(downloadsDir, path.basename(new URL(JRE_DOWNLOAD_URL).pathname));
  const extractDir = path.join(runtimeRoot, 'jre');

  await ensureDirectory(downloadsDir);
  await ensureDirectory(extractDir);

  if (!await fileExists(archivePath)) {
    await downloadFile(JRE_DOWNLOAD_URL, archivePath);
  }

  const sentinel = path.join(extractDir, '.complete');
  if (!await fileExists(sentinel)) {
    await fsp.rm(extractDir, { recursive: true, force: true });
    await ensureDirectory(extractDir);
    await extract(archivePath, { dir: extractDir });
    await fsp.writeFile(sentinel, 'ok', 'utf8');
  }

  const javaBinary = await findJavaBinary(extractDir);
  if (!javaBinary) {
    throw new Error('Portable Java was downloaded but java.exe could not be found.');
  }

  return javaBinary;
}

async function ensureOtpJar() {
  if (OTP_JAR_OVERRIDE_PATH) {
    const jarOverridePath = path.resolve(OTP_JAR_OVERRIDE_PATH);

    if (!await fileExists(jarOverridePath)) {
      throw new Error(`Managed OTP jar override path was not found: ${jarOverridePath}`);
    }

    return jarOverridePath;
  }

  const runtimeRoot = getRuntimeRoot();
  const binDir = path.join(runtimeRoot, 'bin');
  const jarPath = path.join(binDir, OTP_JAR_NAME);

  if (await fileExists(jarPath)) {
    return jarPath;
  }

  await ensureDirectory(binDir);
  await downloadFile(OTP_JAR_URL, jarPath);
  return jarPath;
}

function getManagedOtpPort(baseUrl) {
  try {
    const parsed = new URL(normalizeOtpBaseUrl(baseUrl));
    return Number(parsed.port) || DEFAULT_OTP_PORT;
  } catch {
    return DEFAULT_OTP_PORT;
  }
}

async function readChildLog(stream, prefix) {
  if (!stream) return;

  stream.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (!text) return;
    const lines = text.split(/\r?\n/).filter(Boolean);
    runtimeState.lastLogLine = `${prefix}${lines.at(-1)}`;
  });
}

async function waitForOtpStartup(baseUrl) {
  const startTime = Date.now();

  while ((Date.now() - startTime) < STARTUP_TIMEOUT_MS) {
    const probe = await probeOtp(baseUrl);
    if (probe.running) {
      return probe;
    }

    if (runtimeState.child && runtimeState.child.exitCode !== null) {
      throw new Error(runtimeState.lastError || 'OTP process exited before it became reachable.');
    }

    await delay(1500);
  }

  throw new Error('OTP did not become reachable before the startup timeout elapsed.');
}

async function assertPortAvailableForManagedOtp(baseUrl) {
  const port = getManagedOtpPort(baseUrl);
  const isAvailable = await canBindPort(port);

  if (!isAvailable) {
    throw new Error(`Cannot start managed OTP because port ${port} is already in use by another process. Stop the process using that port or change the OTP base URL to a different local port.`);
  }
}

async function killManagedProcess() {
  if (!isManagedChildRunning()) {
    runtimeState.child = null;
    return;
  }

  const pid = runtimeState.child.pid;

  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f']);
    } catch {
      runtimeState.child.kill();
    }
  } else {
    runtimeState.child.kill('SIGTERM');
  }

  runtimeState.child = null;
}

async function shutdownManagedResources() {
  if (shutdownState.promise) {
    return shutdownState.promise;
  }

  shutdownState.inProgress = true;
  shutdownState.promise = (async () => {
    try {
      await killManagedProcess();
    } finally {
      shutdownState.promise = null;
    }
  })();

  return shutdownState.promise;
}

function beginAppShutdown() {
  if (shutdownState.inProgress) {
    return;
  }

  shutdownState.inProgress = true;

  shutdownManagedResources()
    .catch((error) => {
      runtimeState.lastError = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      app.exit();
    });
}

async function getOtpStatus(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);
  const probe = await probeOtp(normalizedBaseUrl);
  const dataDir = getBundledTransitDataDir();

  return {
    available: true,
    running: probe.running,
    managed: Boolean(runtimeState.child && runtimeState.child.exitCode === null),
    starting: runtimeState.isStarting,
    baseUrl: normalizedBaseUrl,
    detectedUrl: probe.detectedUrl,
    source: probe.source,
    canInstall: true,
    canStop: Boolean(runtimeState.child && runtimeState.child.exitCode === null),
    lastError: runtimeState.lastError,
    lastLogLine: runtimeState.lastLogLine,
    bundledDataAvailable: await fileExists(path.join(dataDir, 'graph.obj')),
  };
}

async function ensureOtpRunning(baseUrl) {
  const normalizedBaseUrl = normalizeOtpBaseUrl(baseUrl);
  const existingStatus = await getOtpStatus(normalizedBaseUrl);
  if (existingStatus.running) {
    return existingStatus;
  }

  if (runtimeState.isStarting) {
    return getOtpStatus(normalizedBaseUrl);
  }

  runtimeState.isStarting = true;
  runtimeState.lastError = '';
  runtimeState.managedBaseUrl = normalizedBaseUrl;

  try {
    await killManagedProcess();
    await assertPortAvailableForManagedOtp(normalizedBaseUrl);

    const transitDataDir = getBundledTransitDataDir();

    if (!await fileExists(path.join(transitDataDir, 'graph.obj'))) {
      throw new Error('Bundled graph.obj was not found. Desktop OTP cannot be started.');
    }

    await assertManagedGraphCompatibility(transitDataDir);

    const javaRuntime = await resolveJavaRuntime();
    const otpJarPath = await ensureOtpJar();

    const port = getManagedOtpPort(normalizedBaseUrl);
    const child = spawn(
      javaRuntime.command,
      ['-Xmx2G', '-jar', otpJarPath, '--load', transitDataDir, '--port', String(port)],
      {
        cwd: transitDataDir,
        windowsHide: true,
      },
    );

    runtimeState.child = child;
    readChildLog(child.stdout, 'stdout: ');
    readChildLog(child.stderr, 'stderr: ');

    child.on('error', (error) => {
      runtimeState.lastError = error.message;
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        const detail = runtimeState.lastLogLine ? ` Last log: ${runtimeState.lastLogLine}` : '';
        runtimeState.lastError = runtimeState.lastError || `OTP exited with code ${code}.${detail}`;
      }
      runtimeState.child = null;
    });

    await waitForOtpStartup(normalizedBaseUrl);
    return getOtpStatus(normalizedBaseUrl);
  } catch (error) {
    runtimeState.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    runtimeState.isStarting = false;
  }
}

async function stopOtpRuntime() {
  await killManagedProcess();
  return getOtpStatus(runtimeState.managedBaseUrl);
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    return;
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('otp-runtime:get-status', async (_event, options = {}) => getOtpStatus(options.baseUrl));
ipcMain.handle('otp-runtime:ensure-running', async (_event, options = {}) => ensureOtpRunning(options.baseUrl));
ipcMain.handle('otp-runtime:stop', async () => stopOtpRuntime());

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (shutdownState.inProgress) {
    return;
  }

  event.preventDefault();
  beginAppShutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('SIGINT', () => {
  beginAppShutdown();
});

process.on('SIGTERM', () => {
  beginAppShutdown();
});

process.on('uncaughtException', (error) => {
  runtimeState.lastError = error instanceof Error ? error.message : String(error);
  beginAppShutdown();
});