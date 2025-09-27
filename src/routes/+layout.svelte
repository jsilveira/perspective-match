<script>
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(body) {
      font-family: "Roboto", sans-serif;
  }
</style>
