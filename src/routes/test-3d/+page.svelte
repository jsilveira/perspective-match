<script>
    import { onMount } from "svelte";
    import * as THREE from "three";

    let container;
    let scene, camera, renderer;
    let customQuad;

    let topleft = [50, 50, 0];
    let topright = [400, 200, 0];
    let bottomleft = [50, 500, 0];
    let bottomright = [300, 400, 0];

    function intersection(p1, p2, p3, p4) {
        const x1 = p1[0];
        const y1 = p1[1];
        const x2 = p2[0];
        const y2 = p2[1];
        const x3 = p3[0];
        const y3 = p3[1];
        const x4 = p4[0];
        const y4 = p4[1];

        const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
            ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
        const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
            ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));

        return [x, y, 0];
    }

    // Points of the quadrilateral
    const vertices = new Float32Array([
        ...topleft,
        ...topright,
        ...bottomleft,
        ...bottomright,
        ... intersection(topleft, bottomright, topright, bottomleft),
    ]);

    let uvs = new Float32Array([
        0.0, 0.0, 
        1.0, 0.0, 
        0.0, 1.0, 
        1.0, 1.0,
        0.5, 0.5
    ]);

    onMount(() => {
        init();
        animate();
        window.addEventListener("resize", onResize);
    });

    function init() {
        // Set up the scene
        scene = new THREE.Scene();

        // Set up the camera
        // Set up the Orthographic camera
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 1000; // Adjust this value based on the size of your scene
        const frustumHalfWidth = (frustumSize * aspect) / 2;
        const frustumHalfHeight = frustumSize / 2;

        camera = new THREE.OrthographicCamera(
            0,
            frustumHalfWidth,
            frustumHalfHeight,
            0,
            0.1,
            1000,
        );
        camera.position.z = 5;
        console.log("camera", camera.toJSON());

        // Set up the renderer
        renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        // Define the geometry based on the provided points
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex([0, 1, 4, 4, 2, 0, 4, 3, 2, 4, 1,3]); // define two triangles (quad)
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(vertices, 3),
        );
        //geometry.computeVertexNormals();

        // Load the texture
        const texture = new THREE.TextureLoader().load(
            "https://perspective-match.vercel.app/tire-pressure-label-sample.jpg",
        );
        // Create the material with the texture
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const simpleMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        // Create the mesh and add it to the scene
        customQuad = new THREE.Mesh(geometry, material);
        scene.add(customQuad);

        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(100, 100, 100),
            material,
        );
        //scene.add( cube );
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    // Resize handler to maintain aspect ratio
    function onResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
</script>

<div bind:this={container}></div>

<style>
    /* Ensure the canvas fills the window */
    :global(body),
    div {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: gray;
    }
</style>
