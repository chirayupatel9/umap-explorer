import React, { Component } from 'react'
import * as THREE from 'three'
import * as _ from 'lodash'
import * as d3 from 'd3'
import * as TWEEN from '@tweenjs/tween.js'
import zoom from './zoom.png'
import reset from './reset.png'
import lassoIcon from './lasso.png'
//import { moveMessagePortToContext } from 'worker_threads'
import { tsne } from 'tsne-js';

// Constants for sprite sheets
let sprite_side = 73
let sprite_size = sprite_side * sprite_side
let sprite_number = 14
let sprite_image_size = 28
// actual sprite size needs to be power of 2
let sprite_actual_size = 2048

let mnist_tile_string = 'mnist_tile_solid_'
let mnist_tile_locations = [...Array(sprite_number)].map(
  (n, i) => `${process.env.PUBLIC_URL}/${mnist_tile_string}${i}.png`
)

let mnist_images = mnist_tile_locations.map(src => {
  let img = document.createElement('img')
  img.src = src
  return img
})
let zoomScaler = input => {
  let scale1 = d3
    .scaleLinear()
    .domain([20, 5])
    .range([14, 28])
    .clamp(true)
  let scale2 = d3
    .scaleLinear()
    .domain([2, 0.1])
    .range([28, 56])
  if (input >= 5) {
    return scale1(input)
    // return 28
  } else if (input <= 2) {
    // return scale2(input)
    return 28
  } else {
    return 28
  }
}

class Projection extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isZoomEnabled: true,
      isLassoActive: false,
      lassoPoints: [], //this stores points drawn by lasso
      isPolygonDrawn: false,
    }
    this.init = this.init.bind(this)
    this.addPoints = this.addPoints.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.setUpCamera = this.setUpCamera.bind(this)
    this.animate = this.animate.bind(this)
    this.getScaleFromZ = this.getScaleFromZ.bind(this)
    this.getZFromScale = this.getZFromScale.bind(this)
    this.changeEmbeddings = this.changeEmbeddings.bind(this)
    this.zoomHandler = this.zoomHandler.bind(this);
    this.toggleZoom = this.toggleZoom.bind(this);
    this.toggleLasso = this.toggleLasso.bind(this);  // Bind toggleLasso here
    this.enableLasso = this.enableLasso.bind(this);
    this.disableLasso = this.disableLasso.bind(this);
    this.handleGenerateTSNE = this.handleGenerateTSNE.bind(this);

  }

  toggleZoom() {
    this.setState((prevState) => ({
      isZoomEnabled: !prevState.isZoomEnabled,
      isLassoActive: false,  // Disable lasso when enabling zoom
    }), () => {
      if (this.state.isZoomEnabled) {
        this.disableLasso();
        this.setUpCamera(); // Reset the camera to default position
      }
    });
  }
  
  toggleLasso() {
    this.setState((prevState) => ({
      isLassoActive: !prevState.isLassoActive,
      isZoomEnabled: false,  // Disable zoom when enabling lasso
    }), () => {
      if (this.state.isLassoActive) {
        this.enableLasso();
      } else {
        this.disableLasso();
        this.setUpCamera(); // Reset the camera to default position
      }
    });
  }
  



//log the points inside the shaded polygon
enableLasso() {
  const svg = d3.select(this.mount).append("svg")
    .attr("class", "lasso")
    .style("position", "absolute")
    .style("top", 0)
    .style("left", 0)
    .style("width", "100%")
    .style("height", "100%")
    .style("z-index", 2) // Ensure the SVG is above the canvas
    .style("pointer-events", "none");

  let lassoPoints = [];
  let lassoLine = svg.append("path")
    .attr("class", "lasso-path")
    .attr("stroke", "red")
    .attr("stroke-width", 2)
    .attr("fill", "none");

  const view = d3.select(this.renderer.domElement);

  const onMouseMove = () => {
    const [mouseX, mouseY] = d3.mouse(svg.node());
    lassoPoints.push([mouseX, mouseY]);
    lassoLine.attr("d", d3.line()(lassoPoints));
  };

  view.on("mousedown", () => {
    if (lassoPoints.length > 0) {
      lassoPoints.push(lassoPoints[0]);
      lassoLine.attr("d", d3.line()(lassoPoints))
        .attr("fill", "rgba(255, 0, 0, 0.3)");

      view.on("mousemove", null);
      view.on("mousedown ", null);
      
      this.selectPointsInsideLasso(lassoPoints); // Select points inside the lasso
    } else {
      const [mouseX, mouseY] = d3.mouse(svg.node());
      lassoPoints.push([mouseX, mouseY]);
      view.on("mousemove", onMouseMove);
    }
  });

  view.on("mouseup", () => {
    if (lassoPoints.length > 0) {
      lassoPoints.push(lassoPoints[0]);
      lassoLine.attr("d", d3.line()(lassoPoints))
        .attr("fill", "rgba(255, 0, 0, 0.3)");

      view.on("mousemove", null);
      view.on("mousedown", null);

      this.selectPointsInsideLasso(lassoPoints); // Select points inside the lasso
    }
  });
}




selectPointsInsideLasso(lassoPoints) {
  const lassoPolygon = d3.polygonHull(lassoPoints); // Create the lasso polygon
  if (!lassoPolygon) {
    console.log('Lasso polygon is not valid.');
    return;
  }

  const selectedEmbeddings = [];
  const point_group = this.scene.children[0].children;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  point_group.forEach(points => {
    const positions = points.geometry.attributes.position.array;
    const numVertices = positions.length / 3;
    let visible = false;

    for (let i = 0; i < numVertices; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];

      // Convert the point from world space to screen space
      const worldPosition = new THREE.Vector3(x, y, 0);
      const screenPosition = worldPosition.project(this.camera);
      
      const pixelX = (screenPosition.x * 0.5 + 0.5) * this.props.width;
      const pixelY = (-screenPosition.y * 0.5 + 0.5) * this.props.height;

      if (d3.polygonContains(lassoPolygon, [pixelX, pixelY])) {
        selectedEmbeddings.push([x, y]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        visible = true;
      }
      
    }
    points.visible = visible;

    console.log('Selected embeddings:', selectedEmbeddings);
  });

  if (selectedEmbeddings.length === 0) {
    console.log('No points were selected inside the lasso.');
    return;
  }

  this.setState({
    selectedEmbeddings,   // Save the embeddings to state if needed
    isPolygonDrawn: true, // Show the button
  });
  // Zoom into the selected points
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  this.adjustCameraToBoundingBox(minX, maxX, minY, maxY, centerX, centerY);
}




adjustCameraToBoundingBox(minX, maxX, minY, maxY, centerX, centerY) {
  // Calculate the width and height of the selected region
  const width = maxX - minX;
  const height = maxY - minY;

  
  // Determine the scale to fit the selected region within the view
  const aspectRatio = this.camera.aspect;
  let scale;

  if (width / height > aspectRatio) {
    // Fit to width  
    scale = width / this.props.width;
  } else {    
    // Fit to height
    scale = height / this.props.height;
  }
  // const zoomLevel = Math.max(scale, 0.1); // Ensure zoom level doesn't go below a minimum value

  // Set the new camera position to center on the selected region
  // this.camera.position.set(centerX, centerY, this.getZFromScale(zoomLevel));

  // Update the camera's projection matrix to apply changes
  // this.camera.updateProjectionMatrix();
  
  // Optionally, you can trigger a re-render here if needed
  // this.renderer.render(this.scene, this.camera);
}



animate() {
  requestAnimationFrame(this.animate);
  TWEEN.update();
  this.renderer.render(this.scene, this.camera);
}

handleGenerateTSNE() {
  const { selectedEmbeddings } = this.state;
  console.log("aasfdsafdasfdsafsdd");
  if (selectedEmbeddings.length === 0) {
    console.warn("No points selected for the new projection.");
    return;
  }

  // // Step 1: Clear the old points from the scene
  this.clearOldProjection();

  // // Step 2: Optionally apply t-SNE or UMAP to the selected points
  const newProjection = this.applyTSNE(selectedEmbeddings);

  // // Step 3: Render the new projection based on the t-SNE or UMAP result
  // this.renderNewProjection(newProjection);
}

clearOldProjection() {
  // Access the points group and clear the scene (optional)
  const point_group = this.scene.children[0].children;

  // Remove all previous points from the scene
  point_group.forEach(points => {
    this.scene.remove(points); // Completely remove points (or set visible to false)
  });

  this.renderer.render(this.scene, this.camera);
}


applyTSNE(selectedEmbeddings) {
  // Initialize the t-SNE model
  console.log("got embeddings:", selectedEmbeddings);
}

renderNewProjection(newProjection) {
  // Render the new t-SNE projection points
  const point_group = new THREE.Group();

  newProjection.forEach(embedding => {
    const [x, y] = embedding; // Assuming 2D projection

    const vert = new THREE.Vector3(x, y, 0);
    const geometry = new THREE.BufferGeometry().setFromPoints([vert]);

    const material = new THREE.PointsMaterial({ size: 5, color: 0xffffff });
    const point = new THREE.Points(geometry, material);

    point_group.add(point); // Add each point to the group
  });

  // Add the new points group to the scene
  this.scene.add(point_group);

  // Re-render the scene with the new projection
  this.renderer.render(this.scene, this.camera);
}



disableLasso() {
  d3.select("svg.lasso").remove();
  const view = d3.select(this.renderer.domElement);
  view.on("mousedown", null);
  view.on("mousemove", null);
  view.on("mouseup", null);

  this.setState({ isPolygonDrawn: false }); // Reset the polygon state when lasso is disabled

  this.setUpCamera(); // Reset camera to ensure it's ready for further interactions
}




  //toggles zoom
  /*toggleZoom() {
    this.setState(prevState => ({
      zoomEnabled: !prevState.zoomEnabled
    }));
  }*/

  changeEmbeddings(prev_choice, new_choice) {
    // assumes mnist embeddings has been updated

    let ranges = []
    for (let i = 0; i < sprite_number; i++) {
      let start = i * sprite_size
      let end = (i + 1) * sprite_size
      if (i === sprite_number - 1) end = sprite_number * sprite_size
      ranges.push([start, end])
    }

    let embedding_chunks = ranges.map(range =>
      this.props[this.props.algorithm_embedding_keys[new_choice]].slice(
        range[0],
        range[1]
      )
    )

    for (let c = 0; c < sprite_number; c++) {
      let echunk = embedding_chunks[c]

      let points = this.scene.children[0].children[c]
      let numVertices = echunk.length
      let position = points.geometry.attributes.position.array
      let target = new Float32Array(numVertices * 3)
      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let x = echunk[i][0]
        let y = echunk[i][1]
        let z = 0
        target[index] = x
        target[index + 1] = y
        target[index + 2] = z
      }

      let tween = new TWEEN.Tween(position)
        .to(target, 1000)
        .easing(TWEEN.Easing.Linear.None)
      tween.onUpdate(function() {
        points.geometry.attributes.position = new THREE.BufferAttribute(
          position,
          3
        )
        points.geometry.attributes.position.needsUpdate = true // required after the first render
      })
      tween.start()
    }
  }

  getZFromScale(scale) {
    const { width, height } = this.props;
    const aspectRatio = this.camera.aspect;
    const maxDim = Math.max(width, height);
    let rvFOV = THREE.Math.degToRad(this.camera.fov);
    let scale_height = this.props.height / scale;
  
    // Safeguard to prevent zoom from going too close or too far
    const minZ = 0.1;  // Set a minimum distance
    const maxZ = 1000; // Set a maximum distance
  
    let camera_z_position = Math.max(
      minZ,
      Math.min(maxZ, scale_height / (2 * Math.tan(rvFOV / 2)))
    );
  
    return camera_z_position;
  }
  

  getScaleFromZ(camera_z_position) {
    let rvFOV = THREE.Math.degToRad(this.camera.fov)
    let half_fov_height = Math.tan(rvFOV / 2) * camera_z_position
    let fov_height = half_fov_height * 2
    let scale = this.props.height / fov_height
    return scale
  }

  handleResize = (width, height) => {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    let current_scale = this.getScaleFromZ(this.camera.position.z)
    let d3_x = -(this.camera.position.x * current_scale) + this.props.width / 2
    let d3_y = this.camera.position.y * current_scale + this.props.height / 2
    var resize_transform = d3.zoomIdentity
      .translate(d3_x, d3_y)
      .scale(current_scale)
    let view = d3.select(this.mount)
    this.d3_zoom.transform(view, resize_transform)
  }


  zoomHandler() {
    if (!this.state.isZoomEnabled) return; // Skip zooming if not enabled
  
    let d3_transform = d3.event.transform;
  
    let scale = d3_transform.k;
    let x = -(d3_transform.x - this.props.width / 2) / scale;
    let y = (d3_transform.y - this.props.height / 2) / scale;
    let z = this.getZFromScale(scale);
  
    this.camera.position.set(x, y, z);
  
    // point size scales at end of zoom
    let new_size = zoomScaler(z);
    let point_group = this.scene.children[0].children;
    for (let c = 0; c < point_group.length; c++) {
      point_group[c].material.uniforms.size.value = new_size;
    }
  }

  setUpCamera() {
    let { width, height, mnist_embeddings } = this.props

    if (!Array.isArray(mnist_embeddings) || mnist_embeddings.length === 0) {
      console.warn('mnist_embeddings is empty or not an array')
      return
    }

    let aspect = this.camera.aspect
    let vFOV = this.camera.fov
    let rvFOV = THREE.Math.degToRad(vFOV)

    let xs = mnist_embeddings.map(e => e[0])
    let min_x = _.min(xs)
    let max_x = _.max(xs)
    let ys = mnist_embeddings.map(e => e[1])
    let min_y = _.min(ys)
    let max_y = _.max(ys)
    let data_width = max_x - min_x
    let data_height = max_y - min_y
    let data_aspect = data_width / data_height

    let max_x_from_center = _.max([min_x, max_x].map(m => Math.abs(m)))
    let max_y_from_center = _.max([min_y, max_y].map(m => Math.abs(m)))

    let max_center = Math.max(max_x_from_center, max_y_from_center)

    let camera_z_start
    if (data_aspect > aspect) {
      // console.log("width is limiter");
      camera_z_start = max_x_from_center / Math.tan(rvFOV / 2) / aspect
    } else {
      // console.log("height is limiter");
      camera_z_start = max_y_from_center / Math.tan(rvFOV / 2)
    }

    camera_z_start = max_center / Math.tan(rvFOV / 2)

    let far = camera_z_start * 1.25
    this.camera.far = far
    this.camera.position.z = camera_z_start * 1.1

    // Only set up zoom if enabled
    if (this.state.isZoomEnabled) {
      this.d3_zoom = d3
        .zoom()
        .scaleExtent([this.getScaleFromZ(far - 1), this.getScaleFromZ(0.1)])
        .on('zoom', this.zoomHandler.bind(this));
  
      let view = d3.select(this.mount);
      this.view = view;
      view.call(this.d3_zoom);
      let initial_scale = this.getScaleFromZ(this.camera.position.z);
      var initial_transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(initial_scale);
      this.d3_zoom.transform(view, initial_transform);
    }
}

  addPoints() {
    let { mnist_embeddings, mnist_labels, color_array } = this.props

    if (!Array.isArray(mnist_embeddings) || mnist_embeddings.length === 0) {
      console.warn('mnist_embeddings is empty or not an array')
      return
    }
  
    // Ensure mnist_labels is an array and has elements before proceeding
    if (!Array.isArray(mnist_labels) || mnist_labels.length === 0) {
      console.warn('mnist_labels is empty or not an array')
      return
    }

    // split embeddings and labels into chunks to match sprites
    let ranges = []
    for (let i = 0; i < sprite_number; i++) {
      let start = i * sprite_size
      let end = (i + 1) * sprite_size
      if (i === sprite_number - 1) end = sprite_number * sprite_size
      ranges.push([start, end])
    }
    let embedding_chunks = ranges.map(range =>
      mnist_embeddings.slice(range[0], range[1])
    )
    let label_chunks = ranges.map(range =>
      mnist_labels.slice(range[0], range[1])
    )

    // load the textures
    let loader = new THREE.TextureLoader()
    this.textures = mnist_tile_locations.map(l => {
      let t = loader.load(l)
      t.flipY = false
      t.magFilter = THREE.NearestFilter
      // t.minFilter = THREE.LinearMipMapLinearFilter;
      return t
    })

    let point_group = new THREE.Group()
    for (let c = 0; c < sprite_number; c++) {
      let echunk = embedding_chunks[c]
      let lchunk = label_chunks[c]

      let vertices = []
      for (let v = 0; v < echunk.length; v++) {
        let embedding = echunk[v]
        let vert = new THREE.Vector3(embedding[0], embedding[1], 0)
        vertices[v] = vert
      }

      let geometry = new THREE.BufferGeometry()

      let numVertices = vertices.length
      let positions = new Float32Array(numVertices * 3)
      let offsets = new Float32Array(numVertices * 2)
      let colors = new Float32Array(numVertices * 3)
      geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.addAttribute('offset', new THREE.BufferAttribute(offsets, 2))
      geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3))

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let x = echunk[i][0]
        let y = echunk[i][1]
        let z = 0
        positions[index] = x
        positions[index + 1] = y
        positions[index + 2] = z
      }

      // geometry.attributes.position.copyVector3sArray(vertices)

      let texture_subsize = 1 / sprite_side

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 2) {
        let x = ((i % sprite_side) * sprite_image_size) / sprite_actual_size
        let y =
          (Math.floor(i / sprite_side) * sprite_image_size) / sprite_actual_size
        offsets[index] = x
        offsets[index + 1] = y
      }

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let color = color_array[lchunk[i]]
        colors[index] = color[0] / 255
        colors[index + 1] = color[1] / 255
        colors[index + 2] = color[2] / 255
      }

      // uniforms
      let uniforms = {
        texture: { value: this.textures[c] },
        repeat: { value: new THREE.Vector2(texture_subsize, texture_subsize) },
        size: { value: sprite_image_size },
      }

      let vertex_shader = `
        attribute vec2 offset;
        varying vec2 vOffset;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float size;
        void main() {
          vOffset = offset;
          vColor = color;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`

      let fragment_shader = `
        uniform sampler2D texture;
        uniform vec2 repeat;
        varying vec2 vOffset;
        varying vec3 vColor;
        void main() {
          vec2 uv = vec2( gl_PointCoord.x, gl_PointCoord.y );
          vec4 tex = texture2D( texture, uv * repeat + vOffset );
          if ( tex.r < 0.5 ) discard;
          tex.r = 1.0;
          tex.g = 1.0;
          tex.b = 1.0;
          gl_FragColor = tex * vec4(vColor, 1.0);
        }`

      // material
      let material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertex_shader,
        fragmentShader: fragment_shader,
      })

      // point cloud
      let point_cloud = new THREE.Points(geometry, material)
      point_cloud.userData = { sprite_index: c }

      point_group.add(point_cloud)
    }

    this.scene.add(point_group)
  }

  addBlankHighlightPoints() {

    if (!Array.isArray(this.textures) || this.textures.length === 0) {
      console.warn('Textures are not loaded or empty')
      return
    }

    let hover_container = new THREE.Group()
    this.scene.add(hover_container)

    let vert = new THREE.Vector3(0, 0, 0)
    let vertices = [vert]
    let geometry = new THREE.BufferGeometry()
    let numVertices = vertices.length
    var positions = new Float32Array(numVertices * 3) // 3 coordinates per point
    var offsets = new Float32Array(numVertices * 2) // 2 coordinates per point
    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.addAttribute('offset', new THREE.BufferAttribute(offsets, 2))

    // all the attributes will be filled on hover
    let texture_subsize = 1 / sprite_side

    // uniforms
    let uniforms = {
      texture: { value: this.textures[0] },
      repeat: { value: new THREE.Vector2(texture_subsize, texture_subsize) },
      size: { value: 56.0 },
    }

    let vertex_shader = `
        attribute vec2 offset;
        varying vec2 vOffset;
        uniform float size;
        void main() {
          vOffset = offset;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`

    let fragment_shader = `
        uniform sampler2D texture;
        uniform vec2 repeat;
        varying vec2 vOffset;
        void main() {
          vec2 uv = vec2( gl_PointCoord.x, gl_PointCoord.y );
          vec4 tex = texture2D( texture, uv * repeat + vOffset ); 
          tex.a = tex.r;
          tex.r = 1.0;
          tex.g = 1.0;
          tex.b = 1.0;
          gl_FragColor = tex;
        }`

    // material
    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertex_shader,
      fragmentShader: fragment_shader,
      transparent: true,
    })

    let point = new THREE.Points(geometry, material)
    point.frustumCulled = false

    this.scene.children[1].visible = false
    this.scene.children[1].add(point)
  }

  highlightPoint(sprite_index, digit_index, full_index) {
    let { algorithm_embedding_keys, algorithm_choice } = this.props

    let point = this.scene.children[1].children[0]

    let embedding = this.props[algorithm_embedding_keys[algorithm_choice]][
      full_index
    ]

    let vert = new THREE.Vector3(embedding[0], embedding[1], 0)
    let vertices = [vert]

    var offsets = new Float32Array(2) // 2 coordinates per point

    let x = ((digit_index % sprite_side) * 28) / 2048
    let y = (Math.floor(digit_index / sprite_side) * 28) / 2048
    offsets[0] = x
    offsets[1] = y

    point.geometry.attributes.position.copyVector3sArray(vertices)
    point.geometry.attributes.position.needsUpdate = true // required after the first render
    point.geometry.attributes.offset.array = offsets
    point.geometry.attributes.offset.needsUpdate = true // required after the first render

    // need to set attributes on geometry and uniforms on material
    point.material.uniforms.texture.value = this.textures[sprite_index]
  }

  removeHighlights() {
    let highlight_container = this.scene.children[1]
    let highlights = highlight_container.children
    highlight_container.remove(...highlights)
  }

  checkIntersects(mouse_position) {
    let { width, height, sidebar_ctx, sidebar_image_size } = this.props

    function mouseToThree([mouseX, mouseY]) {
      return new THREE.Vector3(
        (mouseX / width) * 2 - 1,
        -(mouseY / height) * 2 + 1,
        1
      )
    }

    function sortIntersectsByDistanceToRay(intersects) {
      return _.sortBy(intersects, 'distanceToRay')
    }

    let mouse_vector = mouseToThree(mouse_position)
    this.raycaster.setFromCamera(mouse_vector, this.camera)
    this.raycaster.params.Points.threshold = 0.25
    let intersects = this.raycaster.intersectObjects(
      this.scene.children[0].children
    )
    if (intersects[0]) {
      let sorted_intersects = sortIntersectsByDistanceToRay(intersects)
      let intersect = sorted_intersects[0]
      let sprite_index = intersect.object.userData.sprite_index
      let digit_index = intersect.index
      let full_index = sprite_index * sprite_size + digit_index
      this.props.setHoverIndex(full_index)
      this.highlightPoint(sprite_index, digit_index, full_index)
      this.scene.children[1].visible = true

      sidebar_ctx.fillRect(0, 0, sidebar_image_size, sidebar_image_size)
      sidebar_ctx.drawImage(
        mnist_images[sprite_index],
        // source rectangle
        (digit_index % sprite_side) * sprite_image_size,
        Math.floor(digit_index / sprite_side) * sprite_image_size,
        sprite_image_size,
        sprite_image_size,
        // destination rectangle
        0,
        0,
        sidebar_image_size,
        sidebar_image_size
      )
    } else {
      this.props.setHoverIndex(null)
      this.scene.children[1].visible = false
      sidebar_ctx.fillRect(0, 0, sidebar_image_size, sidebar_image_size)
    }
  }

  handleMouse() {
    let view = d3.select(this.renderer.domElement)

    this.raycaster = new THREE.Raycaster()

    view.on('mousemove', () => {
      let [mouseX, mouseY] = d3.mouse(view.node())
      let mouse_position = [mouseX, mouseY]
      this.checkIntersects(mouse_position)
    })
  }

  init() {
    let { width, height } = this.props

    this.scene = new THREE.Scene()

    let vFOV = 75
    let aspect = width / height
    let near = 0.01
    let far = 1000

    this.camera = new THREE.PerspectiveCamera(vFOV, aspect, near, far)

    this.renderer = new THREE.WebGLRenderer()
    this.renderer.setClearColor(0x111111, 1)
    this.renderer.setSize(width, height)
    this.mount.appendChild(this.renderer.domElement)

    this.addPoints()

    this.addBlankHighlightPoints()

    this.setUpCamera()

    this.animate()

    this.handleMouse()
  }

  animate() {
    requestAnimationFrame(this.animate)
    TWEEN.update()
    this.renderer.render(this.scene, this.camera)
  }

  componentDidMount() {
    this.init()
  }

  componentDidUpdate(prevProps) {
    let { width, height } = this.props
    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize(width, height)
    }
    if (prevProps.algorithm_choice !== this.props.algorithm_choice) {
      this.changeEmbeddings(
        prevProps.algorithm_choice,
        this.props.algorithm_choice
      )
    }
  }

  componentWillUnmount() {
    this.mount.removeChild(this.renderer.domElement)
  }
  resetView() {
    const point_group = this.scene.children[0].children; // Access the points group
  
    // Reset the visibility of all points
    point_group.forEach(points => {
      points.visible = true;
    });
  
    // Optionally reset the camera view
    this.setUpCamera();
  
    this.setState({
      selectedEmbeddings: [],
      isPolygonDrawn: false, // Hide the polygon-related buttons
    });
  }
  

  render() {
    let { width, height } = this.props;
    return (
      <div style={{ position: 'relative' }}>
        {/* Zoom Toggle Button */}
        <button
          onClick={this.toggleZoom}
          style={{
            position: 'absolute',
            zIndex: 1,
            top: '10px',
            left: '10px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          <img
            src={zoom}
            alt="Zoom Toggle"
            style={{
              filter: this.state.isZoomEnabled ? 'invert(100%)' : 'invert(50%)',
              width: '24px',
              height: '24px',
            }}
          />
        </button>
  
        {/* Lasso Toggle Button */}
        <button
          onClick={this.toggleLasso}
          style={{
            position: 'absolute',
            zIndex: 1,
            top: '10px',
            left: '44px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          <img
            src={lassoIcon}
            alt="Lasso Toggle"
            style={{
              filter: this.state.isLassoActive ? 'invert(100%)' : 'invert(50%)',
              width: '24px',
              height: '24px',
            }}
          />
        </button>
  
        {/* Reset View Button */}
        <button
          onClick={this.resetView.bind(this)}
          style={{
            position: 'absolute',
            zIndex: 1,
            top: '10px',
            left: '78px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          <img
            src={reset}
            alt="Reset View"
            style={{ width: '24px', height: '24px' }}
          />
        </button>
  
        {/* Generate t-SNE Plot Button (Shown only when the lasso is active and polygon is drawn) */}
        {this.state.isLassoActive && this.state.isPolygonDrawn && (
          <button
            onClick={this.handleGenerateTSNE}
            style={{
              position: 'absolute',
              zIndex: 1,
              top: '50px',
              left: '10px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '10px',
              cursor: 'pointer',
              borderRadius: '5px',
            }}
          >
            Generate t-SNE Plot
          </button>
        )}
  
        {/* Canvas Mount */}
        <div
          style={{ width: width, height: height, overflow: 'hidden' }}
          ref={mount => {
            this.mount = mount;
          }}
        />
      </div>
    );
  }  
}  

export default Projection