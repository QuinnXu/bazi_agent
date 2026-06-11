import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/geodata/**',
      'tool/**',
      'types/database_v2.ts',
    ],
  },
  ...nextVitals,
  {
    rules: {
      // This app predates the stricter React Compiler lint defaults that ship
      // with Next 16. Keep the lint gate focused on compatibility issues until
      // those broader legacy patterns are refactored deliberately.
      '@next/next/no-html-link-for-pages': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
]

export default eslintConfig
