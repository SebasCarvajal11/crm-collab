import fs from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const esc = (pem) => JSON.stringify(pem.trimEnd());
const lines = [
  'DATABASE_URL=postgres://root:rootpassword@127.0.0.1:5432/crm_database',
  'DB_SCHEMA=schema_collab',
  'REDIS_URL=redis://127.0.0.1:6379',
  'NODE_ENV=test',
  'PORT=3001',
  'TRUST_GATEWAY_JWT_HEADERS=true',
  `SERVICE_JWT_PRIVATE_KEY=${esc(privateKey)}`,
  `SERVICE_JWT_PUBLIC_KEY=${esc(publicKey)}`,
  'SERVICE_JWT_KID=collab-service-rsa-1',
];

fs.writeFileSync('.env', lines.join('\n') + '\n');
console.log('[setup-test-env] .env successfully generated for crm-collab.');
