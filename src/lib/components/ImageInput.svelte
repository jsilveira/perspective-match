<script>
  import { onMount } from 'svelte';

  export let onImageChange;
  export let target;
  export let paste = true;

  let imgSrc = '';
  let draggingOver = false;

  function processImageFile(file) {
    if (file && file.type.startsWith('image/')) {
      imgSrc = window.URL.createObjectURL(file);
      onImageChange(imgSrc);
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
    console.log("drag enter", e.target)
    draggingOver = true;
  }

  function onDragLeave(e) {
    console.log("drag leave", e.target)
    draggingOver = false;
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

<div class:draggingOver={draggingOver} bind:this={thisElement}></div>

<style>
  div {
      background: red;
      position: fixed;
      height: 1px;
      width:1px;
      /*display: none;*/
  }

  div.draggingOver {
      display: block;
      width: 100%;
      height: 100%;
      position: fixed;
      z-index: 9999;
      background: green;
      opacity: 0.2;
      /*pointer-events: none;*/
  }
</style>
