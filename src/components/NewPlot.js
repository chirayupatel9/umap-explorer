import React, { Component } from 'react';
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import * as _ from 'lodash';

class NewPlot extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedEmbeddings: null,
    };
  }

  // Initialize the plot (similar to Projection.js)
  init() {
    const { width, height } = this.mount.getBoundingClientRect();

    this.scene = new THREE.Scene();

    let vFOV = 75;
    let aspect = width / height;
    let near = 0.01;
    let far = 1000;

    this.camera = new THREE.PerspectiveCamera(vFOV, aspect, near, far);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setClearColor(0x111111, 1);
    this.renderer.setSize(width, height);
    this.mount.appendChild(this.renderer.domElement);

    this.addPoints();
    this.setUpCamera();
    this.animate();
  }

 
  addPoints() {
    const { selectedEmbeddings } = this.state;
    const pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(selectedEmbeddings.length * 3);

    
    selectedEmbeddings.forEach((embedding, index) => {
      positions[index * 3] = embedding[0];
      positions[index * 3 + 1] = embedding[1];
      positions[index * 3 + 2] = 0; // z coordinate is 0
    });

    pointsGeometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.1,
      color: 0xffffff,
    });

    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    this.scene.add(points);
  }

  setUpCamera() {
    let { width, height } = this.mount.getBoundingClientRect();

    let aspect = this.camera.aspect;
    let vFOV = this.camera.fov;
    let rvFOV = THREE.Math.degToRad(vFOV);

    let max_x = _.max(this.state.selectedEmbeddings.map(e => e[0]));
    let min_x = _.min(this.state.selectedEmbeddings.map(e => e[0]));
    let max_y = _.max(this.state.selectedEmbeddings.map(e => e[1]));
    let min_y = _.min(this.state.selectedEmbeddings.map(e => e[1]));

    let data_width = max_x - min_x;
    let data_height = max_y - min_y;
    let data_aspect = data_width / data_height;

    let max_center = Math.max(Math.abs(min_x), Math.abs(max_x), Math.abs(min_y), Math.abs(max_y));

    let camera_z_start = max_center / Math.tan(rvFOV / 2);
    this.camera.position.z = camera_z_start * 1.1;
    this.camera.updateProjectionMatrix();
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    TWEEN.update();
    this.renderer.render(this.scene, this.camera);
  };

  handleResize = () => {
    const { width, height } = this.mount.getBoundingClientRect();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  componentDidMount() {
    
    const selectedEmbeddings = JSON.parse(localStorage.getItem('selectedEmbeddings'));

    if (selectedEmbeddings) {
      this.setState({ selectedEmbeddings }, () => {
        this.init(); 
      });
    } else {
      console.error('No selected embeddings found in localStorage');
    }

    
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  }

  render() {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute', 
          top: 0,
          left: 0,
        }}
        ref={mount => (this.mount = mount)}
      >
      </div>
    );
  }
}

export default NewPlot;