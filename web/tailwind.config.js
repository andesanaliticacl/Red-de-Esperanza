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
        // Neutros con una pizca de azul: se sienten menos "sucios" que los
        // grises puros y hacen juego con el azul de la marca.
        tinta: {
          50: '#F7F8FA',
          100: '#EDEFF3',
          200: '#DDE1E8',
          300: '#C3C9D4',
          400: '#98A1B2',
          500: '#6B7488',
          600: '#4B5468',
          700: '#374151',
          800: '#232B3A',
          900: '#141A25',
        },
      },
      // Sombras en varias capas: una sombra plana se ve barata; dos capas
      // (una de contacto, otra difusa) es lo que da sensación de calidad.
      boxShadow: {
        suave:
          '0 1px 2px rgba(20, 26, 37, 0.04), 0 2px 8px rgba(20, 26, 37, 0.06)',
        media:
          '0 1px 2px rgba(20, 26, 37, 0.05), 0 6px 16px rgba(20, 26, 37, 0.08)',
        alta: '0 2px 4px rgba(20, 26, 37, 0.06), 0 12px 32px rgba(20, 26, 37, 0.12)',
        // Para botones de color: la sombra toma el tono del propio botón.
        boton: '0 1px 2px rgba(20, 26, 37, 0.08), 0 4px 12px rgba(20, 26, 37, 0.10)',
      },
      transitionTimingFunction: {
        suave: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
