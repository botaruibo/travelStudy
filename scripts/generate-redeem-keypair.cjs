#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function usage() {
  process.stdout.write([
    'Usage:',
    '  node generate-redeem-keypair.cjs --private-out <private.pem> --public-out <public.pem> [--force]',
    '',
    'Keep the private key outside the application package and Git repository.',
  ].join('\n') + '\n');
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const privateOut = option('--private-out');
  const publicOut = option('--public-out');
  if (!privateOut || !publicOut) {
    fail('必须提供 --private-out 和 --public-out。');
    return;
  }
  if (!process.argv.includes('--force') && (fs.existsSync(privateOut) || fs.existsSync(publicOut))) {
    fail('密钥文件已存在；确认需要替换时请追加 --force。');
    return;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(privateOut), { recursive: true });
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.writeFileSync(privateOut, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.chmodSync(privateOut, 0o600);
  fs.writeFileSync(publicOut, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
  process.stdout.write(`已写入公钥：${publicOut}\n`);
  process.stdout.write(`已写入私钥：${privateOut}\n`);
}

main();
