<script>
	export let p, color = "gray", zoom = 1, moving = false;

    let element;
	let isMoving = false;

	function onMouseDown(e) {
		isMoving = true;
		if(e.shiftKey) {
			moving = p;
		}
	}

	function onMouseMove(e) {
		if (isMoving) {
            // As a percentage of the parent
            let {width, height} = element.parentElement.getBoundingClientRect();
			p[0] += (e.movementX)/width/zoom;
			p[1] += (e.movementY)/height/zoom;
		}
	}

	function onMouseUp() {
		isMoving = false;
		moving = false;
	}
</script>

<span class="dot"
			style:left={100*p[0]+'%'}
			style:top={100*p[1]+'%'}
			class:moving={isMoving}
            bind:this={element}
			on:mousedown={onMouseDown}
			 style:border-color={color}
			>
	<span class="x"></span>
	<span class="y"></span>
</span>

<svelte:window on:mouseup={onMouseUp} on:mousemove={onMouseMove} />

<style>
	:root {
		--size: 30px;
	}
	.dot {
		display: inline-block;
		overflow: visible;
		color: white;
		height: var(--size);
		width: var(--size);
		margin-left: calc(-1 * var(--size) / 2);
		margin-top: calc(-1 * var(--size) / 2);
		border-radius: 50%;
		position: absolute;
		border: solid 2px;
		box-shadow: 0px 0px 1px 1px rgba(255,255,255,0.5), inset 0px 0px 1px 1px rgba(0,0,0,0.5);

		background: rgba(255,255,255,0.1);
		user-select: none;
		cursor: move;
	}
	.dot.moving {
	}
	.x {
		position: absolute;
		border-left: solid 1px white;
		opacity: 0.5;
		height: calc(var(--size) - 2px);
		top: 0px;
		left: calc(50% - 0px);
	}
	.y {
		position: absolute;
		border-top: solid 1px white;
		opacity: 0.5;
		width: calc(var(--size) - 2px);
		top: calc(50% - 0px);
		left: 0;
	}
</style>
