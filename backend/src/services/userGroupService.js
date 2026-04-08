/**
 * User Group Service — manage user groups, members, and granular permissions.
 *
 * Permission format: "section:action"
 *   actions: view < edit < manage  (manage implies edit implies view)
 *   special user actions: users:ban, users:delete, users:role (at manage level)
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ── Permission definitions ─────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  // [id, section, action, label, description]
  ['overview:view',         'overview',      'view',   '查看概览',           '查看系统统计数据'],
  ['games:view',            'games',         'view',   '查看游戏',           '查看游戏列表和详情'],
  ['games:manage',          'games',         'manage', '管理游戏',           '结束、删除游戏及修改游戏设置'],
  ['users:view',            'users',         'view',   '查看玩家',           '查看玩家列表和详情'],
  ['users:edit',            'users',         'edit',   '编辑玩家',           '修改玩家资料（昵称、UID、重置密码）'],
  ['users:manage',          'users',         'manage', '管理玩家',           '删除玩家、修改角色、封禁账号'],
  ['avatars:view',          'avatars',       'view',   '查看头像',           '查看玩家头像列表'],
  ['avatars:manage',        'avatars',       'manage', '管理头像',           '上传或删除玩家头像'],
  ['ai-config:view',        'ai-config',     'view',   '查看AI配置',         '查看AI服务配置信息'],
  ['ai-config:edit',        'ai-config',     'edit',   '编辑AI配置',         '添加、修改、删除AI服务配置'],
  ['knowledge:view',        'knowledge',     'view',   '查看知识库',         '浏览知识库文档'],
  ['knowledge:edit',        'knowledge',     'edit',   '编辑知识库',         '添加、删除、重建向量化知识文档'],
  ['ai-confirmed:view',     'ai-confirmed',  'view',   '查看AI确认知识库',   '浏览AI确认的知识库条目'],
  ['ai-confirmed:manage',   'ai-confirmed',  'manage', '管理AI确认知识库',   '删除AI确认知识库条目'],
  ['curation:view',         'curation',      'view',   '查看知识策展',       '浏览待审核概念'],
  ['curation:manage',       'curation',      'manage', '管理知识策展',       '审批、拒绝、归档概念'],
  ['ai-decisions:view',     'ai-decisions',  'view',   '查看AI完整回复',     '查看AI验证的完整回复记录'],
  ['logs:view',             'logs',          'view',   '查看服务器日志',     '访问服务器运行日志'],
  ['security:view',         'security',      'view',   '查看安全设置',       '查看管理员密钥和JWT配置（掩码）'],
  ['security:edit',         'security',      'edit',   '修改安全设置',       '更改管理员密钥和JWT密钥（仅超级管理员）'],
  ['user-groups:view',      'user-groups',   'view',   '查看用户组',         '查看用户组列表和成员'],
  ['user-groups:manage',    'user-groups',   'manage', '管理用户组',         '创建、编辑、删除用户组及管理成员'],
];

// Map of valid permission IDs for fast lookup
const VALID_PERMISSION_IDS = new Set(ALL_PERMISSIONS.map(p => p[0]));

// ── Permission hierarchy helpers ──────────────────────────────────────────────

// Returns true if the given permission set satisfies section:action requirement,
// respecting the hierarchy: manage > edit > view
function hasPermission(permSet, section, action) {
  const hierarchy = ['view', 'edit', 'manage'];
  const requiredIdx = hierarchy.indexOf(action);
  if (requiredIdx === -1) return permSet.has(`${section}:${action}`); // custom action, exact match
  // Check if user has this action OR a higher action in the hierarchy
  for (let i = requiredIdx; i < hierarchy.length; i++) {
    if (permSet.has(`${section}:${hierarchy[i]}`)) return true;
  }
  return false;
}

// Build a permission Set from a user's groups
function buildPermissionSet(userId) {
  const groups = db.getUserGroups.all(userId);
  const perms = new Set();
  for (const g of groups) {
    db.listGroupPerms.all(g.id).forEach(r => perms.add(r.section));
  }
  return perms;
}

// ── Group CRUD ────────────────────────────────────────────────────────────────

function listGroups() {
  const groups = db.listUserGroups.all();
  return groups.map(g => ({
    ...g,
    permissions: db.listGroupPerms.all(g.id).map(r => r.section),
    member_count: db.db.prepare(`SELECT COUNT(*) as c FROM user_group_members WHERE group_id=?`).get(g.id)?.c || 0,
  }));
}

function getGroup(groupId) {
  const g = db.getUserGroup.get(groupId);
  if (!g) return null;
  return {
    ...g,
    permissions: db.listGroupPerms.all(g.id).map(r => r.section),
    members: db.getGroupMembers.all(g.id),
  };
}

function createGroup(name, description = '', color = '#6366f1', permissions = []) {
  if (!name || !name.trim()) throw new Error('请提供组名称');
  const id = uuidv4();
  db.insertUserGroup.run(id, name.trim(), description.trim(), color);
  const validPerms = permissions.filter(s => VALID_PERMISSION_IDS.has(s));
  for (const perm of validPerms) {
    db.setGroupPerm.run(id, perm);
  }
  return getGroup(id);
}

function updateGroup(groupId, { name, description, color, permissions }) {
  const existing = db.getUserGroup.get(groupId);
  if (!existing) throw new Error('用户组不存在');
  db.updateUserGroup.run(
    name        != null ? name.trim()        : existing.name,
    description != null ? description.trim() : existing.description,
    color       != null ? color              : existing.color,
    groupId,
  );
  if (permissions != null && Array.isArray(permissions)) {
    db.replaceGroupPerms.run(groupId);
    const validPerms = permissions.filter(s => VALID_PERMISSION_IDS.has(s));
    for (const perm of validPerms) {
      db.setGroupPerm.run(groupId, perm);
    }
  }
  return getGroup(groupId);
}

function deleteGroup(groupId) {
  const existing = db.getUserGroup.get(groupId);
  if (!existing) throw new Error('用户组不存在');
  db.deleteUserGroup.run(groupId);
  return { ok: true };
}

function addMember(groupId, userId) {
  if (!db.getUserGroup.get(groupId)) throw new Error('用户组不存在');
  if (!db.getUserById.get(userId)) throw new Error('用户不存在');
  db.addGroupMember.run(groupId, userId);
  return { ok: true };
}

function removeMember(groupId, userId) {
  db.removeGroupMember.run(groupId, userId);
  return { ok: true };
}

function getUserGroups(userId) {
  return db.getUserGroups.all(userId).map(g => ({
    ...g,
    permissions: db.listGroupPerms.all(g.id).map(r => r.section),
  }));
}

module.exports = {
  ALL_PERMISSIONS,
  VALID_PERMISSION_IDS,
  hasPermission,
  buildPermissionSet,
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  getUserGroups,
};
