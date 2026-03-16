const DEFAULT_LOCAL_OTP_BASE_URL = 'http://127.0.0.1:8080';

const desktopApi = typeof window !== 'undefined' ? window.otpDesktop : null;

export function isDesktopOtpManagerAvailable() {
  return Boolean(desktopApi?.isAvailable);
}

export async function getDesktopOtpStatus(baseUrl) {
  if (!desktopApi?.getStatus) {
    return {
      available: false,
      running: false,
      managed: false,
      starting: false,
      baseUrl: DEFAULT_LOCAL_OTP_BASE_URL,
      detectedUrl: '',
      source: 'browser-only',
      canInstall: false,
      canStop: false,
      lastError: '',
      lastLogLine: '',
      bundledDataAvailable: false,
    };
  }

  return desktopApi.getStatus({ baseUrl });
}

export async function ensureDesktopOtpRunning(baseUrl) {
  if (!desktopApi?.ensureRunning) {
    throw new Error('Managed OTP controls are only available in the packaged desktop app.');
  }

  return desktopApi.ensureRunning({ baseUrl });
}

export async function stopDesktopOtpRuntime() {
  if (!desktopApi?.stop) {
    throw new Error('Managed OTP controls are only available in the packaged desktop app.');
  }

  return desktopApi.stop();
}
