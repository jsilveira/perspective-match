<script>
  import Icon from "$lib/components/common/Icon.svelte";

  /** @type {string | null} */
  export let icon = null;
</script>

<span role="button" tabindex="" class="btn btn-sm btn-primary text-nowrap" {...$$restProps} on:click on:focus on:hover>
    {#if icon}<Icon {icon} class="align-middle me-1"/>{/if}<span class="align-middle"><slot/></span>
</span>
