/**
 * Conventional Commits, with a scope allow-list that matches the build plan's
 * step numbers so `git log --oneline` reads as a build history.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'scope-empty': [1, 'never'],
  },
};
