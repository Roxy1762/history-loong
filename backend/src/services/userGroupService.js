/**
 * User Group Service — manage user groups, members, and section permissions.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// All admin section IDs that can be permissioned
const ALL_SECTIONS = [
  'overview', 'games', 'users', 'avatars', 'ai-config',
  'knowledge', 'ai-confirmed', 'curation', 'ai-decisions', 'logs', 'security',
  'user-groups',
];

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
  const validPerms = permissions.filter(s => ALL_SECTIONS.includes(s));
  for (const section of validPerms) {
    db.setGroupPerm.run(id, section);
  }
  return getGroup(id);
}

function updateGroup(groupId, { name, description, color, permissions }) {
  const existing = db.getUserGroup.get(groupId);
  if (!existing) throw new Error('用户组不存在');
  db.updateUserGroup.run(
    name    != null ? name.trim()        : existing.name,
    description != null ? description.trim() : existing.description,
    color   != null ? color              : existing.color,
    groupId,
  );
  if (permissions != null && Array.isArray(permissions)) {
    db.replaceGroupPerms.run(groupId);
    const validPerms = permissions.filter(s => ALL_SECTIONS.includes(s));
    for (const section of validPerms) {
      db.setGroupPerm.run(groupId, section);
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
  ALL_SECTIONS,
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  getUserGroups,
};
