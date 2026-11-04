/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Cores da Difusora 107,3: azul do logotipo e dourado da nota musical
        marca: {
          50: '#eef0fa',
          100: '#dde0f3',
          200: '#bfc4e8',
          300: '#959cd6',
          400: '#6c74c0',
          500: '#4e56a8',
          600: '#40478f',
          700: '#363c80',
          800: '#2b306a',
          900: '#212554',
          950: '#151736',
        },
        ouro: {
          50: '#fffbea',
          100: '#fff4c2',
          200: '#ffea8a',
          300: '#fadf4a',
          400: '#f4cf2a',
          500: '#eec225',
          600: '#d6a51a',
          700: '#b08214',
          800: '#8c6513',
          900: '#704f12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
