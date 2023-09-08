<script>
	export let p, color = "gray", zoom = 1, moving = false, onMove = null, shape = "aim";

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

			let movementX = (e.movementX)/width/zoom;
			let movementY = (e.movementY)/height/zoom;

			if(onMove) {
				p = onMove(p, movementX, movementY)
			} else {
				p[0] += movementX;
				p[1] += movementY;
			}
		}
	}

	function onMouseUp() {
		isMoving = false;
		moving = false;
	}
</script>

<span class={"dot shape-"+(shape)}
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

	.shape-square {
		--size: 10px;
	}

	.dot {
		display: inline-block;
		overflow: visible;
		color: white;
		height: var(--size);
		width: var(--size);
		margin-left: calc(-1 * var(--size) / 2);
		margin-top: calc(-1 * var(--size) / 2);

		position: absolute;

		background: rgba(255,255,255,0.1);
		user-select: none;
		cursor: move;
		opacity: 0.7;
	}


	.dot.shape-aim {
		border: solid 2px;
		box-shadow: 0px 0px 1px 1px rgba(255,255,255,0.5), inset 0px 0px 1px 1px rgba(0,0,0,0.5);
		border-radius: 50%;
	}
	.dot.shape-square {
		border: solid 1px;
		box-shadow: 0px 0px 1px 1px rgba(255,255,255,0.5), inset 0px 0px 1px 1px rgba(0,0,0,0.5);
	}

	.dot:hover {
		opacity: 1;
	}
	.dot.moving {
		opacity: 1;
		background: none;
	}

	.x {
		position: absolute;
		/*border-left: solid 4px white;*/
		background: white;
		display: block;
		/*opacity: 0.5;*/
		/*height: calc(var(--size) - 2px);*/
		height: 1px;
		width: 1px;
		top: 50%;
		margin-top: -0.5px;
		left: 50%;
		margin-left: -0.5px;
	}
	/*.shape-aim .y {*/
	/*	position: absolute;*/
	/*	height: 1px;*/
	/*	width: 1px;*/
	/*	opacity: 0.5;*/
	/*	top: calc(50% - 2.5px);*/
	/*	left: 0;*/
	/*}*/
</style>
