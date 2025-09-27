<script>
  import Icon from "$lib/components/common/Icon.svelte";

  let { icon = null, children, ...restProps } = $props();
</script>

<span role="button" tabindex="" class="btn btn-sm btn-primary text-nowrap" {...restProps}>
    {#if icon}<Icon {icon} class="align-middle me-1"/>{/if}<span class="align-middle">{@render children()}</span>
</span>
