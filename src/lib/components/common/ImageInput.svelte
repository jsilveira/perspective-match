<script>
  import { onMount } from 'svelte';

  /** @type string */
  export let src;
  /** @type { null | HTMLElement} */
  export let target = null;
  export let paste = true;

  // use a counter, because the children of the container element can fire the event causing enter/leave on different order
  let draggingOver = 0;

  function processImageFile(file) {
    if (file && file.type.startsWith('image/')) {
      src = window.URL.createObjectURL(file);
    }
  }

  function onPaste(e) {
    if (e.clipboardData) {
      const items = e.clipboardData.items;
      if (items) {
        for (const item of items) {
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            processImageFile(blob);
            break;
          }
        }
      }
    }
  }

  function onDrop(e) {
    draggingOver = 0;
    e.preventDefault();
    if (e.dataTransfer.items) {
      for (const item of e.dataTransfer.items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          processImageFile(file);
          break;
        }
      }
    }
  }

  const hasImage = (e) => e.dataTransfer.items[0].type.includes('image')

  function onDragOver(e) {
    e.preventDefault();
  }

  function onDragEnter(e) {
    draggingOver++;
    // console.log("drag enter", draggingOver)
    e.stopImmediatePropagation()
    e.preventDefault();
  }

  function onDragLeave(e) {
    draggingOver--;
    // console.log("drag leave", draggingOver)
    e.stopImmediatePropagation()
    e.preventDefault();
  }
  let thisElement;

  onMount(() => {
    target = target || thisElement.parentElement;

    if(paste) {
      window.addEventListener('paste', onPaste);
    }


    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragenter', onDragEnter);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);

      target.removeEventListener('dragover', onDragOver);
      target.removeEventListener('dragenter', onDragEnter);
      target.removeEventListener('dragleave', onDragLeave);
      target.removeEventListener('drop', onDrop);
    };
  });
</script>

<!--<svelte:body on:dragover={onDragOver} on:drop={onDrop}/>-->

<!--<svelte:body on:dragover={onGlobalDragEnter}/>-->

<div class:draggingOver={draggingOver} bind:this={thisElement}>
</div>

{#if !src}
  <slot>
    Drag or paste an image file here
  </slot>
{/if}

<style>
  div {
      background: red;
      position: fixed;
      /*width: 100%;*/
      /*height: 100%;*/
      height: 1px;
      width:1px;
      display: none;
  }

  div.draggingOver {
      display: block;
      width: 100%;
      height: 100%;
      position: absolute;
      background: green;
      opacity: 0.2;
      pointer-events: none;
  }
</style>
