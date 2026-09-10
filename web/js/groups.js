// Only explicit, reviewed relationships are used. Names and distance are NOT evidence of membership.
export function makeGroupIndex(payload = { groups: [] }) {
  const parents = new Map(), memberOf = new Map();
  for (const group of payload.groups || []) {
    if (!/^L\d+$/.test(group.parentId) || !Array.isArray(group.children)) throw new Error('热点组配置格式有误');
    if (parents.has(group.parentId)) throw new Error('父热点重复');
    const children = [...new Set(group.children)];
    if (children.length !== group.children.length || children.includes(group.parentId)) throw new Error('子热点重复或指向自身');
    for (const id of children) {
      if (!/^L\d+$/.test(id) || memberOf.has(id)) throw new Error('子热点编号无效或属于多个组');
      memberOf.set(id, group.parentId);
    }
    parents.set(group.parentId, { ...group, children });
  }
  for (const id of parents.keys()) if (memberOf.has(id)) throw new Error('当前版本只支持单层热点组');
  return { parents, memberOf, checkedAt: payload.checkedAt || '', available: true };
}

export function contextFor(id, index) {
  const group = index.parents.get(id);
  const parentId = index.memberOf.get(id) || null;
  return { role: group ? 'group' : parentId ? 'member' : 'unconfirmed', group: group || (parentId ? index.parents.get(parentId) : null), parentId };
}

export function relationship(requestedId, actualId, index) {
  if (!actualId) return 'unconfirmed';
  if (actualId === requestedId) return 'self';
  if (index.parents.get(requestedId)?.children.includes(actualId)) return 'member';
  return 'unconfirmed';
}

// Keep every upstream row. Unconfirmed locations get their own visible section, never a silent deletion.
export function partitionRecent(items, requestedId, index) {
  const main = [], unconfirmed = [];
  for (const item of items) {
    const row = { ...item, placeRelation: relationship(requestedId, item.locId, index) };
    (row.placeRelation === 'unconfirmed' ? unconfirmed : main).push(row);
  }
  return { main, unconfirmed };
}

export function placeIdsFor(id, index) {
  return new Set([id, ...(index.parents.get(id)?.children || [])]);
}
