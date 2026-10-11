module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  modulePathIgnorePatterns: ["<rootDir>/.next", "<rootDir>/.test-dist"],
  clearMocks: true,
};
