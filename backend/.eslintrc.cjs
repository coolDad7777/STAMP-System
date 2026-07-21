module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    es2022: true,
    node: true,
    jest: true
  },
  plugins: ['@typescript-eslint'],
  rules: {}
};
