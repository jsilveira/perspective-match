<script>
  import Icon from "$lib/components/Icon.svelte";

  /** @type {string | null} */
  export let icon = null;
</script>

<span role="button" tabindex="" class="btn btn-sm btn-primary text-nowrap" {...$$restProps} on:click on:focus on:hover>
    {#if icon}<Icon {icon}/> {/if}<slot/>
</span>
