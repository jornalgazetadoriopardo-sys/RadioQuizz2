import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Compatível com iPhones a partir do iOS 14 e Androids com Chrome 87+.
  build: { target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
})
