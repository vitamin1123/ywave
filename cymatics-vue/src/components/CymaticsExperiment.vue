<template>
  <div class="cymatics-container">
    <div id="canvas-container" ref="canvasContainer"></div>
    
    <div class="ui-panel">
      <t-card :bordered="false" class="control-card">
        <template #header>
          <div class="card-header">
            <h2 class="title">控制台</h2>
            <p class="subtitle">cymatics</p>
          </div>
        </template>
        
        <div class="control-group">
          <t-select
            v-model="selectedAudio"
            placeholder="选择音频"
            :options="audioOptions"
            @change="handleAudioChange"
            class="audio-select"
          />
        </div>

        <div class="control-group">
          <t-button block theme="primary" @click="togglePlay">
            {{ isPlaying ? '停止播放' : '播放选中的音频' }}
          </t-button>
        </div>

        <div class="stats-container">
          <div class="stat-item">
            <span class="label">Energy:</span>
            <span class="value">{{ energy }} dB</span>
          </div>
          <div class="stat-item">
            <span class="label">N:</span>
            <span class="value">{{ n.toFixed(2) }}</span>
          </div>
          <div class="stat-item">
            <span class="label">M:</span>
            <span class="value">{{ m.toFixed(2) }}</span>
          </div>
        </div>

        <div class="progress-container" v-if="duration > 0">
          <div class="custom-progress-track">
            <div class="custom-progress-thumb" :style="{ left: progressPercent + '%' }"></div>
          </div>
          <div class="progress-label">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
        </div>
      </t-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Tone from 'tone';

// State
const canvasContainer = ref(null);
const selectedAudio = ref('');
const isPlaying = ref(false);
const audioFiles = ref([]);
const energy = ref(-100);
const n = ref(2.0);
const m = ref(3.0);
const targetN = ref(2.0);
const targetM = ref(3.0);
const currentTime = ref(0);
const duration = ref(0);

// Three.js & Tone.js objects
let scene, camera, renderer, particles, controls;
let analyzer, player;
let animationId;
let startTime = 0;

const PARTICLE_COUNT = 20000;
const plateSize = 2;

const audioOptions = computed(() => {
  const options = [
    { label: '示例音频 (实验性低音)', value: 'https://tonejs.github.io/audio/berlin/sonant.mp3' }
  ];
  audioFiles.value.forEach(file => {
    options.push({ label: file, value: `audio/${file}` });
  });
  return options;
});

const progressPercent = computed(() => {
  if (duration.value === 0) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

// Initialization
onMounted(async () => {
  initScene();
  await initAudio();
  animate();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  if (player) player.dispose();
  if (renderer) renderer.dispose();
});

function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 2.5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  if (canvasContainer.value) {
    canvasContainer.value.appendChild(renderer.domElement);
  }

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * plateSize;
    positions[i * 3 + 1] = (Math.random() - 0.5) * plateSize;
    positions[i * 3 + 2] = 0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x00ffcc,
    size: 0.012,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  const plateGeom = new THREE.PlaneGeometry(plateSize, plateSize);
  const plateMat = new THREE.MeshBasicMaterial({ color: 0x111122, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
  const plate = new THREE.Mesh(plateGeom, plateMat);
  scene.add(plate);
}

async function initAudio() {
  analyzer = new Tone.Analyser("fft", 256);
  
  // Load default audio
  const defaultAudio = 'https://tonejs.github.io/audio/berlin/sonant.mp3';
  selectedAudio.value = defaultAudio; // Set initial value
  await loadAudio(defaultAudio);
  
  await scanAudioFiles();
}

async function scanAudioFiles() {
  try {
    const response = await fetch('audio/files.json');
    if (response.ok) {
      const data = await response.json();
      audioFiles.value = data.files || [];
    }
  } catch (e) {
    console.warn('本地 files.json 未找到，仅加载示例音频');
  }
}

async function loadAudio(url) {
  if (player) {
    player.stop();
    player.dispose();
  }
  
  player = new Tone.Player({
    url: url,
    loop: true,
    autostart: false,
    onload: () => {
      console.log("音频加载完毕");
      if (player.buffer) {
        duration.value = player.buffer.duration;
      }
    }
  }).connect(analyzer).toDestination();
  
  // Wait for buffer load if needed, but onload handles duration.
  // We can await player.loaded but explicit onload is safer for reactive updates.
  await player.loaded;
  if (player.buffer) {
     duration.value = player.buffer.duration;
  }
}

async function handleAudioChange(val) {
  if (val) {
    isPlaying.value = false; // Stop playing when changing audio
    await loadAudio(val);
  }
}

async function togglePlay() {
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }

  if (player.state === "started") {
    player.stop();
    isPlaying.value = false;
  } else {
    player.start();
    startTime = Tone.now(); // Record start time
    isPlaying.value = true;
  }
}

function updateParticles() {
  if (!particles) return;
  const positions = particles.geometry.attributes.position.array;
  
  // Smooth transition
  n.value += (targetN.value - n.value) * 0.1;
  m.value += (targetM.value - m.value) * 0.1;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let x = positions[i * 3];
    let y = positions[i * 3 + 1];

    let nx = x / (plateSize / 2);
    let ny = y / (plateSize / 2);
    
    let val = Math.cos(n.value * Math.PI * nx) * Math.cos(m.value * Math.PI * ny) - 
              Math.cos(m.value * Math.PI * nx) * Math.cos(n.value * Math.PI * ny);

    let force = val * 0.05; 
    let jitter = isPlaying.value ? 0.02 : 0.002;

    positions[i * 3] += (Math.random() - 0.5) * jitter - force * Math.sin(nx * Math.PI);
    positions[i * 3 + 1] += (Math.random() - 0.5) * jitter - force * Math.sin(ny * Math.PI);

    // Boundary constraints
    if (Math.abs(positions[i * 3]) > plateSize/2) positions[i * 3] *= -0.95;
    if (Math.abs(positions[i * 3 + 1]) > plateSize/2) positions[i * 3 + 1] *= -0.95;
  }
  particles.geometry.attributes.position.needsUpdate = true;
}

function analyzeAudio() {
  if (!isPlaying.value || !analyzer) return;

  const fftData = analyzer.getValue();
  
  let maxEnergy = -100;
  let peakIndex = 0;

  for (let i = 0; i < fftData.length; i++) {
    if (fftData[i] > maxEnergy) {
      maxEnergy = fftData[i];
      peakIndex = i;
    }
  }

  targetN.value = 2 + (peakIndex % 6);
  targetM.value = 2 + (Math.floor(peakIndex / 4) % 8);

  energy.value = Math.round(maxEnergy);
  
  if (particles && particles.material) {
    particles.material.opacity = THREE.MathUtils.mapLinear(maxEnergy, -100, -30, 0.4, 1.0);
  }
}

function updateProgress() {
  if (!player || player.state !== "started" || duration.value === 0) return;
  
  // Estimate current time based on Tone.now() and startTime, handling loop
  const now = Tone.now();
  const elapsed = now - startTime;
  currentTime.value = elapsed % duration.value;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function onResize() {
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function animate() {
  animationId = requestAnimationFrame(animate);
  if (controls) controls.update();
  
  if (isPlaying.value) {
    analyzeAudio();
    updateProgress();
  }
  updateParticles();
  
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}
</script>

<style scoped>
.cymatics-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #050510;
}

#canvas-container {
  width: 100%;
  height: 100%;
}

.ui-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  width: 320px;
}

.control-card {
  background: rgba(0, 0, 0, 0.8) !important;
  border: 1px solid #00ffcc !important;
  color: #fff !important;
  backdrop-filter: blur(5px);
}

.card-header {
  margin-bottom: 10px;
}

.title {
  margin: 0;
  font-size: 18px;
  color: #00ffcc;
}

.subtitle {
  margin: 5px 0 0 0;
  font-size: 12px;
  color: #fff;
}

.control-group {
  margin-bottom: 15px;
}

.audio-select {
  width: 100%;
}

/* Customize TDesign overrides for dark theme feel */
:deep(.t-input), :deep(.t-select__wrap), :deep(.t-select-input), :deep(.t-input__inner), :deep(.t-select-input__single) {
  background: #111 !important;
  border-color: #00ffcc !important;
  color: #fff !important;
}

:deep(.t-select__list) {
  background: #111 !important;
}

:deep(.t-select-option) {
  color: #fff !important;
}

:deep(.t-select-option:hover), :deep(.t-select-option.t-is-selected) {
  background: #333 !important;
  color: #00ffcc !important;
}

:deep(.t-button--theme-primary) {
  background-color: #00ffcc !important;
  border-color: #00ffcc !important;
  color: #000 !important;
  font-weight: bold;
}

:deep(.t-button--theme-primary:hover) {
  background-color: #00cca3 !important;
  border-color: #00cca3 !important;
}

.stats-container {
  margin: 15px 0;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.label {
  color: #fff;
}

.value {
  color: #00ffcc;
}

.progress-container {
  margin-top: 20px;
}

.custom-progress-track {
  position: relative;
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
  margin-bottom: 12px;
}

.custom-progress-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: radial-gradient(circle at 30% 30%, #f0f0f0, #ccc);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.8),
    inset 0 -1px 2px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: left 0.1s linear;
}

.progress-label {
  font-size: 12px;
  color: #fff;
  text-align: right;
  font-family: 'Courier New', monospace;
}
</style>
