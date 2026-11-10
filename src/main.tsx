import React from 'react'
import { createRoot } from 'react-dom/client'
import { SimpleGenerator } from './components/SimpleGenerator'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><SimpleGenerator /></React.StrictMode>)
