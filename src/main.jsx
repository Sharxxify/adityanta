import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { EditorProvider } from './context/EditorContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const reloaded = sessionStorage.getItem('chunk_reload')
  if (!reloaded) {
    sessionStorage.setItem('chunk_reload', '1')
    window.location.reload()
  } else {
    sessionStorage.removeItem('chunk_reload')
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppProvider>
              <EditorProvider>
                <App />
              </EditorProvider>
            </AppProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
