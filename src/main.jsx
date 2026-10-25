import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './auth.jsx'
import { DataProvider } from './store.jsx'
import App from './App.jsx'
import ErroGeral from './ErroGeral.jsx'
import { registrarServiceWorker } from './push.js'

registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErroGeral>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </ErroGeral>
  </StrictMode>,
)
