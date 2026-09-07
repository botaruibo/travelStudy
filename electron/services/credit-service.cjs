const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { nowInChina } = require('./time.cjs');
const { resolveConfigFile } = require('./runtime-paths.cjs');

const ACCOUNT_KEY = 'local-default';
const INITIAL_GRANTED_UNITS = 5000;
const UNITS_PER_CREDIT = 10;
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const formatCredits = (units) => Number((Number(units || 0) / UNITS_PER_CREDIT).toFixed(1));
const toUnits = (credits) => Math.round(Number(credits) * UNITS_PER_CREDIT);

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function decodeCanonicalBase64url(value) {
  const bytes = Buffer.from(value, 'base64url');
  if (!bytes.length || bytes.toString('base64url') !== value) throw new Error('invalid base64url');
  return bytes;
}

function redeemPublicKey() {
  const publicKeyPath = resolveConfigFile('redeem-public-key.pem') || path.join(__dirname, '..', 'config', 'redeem-public-key.pem');
  const key = crypto.createPublicKey(fs.readFileSync(publicKeyPath, 'utf8'));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('兑换公钥必须为 Ed25519 公钥');
  return key;
}

class CreditService {
  constructor(db) {
    this.db = db;
  }

  verifyRedeemPublicKey() {
    redeemPublicKey();
  }

  removeLegacyRechargeKey() {
    return this.db.run('DELETE FROM system_config WHERE config_key = ?', ['creditConfig']);
  }

  ensureDefaultAccount() {
    const existing = this.db.get('SELECT id FROM credit_accounts WHERE account_key = ?', [ACCOUNT_KEY]);
    if (existing) return this.getBalance();
    const stamp = nowInChina();
    this.db.run(
      'INSERT INTO credit_accounts (id, account_key, balance_units, initial_granted_units, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id('credit-account'), ACCOUNT_KEY, INITIAL_GRANTED_UNITS, INITIAL_GRANTED_UNITS, stamp, stamp]
    );
    return this.getBalance();
  }

  getAccount() {
    return this.db.get('SELECT * FROM credit_accounts WHERE account_key = ?', [ACCOUNT_KEY]);
  }

  getBalance() {
    const account = this.getAccount();
    if (!account) return null;
    return {
      accountId: account.id,
      balance: formatCredits(account.balance_units),
      balanceUnits: Number(account.balance_units),
      initialGranted: formatCredits(account.initial_granted_units),
      updatedAt: account.updated_at,
    };
  }

  getBalanceSummary() {
    const balance = this.getBalance();
    return {
      account: balance,
      recentRechargeRecords: this.listRechargeRecords({ limit: 5 }).items,
      recentConsumptionRecords: this.listConsumptionRecords({ limit: 5 }).items,
    };
  }

  listRechargeRecords({ limit = 20, cursor } = {}) {
    const bounded = Math.max(1, Math.min(100, Number(limit) || 20));
    const rows = this.db.all(
      `SELECT r.*, a.balance_units FROM credit_recharge_records r
       JOIN credit_accounts a ON a.id = r.account_id
       WHERE (? IS NULL OR r.created_at < ?)
       ORDER BY r.created_at DESC LIMIT ?`,
      [cursor || null, cursor || null, bounded]
    );
    return { items: rows.map((row) => ({ ...row, credits: formatCredits(row.credit_units), balance: formatCredits(row.balance_units), metadata: safeJson(row.metadata_json) })), cursor: rows.length === bounded ? rows.at(-1).created_at : null };
  }

  listConsumptionRecords({ limit = 20, cursor } = {}) {
    const bounded = Math.max(1, Math.min(100, Number(limit) || 20));
    const rows = this.db.all(
      `SELECT * FROM credit_consumption_records WHERE (? IS NULL OR created_at < ?)
       ORDER BY created_at DESC LIMIT ?`,
      [cursor || null, cursor || null, bounded]
    );
    return { items: rows.map((row) => ({ ...row, credits: formatCredits(row.credit_units), metadata: safeJson(row.metadata_json) })), cursor: rows.length === bounded ? rows.at(-1).created_at : null };
  }

  async redeemCode(code) {
    const normalized = String(code || '').trim().replace(/\s/g, '');
    if (!/^RC2\.[A-Za-z0-9_-]{16,4096}\.[A-Za-z0-9_-]{32,512}$/.test(normalized)) return this.fail('CREDIT_CODE_INVALID', '兑换码无效，请核对后重试。');
    let payload;
    try {
      const [, payloadEncoded, signatureEncoded] = normalized.split('.');
      const payloadBytes = decodeCanonicalBase64url(payloadEncoded);
      const signature = decodeCanonicalBase64url(signatureEncoded);
      if (!crypto.verify(null, payloadBytes, redeemPublicKey(), signature)) throw new Error('invalid signature');
      payload = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      return this.fail('CREDIT_CODE_INVALID', '兑换码无效，请核对后重试。');
    }
    const credits = Number(payload?.credits);
    const units = toUnits(credits);
    if (payload?.v !== 2 || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(payload?.id || '')) || !Number.isFinite(credits) || credits <= 0 || units <= 0 || Math.abs(credits * 10 - units) > 1e-8) return this.fail('CREDIT_CODE_INVALID', '兑换码无效，请核对后重试。');
    if (payload.expiresAt !== null && (!Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) < Date.now())) return this.fail('CREDIT_CODE_EXPIRED', '该兑换码已过期。');
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    try {
      return await this.db.transaction(() => {
        const account = this.getAccount();
        if (!account) throw new Error('CREDIT_ACCOUNT_INVALID');
        if (this.db.get('SELECT id FROM credit_recharge_records WHERE redeem_code_id = ? OR redeem_code_hash = ?', [payload.id, hash])) throw new Error('CREDIT_CODE_ALREADY_USED');
        const stamp = nowInChina();
        this.db.run('UPDATE credit_accounts SET balance_units = balance_units + ?, updated_at = ? WHERE id = ?', [units, stamp, account.id]);
        this.db.run('INSERT INTO credit_recharge_records (id, account_id, redeem_code_id, redeem_code_hash, credit_units, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('credit-recharge'), account.id, payload.id, hash, units, JSON.stringify({ expiresAt: payload.expiresAt }), stamp]);
        return { ok: true, credits: formatCredits(units), balance: this.getBalance() };
      });
    } catch (error) {
      if (error.message === 'CREDIT_CODE_ALREADY_USED') return this.fail('CREDIT_CODE_ALREADY_USED', '该兑换码已使用，不能重复兑换。');
      return this.fail('CREDIT_CODE_INVALID', '兑换码无效，请核对后重试。');
    }
  }

  consume({ actionId, buttonId, creditUnits, taskId, metadata = {} }) {
    const account = this.getAccount();
    if (!account || Number(account.balance_units) < 0) return this.fail('CREDIT_ACCOUNT_INVALID', '积分账户余额异常，请前往积分管理核对余额。');
    if (!Number.isInteger(creditUnits) || creditUnits <= 0 || Number(account.balance_units) < creditUnits) return this.fail('CREDIT_INSUFFICIENT', '积分不足，请前往积分管理兑换。', this.getBalance());
    const stamp = nowInChina();
    this.db.run('UPDATE credit_accounts SET balance_units = balance_units - ?, updated_at = ? WHERE id = ? AND balance_units >= ?', [creditUnits, stamp, account.id, creditUnits]);
    const remaining = this.db.get('SELECT balance_units FROM credit_accounts WHERE id = ?', [account.id]);
    if (!remaining || Number(remaining.balance_units) < 0) throw new Error('CREDIT_INSUFFICIENT');
    this.db.run('INSERT INTO credit_consumption_records (id, account_id, action_id, button_id, credit_units, task_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id('credit-consumption'), account.id, actionId, buttonId || null, creditUnits, taskId, JSON.stringify(metadata), stamp]);
    return { ok: true, balance: this.getBalance() };
  }

  fail(code, message, balance) {
    return { ok: false, code, message, ...(balance ? { balance } : {}) };
  }
}

module.exports = { CreditService, formatCredits, toUnits, UNITS_PER_CREDIT };
