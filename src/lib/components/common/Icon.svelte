<script>
  export let icon
  let clazz = '';
  export {clazz as class}
</script>

<i class={`bi bi-${icon} ${clazz}`} {... $$restProps}></i>
