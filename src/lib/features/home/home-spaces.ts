import type { RoomListItemView } from '#src/generated/protocol';
import { isActiveSpace } from '#lib/features/sidebar/nav-rooms.js';

export interface HomeSpaceRow {
  space: RoomListItemView;
  depth: number;
}

/** Show roots and nested space links up to the sidebar's nesting boundary. */
export function homeSpaceRows(rooms: readonly RoomListItemView[], limit: number): HomeSpaceRow[] {
  const spaces = rooms.filter(isActiveSpace);
  const byId = new Map(spaces.map((space) => [space.room_id, space]));
  const childIds = new Set(
    spaces.flatMap((space) => space.space_children.map((child) => child.room_id))
  );
  const roots = spaces.filter((space) => !childIds.has(space.room_id));
  const depths = new Map<string, number>();

  function discover(root: RoomListItemView): void {
    const queue = [root];
    depths.set(root.room_id, 0);
    for (let index = 0; index < queue.length; index += 1) {
      const parent = queue[index];
      const depth = (depths.get(parent.room_id) ?? 0) + 1;
      for (const edge of parent.space_children) {
        const child = byId.get(edge.room_id);
        if (!child || (depths.get(child.room_id) ?? Infinity) <= depth) continue;
        depths.set(child.room_id, depth);
        queue.push(child);
      }
    }
  }

  // Seed every root first so shared children use their shallowest reachable depth.
  for (const root of roots) depths.set(root.room_id, 0);
  for (const root of roots) discover(root);
  // A component made entirely of cycles still needs an entry point.
  for (const space of spaces) {
    if (depths.has(space.room_id)) continue;
    roots.push(space);
    discover(space);
  }

  const rows: HomeSpaceRow[] = [];
  const seen = new Set<string>();
  const pending = roots
    .slice()
    .reverse()
    .map((space) => ({ space, depth: 0 }));
  while (pending.length > 0) {
    const row = pending.pop();
    if (!row) break;
    if (
      row.depth > limit ||
      seen.has(row.space.room_id) ||
      depths.get(row.space.room_id) !== row.depth
    )
      continue;
    seen.add(row.space.room_id);
    rows.push(row);
    for (const edge of row.space.space_children.slice().reverse()) {
      const child = byId.get(edge.room_id);
      if (child) pending.push({ space: child, depth: row.depth + 1 });
    }
  }
  return rows;
}
