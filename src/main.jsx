import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { BrowserRouter } from 'react-router-dom';
import { msalConfig } from './lib/authConfig.js';
import { ToastProvider } from './components/ui/primitives.jsx';
import { App } from './App.jsx';
import './index.css';

export const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();

const accounts = msalInstance.getAllAccounts();
if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);

msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
    msalInstance.setActiveAccount(event.payload.account);
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </MsalProvider>
  </React.StrictMode>
);
