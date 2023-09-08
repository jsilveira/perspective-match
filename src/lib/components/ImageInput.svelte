<script>
  import { onMount } from 'svelte';

  export let onImageChange;

  let imgSrc = '';
  let pasteArea;

  function onPaste(e) {
    if (e.clipboardData) {
      let items = e.clipboardData.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          let blob = items[i].getAsFile();
          imgSrc = window.URL.createObjectURL(blob);
          onImageChange(imgSrc);
          break;
        }
      }
    }
  }

  onMount(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
</script>
