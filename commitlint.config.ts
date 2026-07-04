// Enforce Conventional Commits format (works with commit-and-tag-version used for releases)
// Passing examples: feat(notify): ..., fix: ..., chore(release): 1.12.0
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // allow Thai/emoji subjects — don't enforce case, relax the max length
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
  },
};
