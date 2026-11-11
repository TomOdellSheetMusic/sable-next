// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import { SvelteMap } from 'svelte/reactivity';
import { tick } from 'svelte';
import type { RoomListItemView } from '#src/generated/protocol';
import type { PresenceEntry } from '#lib/rooms/presence.svelte.js';
import { withCounts } from '#lib/rooms/summary-fixtures.js';
import HomeDashboard from './HomeDashboard.svelte';

const fixture = vi.hoisted(() => ({
  rooms: [] as RoomListItemView[],
  presence: null as SvelteMap<string, PresenceEntry> | null,
  call: { active: false, roomId: null as string | null },
}));
vi.mock('#lib/core/context.js');
vi.mock('#lib/rooms/room-list.svelte.js', async (original) => ({
  ...(await original<object>()),
  useRoomList: () => ({
    get rooms() {
      return fixture.rooms;
    },
  }),
}));
vi.mock('#lib/rooms/presence.svelte.js', () => ({
  usePresenceStore: () => ({ get: (id: string) => fixture.presence?.get(id) ?? null }),
}));
vi.mock('#lib/features/call/call-session.svelte.js', () => ({
  useCallSession: () => fixture.call,
}));

function room(
  id: string,
  name: string,
  overrides: Partial<RoomListItemView> = {}
): RoomListItemView {
  return withCounts({
    room_id: id,
    name,
    canonical_alias: null,
    topic: null,
    topic_html: null,
    avatar_url: null,
    is_direct: true,
    direct_targets: [`@${name.toLowerCase()}:example.org`],
    join_rule: 'invite',
    tags: [],
    state: 'joined',
    encrypted: true,
    is_tombstoned: false,
    room_kind: null,
    call_participants: [],
    screen_sharers: [],
    supports_knock: false,
    supports_restricted: false,
    supports_knock_restricted: false,
    space_children: [],
    bridge: null,
    unread: 0,
    notifying: 0,
    highlight: 0,
    marked_unread: false,
    latest_event: null,
    ...overrides,
  });
}
const online: PresenceEntry = {
  presence: 'online',
  statusMessage: 'Available to chat',
  lastActiveAgo: 0,
  receivedAt: 0,
};
beforeEach(() => {
  fixture.rooms = [
    room('!alice:example.org', 'Alice'),
    room('!bob:example.org', 'Bob'),
    room('!unknown:example.org', 'Unknown'),
  ];
  fixture.presence = new SvelteMap([
    ['@alice:example.org', online],
    ['@bob:example.org', { ...online, presence: 'offline' }],
  ]);
  fixture.call = { active: false, roomId: null };
});

test('defaults to online contacts, includes unknown presence in All and searches by name or Matrix ID', async () => {
  render(HomeDashboard);
  expect(screen.getByRole('button', { name: 'Online 1' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: /Alice/ })).toHaveAttribute(
    'href',
    '/direct/!alice%3Aexample.org'
  );
  expect(screen.queryByRole('link', { name: /Bob/ })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'All 3' }));
  expect(screen.getByRole('link', { name: /Unknown/ })).toBeInTheDocument();
  await fireEvent.input(screen.getByRole('searchbox'), { target: { value: '@bob:example.org' } });
  expect(screen.getByRole('link', { name: /Bob/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Alice/ })).not.toBeInTheDocument();
});

test('updates the online filter when presence changes', async () => {
  render(HomeDashboard);
  fixture.presence?.set('@bob:example.org', online);
  await tick();
  expect(screen.getByRole('link', { name: /Bob/ })).toBeInTheDocument();
  fixture.presence?.set('@alice:example.org', { ...online, presence: 'unavailable' });
  await tick();
  expect(screen.queryByRole('link', { name: /Alice/ })).not.toBeInTheDocument();
});

test('shows ongoing calls and Explore without duplicating joined spaces', () => {
  fixture.rooms.push(
    room('!voice:example.org', 'Lounge', {
      is_direct: false,
      room_kind: 'voice',
      call_participants: ['@bob:example.org'],
    }),
    room('!current:example.org', 'Current', { is_direct: false }),
    room('!space:example.org', 'Community', { is_direct: false, room_kind: 'space' }),
    room('!left:example.org', 'Left room', {
      state: 'left',
      call_participants: ['@bob:example.org'],
    }),
    room('!old:example.org', 'Old contact', { is_tombstoned: true })
  );
  fixture.call = { active: true, roomId: '!current:example.org' };
  render(HomeDashboard);
  const calls = screen.getByRole('region', { name: 'Ongoing calls' });
  expect(within(calls).getByRole('link', { name: /Lounge/ })).toHaveAttribute(
    'href',
    '/rooms/!voice%3Aexample.org'
  );
  const voiceCard = within(calls).getByRole('link', { name: /Lounge/ });
  expect(voiceCard.querySelector('.call-room-icon .room-icon-root')).not.toBeNull();
  expect(voiceCard.querySelector('.call-room-icon .room-icon-badge.lock')).not.toBeNull();
  expect(within(voiceCard).getByRole('list')).toBeInTheDocument();
  expect(within(calls).getByRole('link', { name: /Return to call/ })).toBeInTheDocument();
  expect(screen.queryByText('Left room')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Community/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Your spaces' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Explore spaces' })).toHaveAttribute('href', '/explore');
});

test('offers all contacts when presence is unavailable', async () => {
  fixture.presence?.clear();
  render(HomeDashboard);
  expect(screen.getByText('No one is online right now')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Show all contacts' }));
  expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument();
});
