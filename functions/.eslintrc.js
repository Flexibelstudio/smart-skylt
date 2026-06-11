module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020, // Tells ESLint to expect modern JavaScript syntax
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "quotes": ["error", "double"],
    "linebreak-style": 0,
    "max-len": ["error", {"code": 140}],
    "require-jsdoc": 0,
    "indent": "off", // Turning off the problematic indent rule
    "object-curly-spacing": ["error", "never"],
    "comma-dangle": ["error", "always-multiline"],
  },
};
