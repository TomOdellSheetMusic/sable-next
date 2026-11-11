<script lang="ts">
  import { i18n } from '#lib/i18n.js';
  import { fittingPillCount } from '#lib/personas/pronouns.js';
  import type { PeerProfiles } from '#lib/features/sidebar/peer-profiles.svelte.js';
  import Avatar from '#lib/ui/primitives/Avatar.svelte';
  import { whenVisible } from '#lib/ui/when-visible.js';

  let {
    userIds,
    profiles,
  }: {
    userIds: readonly string[];
    profiles: Pick<PeerProfiles, 'get' | 'request'>;
  } = $props();

  let container = $state<HTMLElement>();
  let sizer = $state<HTMLElement>();
  let probe = $state<HTMLElement>();
  let fitted = $state(0);
  let participants = $derived(
    userIds.map((id) => ({
      id,
      name: profiles.get(id)?.display_name || id,
      avatar: profiles.get(id)?.avatar_url ?? null,
    }))
  );
  let shown = $derived(participants.slice(0, fitted));
  let hidden = $derived(participants.slice(fitted));

  function measure() {
    if (!container || !sizer || !probe) return;
    fitted = fittingPillCount(
      Array.from(sizer.children, (child) => child.getBoundingClientRect().width),
      probe.getBoundingClientRect().width,
      Number.parseFloat(getComputedStyle(sizer).columnGap) || 0,
      container.getBoundingClientRect().width
    );
  }

  $effect(() => {
    if (!container || !sizer || !probe) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(sizer);
    observer.observe(probe);
    return () => observer.disconnect();
  });
</script>

{#if participants.length > 0}
  <div class="call-participants" bind:this={container}>
    <div class="participant-sizer" aria-hidden="true" bind:this={sizer}>
      {#each participants as participant (participant.id)}
        <span class="participant-chip"
          ><span class="participant-avatar"></span><span class="participant-name"
            >{participant.name}</span
          ></span
        >
      {/each}
    </div>
    <span class="participant-more participant-probe" aria-hidden="true" bind:this={probe}
      >+{participants.length}</span
    >
    <ul
      class="participant-row"
      aria-label={i18n.t('call.participants', { count: participants.length })}
    >
      {#each shown as participant (participant.id)}
        <li
          class="participant-chip"
          title={participant.name}
          {@attach whenVisible(() => profiles.request(participant.id))}
        >
          <span class="participant-avatar"
            ><Avatar
              src={participant.avatar}
              name={participant.name}
              id={participant.id}
              size="tiny"
            /></span
          >
          <span class="participant-name">{participant.name}</span>
        </li>
      {/each}
      {#if hidden.length > 0}
        <li
          class="participant-more"
          title={hidden.map((participant) => participant.name).join(', ')}
          aria-label={i18n.t('home.moreParticipants', { count: hidden.length })}
        >
          +{hidden.length}
        </li>
      {/if}
    </ul>
  </div>
{/if}

<style>
  .call-participants {
    display: grid;
    min-width: 0;
    overflow: hidden;
    position: relative;
  }

  .participant-sizer,
  .participant-row {
    align-items: center;
    display: flex;
    gap: var(--space-100);
    min-width: 0;
  }

  .participant-sizer {
    pointer-events: none;
    position: absolute;
    visibility: hidden;
    width: max-content;
  }

  .participant-row {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .participant-chip {
    align-items: center;
    display: inline-flex;
    flex: none;
    gap: var(--space-100);
    max-width: 8rem;
    min-width: 0;
  }

  .participant-avatar {
    display: inline-flex;
    flex: 0 0 var(--avatar-size-100);
    height: var(--avatar-size-100);
    width: var(--avatar-size-100);
  }

  .participant-name {
    color: var(--surface-var-on-container);
    font-size: var(--font-size-small);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .participant-more {
    background: var(--surface-container-active);
    border-radius: var(--radius);
    color: var(--surface-var-on-container);
    flex: none;
    font-size: var(--font-size-small);
    padding: var(--space-050) var(--space-100);
    white-space: nowrap;
  }

  .participant-probe {
    pointer-events: none;
    position: absolute;
    visibility: hidden;
  }
</style>
