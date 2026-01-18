module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'lib/**/*.js',
    'api/**/*.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
