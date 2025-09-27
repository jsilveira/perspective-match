<script>
  let { icon, class: clazz = '', ...restProps } = $props();
</script>

<i class={`bi bi-${icon} ${clazz}`} {...restProps}></i>
