/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores de la bandera de Venezuela
        bandera: {
          amarillo: '#CF9B00',
          azul: '#002FA7',
          rojo: '#CC0001',
        },
      },
    },
  },
  plugins: [],
}
