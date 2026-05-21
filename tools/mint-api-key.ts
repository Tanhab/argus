import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    owner: { type: 'string' },
    scope: { type: 'string' },
  },
});

if (!values.owner || !values.scope) {
  console.error('usage: mint-api-key.ts --owner <owner> --scope <scope>');
  process.exit(1);
}

const rawKey = `argus_chk_${randomBytes(16).toString('base64url')}`;
const keyHash = createHash('sha256').update(rawKey).digest('hex');
const keyPrefix = rawKey.slice(0, 14);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(
  `INSERT INTO api_keys (key_hash, key_prefix, owner, scopes)
   VALUES ($1, $2, $3, $4)`,
  [keyHash, keyPrefix, values.owner, [values.scope]],
);

await pool.end();

console.log('');
console.log('API key minted. This will not be shown again — copy it now.');
console.log('');
console.log(`Key:   ${rawKey}`);
console.log(`Owner: ${values.owner}`);
console.log(`Scope: ${values.scope}`);
console.log('');
