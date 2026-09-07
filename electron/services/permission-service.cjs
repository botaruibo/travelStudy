const fs = require('node:fs');
const { getFeaturePolicy } = require('./feature-policy.cjs');
const { probeDuration } = require('./media.cjs');
const { formatCredits } = require('./credit-service.cjs');

class PermissionService {
  constructor({ db, creditService }) {
    this.db = db;
    this.creditService = creditService;
  }

  async checkAvailability({ actionId, buttonId, context = {} }) {
    const policy = getFeaturePolicy(actionId);
    if (!policy || (buttonId && !policy.buttonIds.includes(buttonId))) return this.fail(actionId, 'ACTION_NOT_CONFIGURED', '此功能的权限策略尚未配置，暂时无法使用。');
    if (policy.pricing?.type === 'free') return { available: true, actionId, cost: 0, balance: this.creditService.getBalance()?.balance ?? 0, costUnits: 0 };
    let costUnits;
    try {
      costUnits = await this.calculateCostUnits(policy, context.videoId);
    } catch (error) {
      return this.fail(actionId, 'ACTION_NOT_CONFIGURED', error.message || '此功能的权限策略尚未配置，暂时无法使用。');
    }
    const balance = this.creditService.getBalance();
    const cost = formatCredits(costUnits);
    if (!balance || balance.balanceUnits < 0) return this.fail(actionId, 'CREDIT_ACCOUNT_INVALID', '积分账户余额异常，请前往积分管理核对余额。', cost, balance?.balance);
    if (balance.balanceUnits < costUnits) return this.fail(actionId, 'CREDIT_INSUFFICIENT', `积分不足，本次${policy.label}需要 ${cost.toFixed(1)} 积分，当前余额 ${balance.balance.toFixed(1)} 积分。请前往积分管理兑换。`, cost, balance.balance);
    return { available: true, actionId, cost, costUnits, balance: balance.balance };
  }

  async calculateCostUnits(policy, videoId) {
    if (typeof videoId !== 'string' || !videoId.trim()) throw new Error('未找到待分析视频，无法计算积分。');
    const video = this.db.get('SELECT proxy_path, audio_path FROM videos WHERE id = ?', [videoId]);
    if (!video) throw new Error('视频不存在，无法计算积分。');
    const targetPath = policy.pricing.type === 'audio-duration' ? video.audio_path : video.proxy_path;
    if (!targetPath || !fs.existsSync(targetPath)) throw new Error(policy.pricing.type === 'audio-duration' ? '压缩音频尚未准备完成，无法计算积分。' : '压缩视频尚未准备完成，无法计算积分。');
    const duration = await probeDuration(targetPath);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('媒体时长不可读，无法计算积分。');
    const perMinute = Number(policy.pricing.creditUnitsPerStartedMinute);
    if (!Number.isInteger(perMinute) || perMinute <= 0) throw new Error('此功能的权限策略尚未配置，暂时无法使用。');
    return Math.ceil(duration / 60) * perMinute;
  }

  fail(actionId, code, message, cost, balance) {
    return { available: false, actionId, code, message, ...(cost !== undefined ? { cost } : {}), ...(balance !== undefined ? { balance } : {}) };
  }
}

module.exports = { PermissionService };
