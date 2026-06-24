export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'ci']],
    'scope-enum': [
      2,
      'always',
      ['api', 'checker', 'db', 'logger', 'sla', 'infra', 'docs', 'repo', 'bench'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-max-length': [2, 'always', 72],
    'subject-empty': [2, 'never'],
  },
};
