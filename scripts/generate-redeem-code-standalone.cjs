#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function usage() {
  process.stdout.write([
    'Usage:',
    '  TRAVEL_STUDY_REDEEM_PRIVATE_KEY=<private.pem> node generate-redeem-code-standalone.cjs --credits 20',
    '  TRAVEL_STUDY_REDEEM_PRIVATE_KEY=<private.pem> node generate-redeem-code-standalone.cjs --credits 20 --expires-at 2026-12-31T23:59:59+08:00',
    '',
    'The private key must match the public key bundled with the application.',
  ].join('\n') + '\n');
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const credits = Number(option('--credits') || process.argv[2]);
  const units = Math.round(credits * 10);
  if (!Number.isFinite(credits) || credits <= 0 || units <= 0 || Math.abs(credits * 10 - units) > 1e-8) {
    fail('兑换积分必须是正数，且最多保留一位小数。');
    return;
  }

  const expiresAtInput = option('--expires-at');
  if (expiresAtInput !== undefined && !Number.isFinite(Date.parse(expiresAtInput))) {
    fail('兑换码过期时间无效。');
    return;
  }

  const privateKeyPath = process.env.TRAVEL_STUDY_REDEEM_PRIVATE_KEY;
  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
    fail('TRAVEL_STUDY_REDEEM_PRIVATE_KEY 必须指向有效的 Ed25519 私钥 PEM 文件。');
    return;
  }

  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath, 'utf8'));
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('invalid key type');
  } catch {
    fail('兑换私钥无效，必须为 Ed25519 PEM 私钥。');
    return;
  }

  const payload = Buffer.from(JSON.stringify({
    v: 2,
    id: crypto.randomUUID(),
    credits,
    expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null,
  }), 'utf8');
  const payloadEncoded = payload.toString('base64url');
  const signature = crypto.sign(null, payload, privateKey).toString('base64url');
  const code = `RC2.${payloadEncoded}.${signature}`;
  process.stdout.write(`${code}\n`);
}

main();
