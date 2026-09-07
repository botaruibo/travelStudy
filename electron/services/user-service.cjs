const crypto = require('node:crypto');
const { nowInChina } = require('./time.cjs');
// #region debug-point C:user-init-observability
const reportUserInitDebug = (stage, data = {}) => { fetch('http://127.0.0.1:7778/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'electron-startup-failure', runId: 'post-fix', hypothesisId: 'C', location: 'electron/services/user-service.cjs', msg: `[DEBUG] user initialization ${stage}`, data, ts: Date.now() }) }).catch(() => {}); };
// #endregion

const DEFAULT_USER = {
  id: '10035',
  username: '超级奶妈',
  displayName: '超级奶妈',
  password: 'cjnmixx',
};

const ADMIN_USER = {
  id: '10001',
  username: 'admin',
  displayName: 'admin',
  password: 'cjnbixx',
};

const RESOURCES = [
  ['menu.workbench', '工作台', 'menu', null, false],
  ['menu.tour', '研学笔记', 'menu', null, false],
  ['menu.materials', '素材管理', 'menu', 'menu.tour', false],
  ['menu.library', '临时笔记', 'menu', 'menu.tour', false],
  ['menu.notes', '笔记本', 'menu', 'menu.tour', false],
  ['menu.planning', '精读笔记', 'menu', null, false],
  ['menu.system-config', '系统配置', 'menu', null, false],
  ['menu.profile', '个人信息', 'menu', 'menu.system-config', false],
  ['menu.application', '应用配置', 'menu', 'menu.system-config', true],
  ['menu.ai-config', 'AI 模型配置', 'menu', 'menu.system-config', true],
  ['menu.template-manager', '笔记模版', 'menu', 'menu.system-config', true],
  ['menu.permissions', '权限管理', 'menu', 'menu.system-config', true],
  ['menu.credits', '积分管理', 'menu', null, false],
  ['video.analyze.audio', '音频场景分析', 'action', 'menu.materials', false],
  ['video.analyze.vision', '视频场景分析', 'action', 'menu.materials', false],
  ['action.credits.redeem', '兑换积分码', 'action', 'menu.credits', false],
  ['action.profile.save', '保存个人信息', 'action', 'menu.profile', false],
  ['action.config.save', '保存应用配置', 'action', 'menu.application', true],
  ['action.ai-config.save', '保存 AI 模型配置', 'action', 'menu.ai-config', true],
  ['action.templates.manage', '管理笔记模版', 'action', 'menu.template-manager', true],
  ['action.permissions.manage', '管理用户权限', 'action', 'menu.permissions', true],
];

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, saltBase64, hashBase64] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltBase64 || !hashBase64) return false;
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltBase64, 'base64'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarPath: row.avatar_path || '',
    isSuperuser: Boolean(row.is_superuser),
  };
}

class UserService {
  constructor(db) {
    this.db = db;
    this.currentUserId = null;
  }

  async init() {
    const stamp = nowInChina();
    for (const [index, [id, name, resourceType, parentId, isAdminOnly]] of RESOURCES.entries()) {
      // #region debug-point C:resource-write
      reportUserInitDebug('resource-write-start', { index, id });
      // #endregion
      await this.db.run(
        `INSERT INTO resources (id, name, resource_type, parent_id, is_admin_only, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, resource_type = excluded.resource_type, parent_id = excluded.parent_id, is_admin_only = excluded.is_admin_only, updated_at = excluded.updated_at`,
        [id, name, resourceType, parentId, isAdminOnly ? 1 : 0, stamp, stamp]
      );
      // #region debug-point C:resource-write-complete
      reportUserInitDebug('resource-write-complete', { index, id });
      // #endregion
    }
    // #region debug-point C:user-migration
    reportUserInitDebug('resource-seed-complete');
    // #endregion
    await this.migrateLegacyDefaultUsers(stamp);
    await this.ensureUser(DEFAULT_USER, false, stamp);
    await this.ensureUser(ADMIN_USER, true, stamp);
    await this.ensureDefaultPermissions(DEFAULT_USER.id, false, stamp);
    await this.ensureDefaultPermissions(ADMIN_USER.id, true, stamp);
    await this.ensureParentResourcePermissions(stamp);
  }

  async migrateLegacyDefaultUsers(stamp) {
    await this.migrateLegacyUser({
      canonical: DEFAULT_USER,
      legacyIds: ['user-10035'],
      legacyUsernames: ['超级奶妈（id10035）'],
      isSuperuser: false,
      stamp,
    });
    await this.migrateLegacyUser({
      canonical: ADMIN_USER,
      legacyIds: ['user-admin'],
      legacyUsernames: ['admin'],
      isSuperuser: true,
      stamp,
      replaceOldDefaultPassword: 'admin',
    });
  }

  async migrateLegacyUser({ canonical, legacyIds, legacyUsernames, isSuperuser, stamp, replaceOldDefaultPassword }) {
    const canonicalRow = this.db.get('SELECT * FROM users WHERE id = ?', [canonical.id]);
    const legacyRow = this.db.all(
      `SELECT * FROM users WHERE id IN (${legacyIds.map(() => '?').join(',')}) OR username IN (${legacyUsernames.map(() => '?').join(',')}) LIMIT 1`,
      [...legacyIds, ...legacyUsernames]
    )[0];
    if (!canonicalRow && legacyRow) {
      const temporaryUsername = `__migrating_${canonical.id}__`;
      await this.db.transaction(() => {
        this.db.run(
          'INSERT INTO users (id, username, display_name, password_hash, avatar_path, is_superuser, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [canonical.id, temporaryUsername, canonical.displayName, legacyRow.password_hash, legacyRow.avatar_path, isSuperuser ? 1 : 0, legacyRow.created_at, stamp]
        );
        this.db.run(
          'INSERT OR IGNORE INTO user_permissions (user_id, resource_id, created_at) SELECT ?, resource_id, created_at FROM user_permissions WHERE user_id = ?',
          [canonical.id, legacyRow.id]
        );
        this.db.run('DELETE FROM user_permissions WHERE user_id = ?', [legacyRow.id]);
        this.db.run('DELETE FROM users WHERE id = ?', [legacyRow.id]);
        this.db.run('UPDATE users SET username = ?, updated_at = ? WHERE id = ?', [canonical.username, stamp, canonical.id]);
      });
    }
    const current = this.db.get('SELECT * FROM users WHERE id = ?', [canonical.id]);
    if (!current) return;
    const updates = [];
    const params = [];
    if (current.username !== canonical.username && (legacyUsernames.includes(current.username) || current.username === canonical.username)) {
      updates.push('username = ?');
      params.push(canonical.username);
    }
    if (replaceOldDefaultPassword && verifyPassword(replaceOldDefaultPassword, current.password_hash)) {
      updates.push('password_hash = ?');
      params.push(hashPassword(canonical.password));
    }
    if (updates.length) {
      updates.push('updated_at = ?');
      params.push(stamp, canonical.id);
      this.db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }
  }

  async ensureUser(user, isSuperuser, stamp) {
    const existing = this.db.get('SELECT id FROM users WHERE id = ?', [user.id]);
    if (existing) return;
    await this.db.run(
      'INSERT INTO users (id, username, display_name, password_hash, is_superuser, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.displayName, hashPassword(user.password), isSuperuser ? 1 : 0, stamp, stamp]
    );
  }

  async ensureDefaultPermissions(userId, includeAdmin, stamp) {
    const existing = this.db.get('SELECT user_id FROM user_permissions WHERE user_id = ? LIMIT 1', [userId]);
    if (existing) return;
    const resources = this.db.all('SELECT id FROM resources WHERE ? = 1 OR is_admin_only = 0', [includeAdmin ? 1 : 0]);
    await this.db.transaction(() => {
      for (const resource of resources) {
        this.db.run('INSERT OR IGNORE INTO user_permissions (user_id, resource_id, created_at) VALUES (?, ?, ?)', [userId, resource.id, stamp]);
      }
    });
  }

  async ensureParentResourcePermissions(stamp) {
    // A feature cannot be reached unless its parent menu is visible.
    for (let depth = 0; depth < 3; depth += 1) {
      const missingParents = this.db.all(
        `SELECT DISTINCT p.user_id, r.parent_id AS resource_id
         FROM user_permissions p
         JOIN resources r ON r.id = p.resource_id
         LEFT JOIN user_permissions parent ON parent.user_id = p.user_id AND parent.resource_id = r.parent_id
         WHERE r.parent_id IS NOT NULL AND parent.user_id IS NULL`
      );
      if (!missingParents.length) return;
      await this.db.transaction(() => {
        for (const permission of missingParents) {
          this.db.run(
            'INSERT OR IGNORE INTO user_permissions (user_id, resource_id, created_at) VALUES (?, ?, ?)',
            [permission.user_id, permission.resource_id, stamp]
          );
        }
      });
    }
  }

  login(username, password) {
    const row = this.db.get('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
    if (!row || !verifyPassword(password, row.password_hash)) return null;
    this.currentUserId = row.id;
    return this.session();
  }

  logout() {
    this.currentUserId = null;
    return { ok: true };
  }

  currentUser() {
    if (!this.currentUserId) return null;
    return this.db.get('SELECT * FROM users WHERE id = ?', [this.currentUserId]);
  }

  session() {
    const user = this.currentUser();
    if (!user) return null;
    return { user: toPublicUser(user), resources: this.resourcesForUser(user.id) };
  }

  requireCurrentUser() {
    const user = this.currentUser();
    if (!user) throw new Error('请先登录');
    return user;
  }

  resourcesForUser(userId) {
    return this.db.all(
      `SELECT r.id FROM resources r
       JOIN user_permissions p ON p.resource_id = r.id
       WHERE p.user_id = ?
       ORDER BY r.id`,
      [userId]
    ).map((row) => row.id);
  }

  hasResource(resourceId) {
    const user = this.requireCurrentUser();
    return Boolean(this.db.get('SELECT 1 AS allowed FROM user_permissions WHERE user_id = ? AND resource_id = ?', [user.id, resourceId]));
  }

  requireResource(resourceId) {
    if (!this.hasResource(resourceId)) throw new Error('当前账号没有该功能权限');
  }

  isSuperuser() {
    return Boolean(this.requireCurrentUser().is_superuser);
  }

  listUsers() {
    return this.db.all('SELECT * FROM users ORDER BY is_superuser DESC, created_at').map((row) => ({
      ...toPublicUser(row),
      resources: this.resourcesForUser(row.id),
    }));
  }

  listResources() {
    return this.db.all(
      `SELECT id, name, resource_type AS resourceType, parent_id AS parentId, is_admin_only AS isAdminOnly
       FROM resources
       ORDER BY CASE resource_type WHEN 'menu' THEN 0 ELSE 1 END, parent_id, id`
    ).map((row) => ({ ...row, isAdminOnly: Boolean(row.isAdminOnly) }));
  }

  async setPermissions(userId, resourceIds) {
    if (!this.isSuperuser()) throw new Error('仅 admin 可以管理权限');
    const user = this.db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('用户不存在');
    const requestedIds = [...new Set(Array.isArray(resourceIds) ? resourceIds.filter((id) => typeof id === 'string' && id.length <= 128) : [])];
    const resourceRows = this.db.all('SELECT id, parent_id FROM resources');
    const resourceById = new Map(resourceRows.map((row) => [row.id, row]));
    const validIds = new Set(requestedIds.filter((id) => resourceById.has(id)));
    for (const resourceId of [...validIds]) {
      let parentId = resourceById.get(resourceId)?.parent_id;
      while (parentId && resourceById.has(parentId)) {
        validIds.add(parentId);
        parentId = resourceById.get(parentId)?.parent_id;
      }
    }
    const stamp = nowInChina();
    await this.db.transaction(() => {
      this.db.run('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
      for (const resourceId of validIds) {
        this.db.run('INSERT INTO user_permissions (user_id, resource_id, created_at) VALUES (?, ?, ?)', [userId, resourceId, stamp]);
      }
    });
    return { userId, resources: this.resourcesForUser(userId) };
  }

  async updateProfile({ username, displayName, password, avatarPath } = {}) {
    const user = this.requireCurrentUser();
    const nextName = typeof displayName === 'string' ? displayName.trim() : user.display_name;
    const nextUsername = typeof username === 'string' ? username.trim() : user.username;
    if (!nextName || nextName.length > 64) throw new Error('用户名长度应为 1 至 64 个字符');
    if (!nextUsername || nextUsername.length > 64) throw new Error('登录用户名长度应为 1 至 64 个字符');
    const owner = this.db.get('SELECT id FROM users WHERE username = ?', [nextUsername]);
    if (owner && owner.id !== user.id) throw new Error('该登录用户名已被使用');
    const updates = ['username = ?', 'display_name = ?', 'updated_at = ?'];
    const params = [nextUsername, nextName, nowInChina()];
    if (typeof password === 'string' && password) {
      if (password.length < 6 || password.length > 128) throw new Error('密码长度应为 6 至 128 个字符');
      updates.push('password_hash = ?');
      params.push(hashPassword(password));
    }
    if (typeof avatarPath === 'string') {
      updates.push('avatar_path = ?');
      params.push(avatarPath || null);
    }
    params.push(user.id);
    await this.db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return toPublicUser(this.currentUser());
  }
}

module.exports = { UserService, DEFAULT_USER, ADMIN_USER, RESOURCES, hashPassword, verifyPassword };
