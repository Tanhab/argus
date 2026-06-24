export const monitorIdParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Monitor id' },
  },
} as const;

export const checkerIdParams = {
  type: 'object',
  required: ['checkerId'],
  properties: {
    checkerId: { type: 'string', description: 'Checker id (e.g. checker-eu)' },
  },
} as const;
