module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  env: {
    es2022: true,
    browser: true,
    node: true
  },
  plugins: ['@typescript-eslint'],
  rules: {}
};
