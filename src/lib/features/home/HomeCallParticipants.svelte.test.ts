// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { ProfileView } from '#src/generated/protocol';
import HomeCallParticipants from './HomeCallParticipants.svelte';

vi.mock('#lib/core/context.js');

let available = 170;
const callbacks = new Set<() => void>();
const names = new SvelteMap<string, ProfileView>();
const profiles = { get: (id: string) => names.get(id), request: vi.fn() };
const ids = ['@alice:example.org', '@bob:example.org', '@carol:example.org', '@dave:example.org'];

beforeEach(() => {
  available = 170;
  callbacks.clear();
  names.clear();
  profiles.request.mockClear();
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {
        callbacks.add(callback);
      }
      observe() {}
      disconnect() {
        callbacks.delete(this.callback);
      }
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const width = this.classList.contains('call-participants')
      ? available
      : this.classList.contains('participant-chip')
        ? 70
        : 24;
    return { width } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function resize(width: number) {
  available = width;
  for (const callback of [...callbacks]) callback();
  await tick();
}

test('fits participant previews, reserves overflow space and updates on resize', async () => {
  render(HomeCallParticipants, { userIds: ids, profiles });
  await tick();
  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(within(list).getByText(ids[0])).toBeInTheDocument();
  expect(within(list).getByText(ids[1])).toBeInTheDocument();
  expect(within(list).queryByText(ids[2])).not.toBeInTheDocument();
  expect(within(list).getByLabelText('2 more participants')).toHaveTextContent('+2');
  expect(within(list).getByLabelText('2 more participants')).toHaveAttribute(
    'title',
    `${ids[2]}, ${ids[3]}`
  );

  await resize(280);
  expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  expect(within(list).getByText(ids[3])).toBeInTheDocument();
  expect(within(list).queryByText(/^\+/)).not.toBeInTheDocument();

  await resize(40);
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByLabelText('4 more participants')).toHaveTextContent('+4');
});

test('uses loaded profile names and updates when participants leave', async () => {
  const view = render(HomeCallParticipants, { userIds: ids, profiles });
  await tick();
  names.set(ids[0], {
    user_id: ids[0],
    display_name: 'Alice',
    avatar_url: null,
    real_name: null,
    real_avatar_url: null,
    bio: null,
    hero_color: null,
    hero_brightness: null,
    banner_url: null,
    status: null,
    pronouns: [],
    timezone: null,
    name_color_light: null,
    name_color_dark: null,
    animal: null,
    extra: [],
    supporter_awards: null,
    legacy_fields: [],
  });
  await tick();
  expect(within(screen.getByRole('list')).getByText('Alice')).toBeInTheDocument();
  expect(profiles.request).toHaveBeenCalledWith(ids[0]);

  await view.rerender({ userIds: [ids[0]], profiles });
  await resize(170);
  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Alice')).toBeInTheDocument();
  expect(within(list).queryByText(/^\+/)).not.toBeInTheDocument();
});

test('omits the participant row when the call is empty', () => {
  render(HomeCallParticipants, { userIds: [], profiles });
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
