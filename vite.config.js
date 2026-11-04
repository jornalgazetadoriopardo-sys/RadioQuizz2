import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versão mostrada no app (canto do Painel Admin e tela de Ajuda), para conferir o que está no ar.
// No Netlify vem de COMMIT_REF; no computador, do git.
const commit = (() => {
  try {
    return (process.env.COMMIT_REF || execSync('git rev-parse HEAD').toString()).trim().slice(0, 7)
  } catch {
    return 'local'
  }
})()
const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default defineConfig({
  plugins: [react()],
  define: { __VERSAO__: JSON.stringify(`${commit} · ${quando}`) },
  // Compatível com iPhones a partir do iOS 14 e Androids com Chrome 87+.
  build: { target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
})
