import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const measured = import.meta.env.VITE_MEASURE === '1'
if (measured) window.__reactCommitCount = 0
const app = <StrictMode><App /></StrictMode>
createRoot(document.getElementById('root')).render(app)
