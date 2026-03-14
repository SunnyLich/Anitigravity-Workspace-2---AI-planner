const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('otpDesktop', {
  isAvailable: true,
  getStatus: (options = {}) => ipcRenderer.invoke('otp-runtime:get-status', options),
  ensureRunning: (options = {}) => ipcRenderer.invoke('otp-runtime:ensure-running', options),
  stop: () => ipcRenderer.invoke('otp-runtime:stop'),
});