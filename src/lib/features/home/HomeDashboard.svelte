<script lang="ts">
  import { resolve } from '$app/paths';
  import ChatCircleDotsIcon from 'phosphor-svelte/lib/ChatCircleDotsIcon';
  import CompassIcon from 'phosphor-svelte/lib/CompassIcon';
  import UsersIcon from 'phosphor-svelte/lib/UsersIcon';
  import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
  import { hasPageMeta, usePageMeta } from '#lib/core/page-meta.js';
  import { useCoreClient } from '#lib/core/context.js';
  import { useCallSession } from '#lib/features/call/call-session.svelte.js';
  import { i18n } from '#lib/i18n.js';
  import { roomSectionPath } from '#lib/rooms/permalink.js';
  import { usePresenceStore } from '#lib/rooms/presence.svelte.js';
  import { useRoomList } from '#lib/rooms/room-list.svelte.js';
  import Avatar from '#lib/ui/primitives/Avatar.svelte';
  import LinkButton from '#lib/ui/primitives/LinkButton.svelte';
  import PageTitle from '#lib/ui/primitives/PageTitle.svelte';
  import PresenceDot from '#lib/ui/primitives/PresenceDot.svelte';
  import RoomIcon from '#lib/ui/primitives/RoomIcon.svelte';
  import { PeerProfiles } from '#lib/features/sidebar/peer-profiles.svelte.js';
  import { claimedRoomIds } from '#lib/features/sidebar/nav-rooms.js';
  import HomeCallParticipants from './HomeCallParticipants.svelte';
  import SettingsChangesCard from './SettingsChangesCard.svelte';

  const pageMeta = hasPageMeta() ? usePageMeta() : null;
  $effect(() => {
    if (pageMeta) pageMeta.title = i18n.t('nav.home');
  });

  const core = useCoreClient();
  const roomList = useRoomList();
  const profiles = new PeerProfiles(core);
  const presence = usePresenceStore();
  const call = useCallSession();
  let filter = $state<'online' | 'all'>('online');
  let search = $state('');
  let joinedRooms = $derived(
    roomList.rooms.filter((room) => room.state === 'joined' && !room.is_tombstoned)
  );
  let spacedRoomIds = $derived(claimedRoomIds(joinedRooms));
  let contacts = $derived(
    joinedRooms
      .filter((room) => room.is_direct && room.room_kind !== 'space')
      .map((room) => {
        const peers = room.direct_targets.filter((id) => id !== core.session?.user_id);
        const peer = peers.length === 1 ? peers[0] : null;
        return { room, peer, presence: peer ? presence.get(peer) : null };
      })
  );
  let onlineCount = $derived(
    contacts.filter((contact) => contact.presence?.presence === 'online').length
  );
  let visible = $derived(
    contacts.filter(
      (contact) =>
        (filter === 'all' || contact.presence?.presence === 'online') &&
        `${contact.room.display_name} ${contact.peer ?? ''}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase())
    )
  );
  let calls = $derived(
    joinedRooms.filter(
      (room) =>
        room.room_kind !== 'space' &&
        (room.call_participants.length > 0 || (call.active && call.roomId === room.room_id))
    )
  );
</script>

<PageTitle title={i18n.t('nav.home')} />
<main class="home-dashboard">
  <header class="page-header">
    <div>
      <p class="eyebrow">{i18n.t('nav.home')}</p>
      <h1>{i18n.t('home.yourPeople')}</h1>
      <p class="description">{i18n.t('home.peopleDescription')}</p>
    </div>
    <LinkButton href={resolve('direct')} variant="primary"
      ><ChatCircleDotsIcon aria-hidden="true" />{i18n.t('home.newMessage')}</LinkButton
    >
  </header>

  <SettingsChangesCard />

  <div class="dashboard-grid">
    <section class="contacts" aria-labelledby="contacts-heading">
      <div class="section-heading">
        <h2 id="contacts-heading"><UsersIcon aria-hidden="true" />{i18n.t('home.contacts')}</h2>
        <span class="total">{contacts.length}</span>
      </div>
      <div class="contact-tools">
        <div class="filters" role="group" aria-label={i18n.t('home.filterContacts')}>
          <button
            type="button"
            aria-pressed={filter === 'online'}
            onclick={() => (filter = 'online')}
            >{i18n.t('presence.online')} <span>{onlineCount}</span></button
          >
          <button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}
            >{i18n.t('home.allContacts')} <span>{contacts.length}</span></button
          >
        </div>
        <input
          type="search"
          bind:value={search}
          aria-label={i18n.t('home.searchContacts')}
          placeholder={i18n.t('home.searchContacts')}
        />
      </div>
      <ul class="contact-list">
        {#each visible as contact (contact.room.room_id)}
          <li>
            <!-- eslint-disable svelte/no-navigation-without-resolve -- roomSectionPath resolves routes -->
            <a class="contact-row" href={roomSectionPath(roomList.rooms, contact.room.room_id)}>
              <div class="contact-avatar">
                <Avatar
                  src={contact.room.display_avatar_url}
                  name={contact.room.display_name}
                  id={contact.peer ?? contact.room.room_id}
                />
                {#if contact.presence}<PresenceDot
                    presence={contact.presence.presence}
                    label={i18n.t(`presence.${contact.presence.presence}`)}
                  />{/if}
              </div>
              <div class="contact-info">
                <strong>{contact.room.display_name}</strong>
                <span
                  >{contact.presence?.statusMessage ||
                    (contact.presence
                      ? i18n.t(`presence.${contact.presence.presence}`)
                      : (contact.peer ?? i18n.t('home.groupConversation')))}</span
                >
              </div>
              <ChatCircleDotsIcon class="message-icon" aria-hidden="true" />
            </a>
          </li>
        {:else}
          <li class="empty-state">
            <UsersIcon size={32} aria-hidden="true" />
            <h3>
              {i18n.t(
                search.trim()
                  ? 'home.noMatchingContacts'
                  : filter === 'online'
                    ? 'home.noOnlineContacts'
                    : 'home.noContacts'
              )}
            </h3>
            <p>
              {i18n.t(
                filter === 'online' && !search.trim() ? 'home.onlineHint' : 'home.contactsHint'
              )}
            </p>
            {#if filter === 'online'}<button
                type="button"
                class="text-button"
                onclick={() => (filter = 'all')}>{i18n.t('home.showAllContacts')}</button
              >{/if}
          </li>
        {/each}
      </ul>
    </section>

    <aside class="activity">
      <section class="activity-section" aria-labelledby="calls-heading">
        <div class="section-heading">
          <h2 id="calls-heading">
            <SpeakerHighIcon aria-hidden="true" />{i18n.t('home.ongoingCalls')}
          </h2>
          <span class="total">{calls.length}</span>
        </div>
        {#each calls as room (room.room_id)}
          <!-- eslint-disable svelte/no-navigation-without-resolve -- roomSectionPath resolves routes -->
          <a class="activity-card call-card" href={roomSectionPath(roomList.rooms, room.room_id)}>
            <div class="call-summary">
              {#if room.room_kind === 'voice'}
                <span class="call-room-icon" aria-hidden="true"
                  ><RoomIcon
                    roomKind="voice"
                    hasParent={spacedRoomIds.has(room.room_id)}
                    joinRule={room.join_rule}
                  /></span
                >
              {:else}
                <Avatar src={room.display_avatar_url} name={room.display_name} id={room.room_id} />
              {/if}
              <div class="contact-info">
                <strong>{room.display_name}</strong><span
                  >{i18n.t('call.participants', { count: room.call_participants.length })}</span
                ><span class="call-action"
                  >{i18n.t(
                    call.active && call.roomId === room.room_id
                      ? 'home.returnToCall'
                      : 'home.openCall'
                  )}</span
                >
              </div>
            </div>
            <HomeCallParticipants userIds={room.call_participants} {profiles} />
          </a>
        {:else}
          <p class="quiet-state">{i18n.t('home.noOngoingCalls')}</p>
        {/each}
      </section>
      <LinkButton href={resolve('explore')} variant="secondary"
        ><CompassIcon aria-hidden="true" />{i18n.t('home.exploreSpaces')}</LinkButton
      >
    </aside>
  </div>
</main>

<style>
  .home-dashboard {
    box-sizing: border-box;
    min-height: 100%;
    overflow: auto;
    padding: var(--page-gutter);
    width: 100%;
  }

  .page-header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-400);
    justify-content: space-between;
    margin-bottom: var(--space-600);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: var(--font-size-heading);
  }

  .eyebrow {
    color: var(--surface-var-on-container);
    font-size: var(--font-size-small);
    margin-bottom: var(--space-100);
  }

  .description {
    color: var(--surface-var-on-container);
    margin-top: var(--space-200);
  }

  .dashboard-grid {
    display: grid;
    gap: var(--space-600);
    grid-template-columns: minmax(0, 1fr);
  }

  .contacts,
  .activity,
  .contact-info {
    min-width: 0;
  }

  .section-heading {
    align-items: center;
    display: flex;
    gap: var(--space-200);
    margin-bottom: var(--space-300);
  }

  h2 {
    align-items: center;
    display: flex;
    font-size: var(--font-size-body);
    gap: var(--space-200);
  }

  h2 :global(svg) {
    height: var(--icon-size-medium);
    width: var(--icon-size-medium);
  }

  .total {
    color: var(--surface-var-on-container);
    font-size: var(--font-size-small);
  }

  .contact-tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-300);
    justify-content: space-between;
    padding-bottom: var(--space-300);
  }

  .filters {
    display: flex;
    gap: var(--space-100);
  }

  button,
  input {
    font: inherit;
  }

  .filters button,
  .text-button {
    background: transparent;
    border: 0;
    border-radius: var(--radius);
    color: inherit;
    cursor: pointer;
    padding: var(--space-200) var(--space-300);
  }

  .filters button[aria-pressed='true'] {
    background: var(--surface-container-active);
    color: var(--primary-main);
  }

  .filters span {
    font-size: var(--font-size-small);
    margin-inline-start: var(--space-100);
  }

  input {
    background: var(--surface-container);
    border: var(--border-width) solid var(--surface-container-line);
    border-radius: var(--radius);
    color: inherit;
    min-width: 0;
    padding: var(--space-200) var(--space-300);
    width: min(100%, 16rem);
  }

  .contact-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .contact-row {
    align-items: center;
    border-top: var(--border-width) solid var(--surface-container-line);
    display: flex;
    gap: var(--space-300);
    padding: var(--space-300) var(--space-200);
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .contact-avatar {
    flex-shrink: 0;
    position: relative;
  }

  .contact-avatar :global(.presence-dot) {
    bottom: 0;
    position: absolute;
    right: 0;
  }

  .contact-info {
    display: grid;
    flex: 1;
    gap: var(--space-050);
  }

  .contact-info strong,
  .contact-info span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contact-info span {
    color: var(--surface-var-on-container);
    font-size: var(--font-size-small);
  }

  .contact-row :global(.message-icon) {
    color: var(--surface-var-on-container);
    flex-shrink: 0;
    height: var(--icon-size-medium);
    width: var(--icon-size-medium);
  }

  .activity {
    align-content: start;
    display: grid;
    gap: var(--space-500);
  }

  .activity-section {
    background: var(--surface-container);
    border: var(--border-width) solid var(--surface-container-line);
    border-radius: var(--radius);
    padding: var(--space-400);
  }

  .activity-card {
    align-items: center;
    border-radius: var(--radius);
    display: flex;
    gap: var(--space-300);
    margin-bottom: var(--space-200);
    padding: var(--space-200);
  }

  .call-card {
    display: grid;
  }

  .call-summary {
    align-items: center;
    display: flex;
    gap: var(--space-300);
    min-width: 0;
  }

  .call-room-icon {
    align-items: center;
    display: flex;
    flex: 0 0 var(--avatar-size-400);
    height: var(--avatar-size-400);
    justify-content: center;
  }

  .call-room-icon :global(svg) {
    height: var(--icon-size-medium);
    width: var(--icon-size-medium);
  }

  .call-card .call-action {
    color: var(--success-main);
    font-weight: var(--font-weight-bold);
  }

  .quiet-state {
    color: var(--surface-var-on-container);
    font-size: var(--font-size-small);
    line-height: 1.5;
    margin-bottom: var(--space-300);
  }

  .empty-state {
    align-items: center;
    border-top: var(--border-width) solid var(--surface-container-line);
    color: var(--surface-var-on-container);
    display: flex;
    flex-direction: column;
    gap: var(--space-300);
    padding: var(--space-700) var(--space-300);
    text-align: center;
  }

  .empty-state h3 {
    color: var(--surface-on-container);
    font-size: var(--font-size-body);
  }

  .text-button {
    color: var(--primary-main);
  }

  .contact-row:hover,
  .activity-card:hover,
  .filters button:hover,
  .text-button:hover {
    background: var(--surface-container-hover);
  }

  @media (width >= 70rem) {
    .dashboard-grid {
      grid-template-columns: minmax(0, 1fr) 19rem;
    }
  }
</style>
