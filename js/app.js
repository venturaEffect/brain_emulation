// Fixed SNN Visualizer with a stable orbit camera system

class SNNVisualizer {
  constructor() {
    this.state = {
      isRunning: true,
      showWeights: false,
      speed: 1,
      firingRate: 0.0002, // Much lower default firing rate
      pulseDecay: 0.95,
      threshold: 1.0,
      pauseSpikes: false,
      selectedNeuron: null,
    };

    this.config = {
      networkSize: 120,
      connectionProb: 0.3,
      neuronSize: 1.0,
      pulseIntensity: 1.5,
      cameraMoveSpeed: 0.3,
    };

    this.CLUSTER_COLORS = [
      {
        primary: { r: 0.22, g: 0.31, b: 0.52 }, // Neural blue
        glow: { r: 0.4, g: 0.5, b: 0.7 },
        name: "Neural",
      },
      {
        primary: { r: 0.53, g: 0.47, b: 0.56 }, // Pulse purple
        glow: { r: 0.7, g: 0.6, b: 0.75 },
        name: "Pulse",
      },
      {
        primary: { r: 0.54, g: 0.35, b: 0.45 }, // Highlight rose
        glow: { r: 0.75, g: 0.5, b: 0.65 },
        name: "Highlight",
      },
      {
        primary: { r: 0.29, g: 0.21, b: 0.32 }, // Deep purple
        glow: { r: 0.5, g: 0.4, b: 0.55 },
        name: "Deep",
      },
    ];

    this.neurons = [];
    this.connections = [];
    this.voltageHistory = [];

    // Make this instance globally accessible for lesson buttons
    window.snnVisualizer = this;

    this.init();
  }

  init() {
    this.initDOM();
    this.initCanvas();
    this.createNetwork();
    this.bindUI();
    this.initLessons();
    this.initTooltips();

    // Debug: Log network creation
    console.log(`Network initialized with ${this.neurons.length} neurons`);

    // Start animation immediately
    this.animate();
  }

  initDOM() {
    this.dom = {
      canvas: document.getElementById("three-canvas"),
      playBtn: document.getElementById("play"),
      speedSlider: document.getElementById("speed"),
      networkSizeSlider: document.getElementById("networkSize"),
      sizeValueLabel: document.getElementById("sizeValue"),
      connectionProbSlider: document.getElementById("connectionProb"),
      probValueLabel: document.getElementById("probValue"),
      firingRateSlider: document.getElementById("firingRate"),
      firingValueLabel: document.getElementById("firingValue"),
      pulseDecaySlider: document.getElementById("pulseDecay"),
      decayValueLabel: document.getElementById("decayValue"),
      thresholdSlider: document.getElementById("threshold"),
      thresholdValueLabel: document.getElementById("thresholdValue"),
      resetBtn: document.getElementById("resetNetwork"),
      showWeightsBtn: document.getElementById("showWeights"),
      pauseSpikesBtn: document.getElementById("pauseSpikes"),
      injectSpikeBtn: document.getElementById("injectSpike"),
      lessonSelect: document.getElementById("lessonSelect"),
      lessonContent: document.getElementById("lessonContent"),
      voltageValue: document.getElementById("voltageValue"),
      trace: document.getElementById("trace"),
      errEl: document.getElementById("err"),
    };

    // Initialize trace canvas
    if (this.dom.trace) {
      this.traceCtx = this.dom.trace.getContext("2d");
      this.clearTrace();
    }
  }

  initCanvas() {
    if (!this.dom.canvas) {
      console.error("Canvas element not found!");
      return;
    }

    this.ctx = this.dom.canvas.getContext("2d");
    this.resizeCanvas();

    // Set up a proper orbit camera system
    this.camera = {
      position: { x: 0, y: 0, z: 0 }, // Calculated from orbit
      target: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0.2, yaw: -0.5 },
      distance: 1800, // Adjusted for a closer view
      mouse: {
        x: 0,
        y: 0,
        lastX: 0,
        lastY: 0,
        isLeftDown: false,
        isRightDown: false,
        sensitivity: 0.006,
      },
      moveSpeed: 3.0,
      move: { forward: 0, right: 0, up: 0 },
    };

    this.initCameraControls();

    window.addEventListener("resize", () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.dom.canvas.width = window.innerWidth;
    this.dom.canvas.height = window.innerHeight;
    this.dom.canvas.style.width = window.innerWidth + "px";
    this.dom.canvas.style.height = window.innerHeight + "px";
  }

  initCameraControls() {
    this.dom.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.dom.canvas.addEventListener("wheel", (e) => this.onWheel(e));
    this.dom.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.dom.canvas.addEventListener("click", (e) => this.onCanvasClick(e));
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
  }

  onMouseDown(e) {
    if (e.button === 0) this.camera.mouse.isLeftDown = true;
    if (e.button === 2) this.camera.mouse.isRightDown = true;
    this.camera.mouse.lastX = e.clientX;
    this.camera.mouse.lastY = e.clientY;
  }

  onMouseUp(e) {
    if (e.button === 0) this.camera.mouse.isLeftDown = false;
    if (e.button === 2) this.camera.mouse.isRightDown = false;
  }

  onMouseMove(e) {
    const deltaX = e.clientX - this.camera.mouse.lastX;
    const deltaY = e.clientY - this.camera.mouse.lastY;
    this.camera.mouse.lastX = e.clientX;
    this.camera.mouse.lastY = e.clientY;

    if (this.camera.mouse.isLeftDown) {
      // Orbit mode
      this.camera.rotation.yaw -= deltaX * this.camera.mouse.sensitivity;
      this.camera.rotation.pitch -= deltaY * this.camera.mouse.sensitivity;
      this.camera.rotation.pitch = Math.max(
        -Math.PI / 2.1,
        Math.min(Math.PI / 2.1, this.camera.rotation.pitch)
      );
    } else if (this.camera.mouse.isRightDown) {
      // Pan mode
      const right = this.getCameraRight();
      const up = this.getCameraUp();
      const panSpeed = 0.9;

      // Pan the target
      this.camera.target.x -= (right.x * deltaX - up.x * deltaY) * panSpeed;
      this.camera.target.y -= (right.y * deltaX - up.y * deltaY) * panSpeed;
      this.camera.target.z -= (right.z * deltaX - up.z * deltaY) * panSpeed;
    }
  }

  onWheel(e) {
    e.preventDefault();
    const zoomSpeed = 40;
    this.camera.distance += (e.deltaY > 0 ? 1 : -1) * zoomSpeed;
    this.camera.distance = Math.max(200, Math.min(5000, this.camera.distance));
  }

  onCanvasClick(e) {
    // Detect neuron clicks for selection
    const rect = this.dom.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closestNeuron = null;
    let closestDistance = Infinity;

    this.neurons.forEach((neuron) => {
      const projected = this.project3D(neuron.position);
      const distance = Math.sqrt(
        (mouseX - projected.x) ** 2 + (mouseY - projected.y) ** 2
      );

      if (distance < 30 && distance < closestDistance) {
        closestDistance = distance;
        closestNeuron = neuron;
      }
    });

    if (closestNeuron) {
      this.state.selectedNeuron = closestNeuron;
      this.voltageHistory = [];
    }
  }

  onKeyDown(e) {
    if (e.code === "KeyW") this.camera.move.forward = 1;
    if (e.code === "KeyS") this.camera.move.forward = -1;
    if (e.code === "KeyD") this.camera.move.right = 1;
    if (e.code === "KeyA") this.camera.move.right = -1;
    if (e.code === "KeyE") this.camera.move.up = 1;
    if (e.code === "KeyQ") this.camera.move.up = -1;
    if (e.code === "Space") {
      e.preventDefault();
      this.resetCamera();
    }
  }

  onKeyUp(e) {
    if (e.code === "KeyW" || e.code === "KeyS") this.camera.move.forward = 0;
    if (e.code === "KeyA" || e.code === "KeyD") this.camera.move.right = 0;
    if (e.code === "KeyQ" || e.code === "KeyE") this.camera.move.up = 0;
  }

  getCameraForward() {
    return this.normalize({
      x: this.camera.target.x - this.camera.position.x,
      y: this.camera.target.y - this.camera.position.y,
      z: this.camera.target.z - this.camera.position.z,
    });
  }

  getCameraRight() {
    return this.normalize(
      this.cross({ x: 0, y: 1, z: 0 }, this.getCameraForward())
    );
  }

  getCameraUp() {
    return this.cross(this.getCameraForward(), this.getCameraRight());
  }

  normalize(v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (l === 0) return { x: 0, y: 1, z: 0 };
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  updateCameraPosition() {
    const cam = this.camera;

    // Handle WASD panning (moves the target)
    const speed = cam.moveSpeed;
    const lookDir = this.getCameraForward();
    const forward = this.normalize({ x: lookDir.x, y: 0, z: lookDir.z });
    const right = this.getCameraRight();

    cam.target.x +=
      (forward.x * cam.move.forward + right.x * cam.move.right) * speed;
    cam.target.z +=
      (forward.z * cam.move.forward + right.z * cam.move.right) * speed;
    cam.target.y += cam.move.up * speed;

    // Calculate camera position based on orbit (distance, rotation, target)
    const hDist = cam.distance * Math.cos(cam.rotation.pitch);
    const vDist = cam.distance * Math.sin(cam.rotation.pitch);

    cam.position.x = cam.target.x - hDist * Math.sin(cam.rotation.yaw);
    cam.position.y = cam.target.y + vDist;
    cam.position.z = cam.target.z - hDist * Math.cos(cam.rotation.yaw);
  }

  resetCamera() {
    this.camera.target = { x: 0, y: 0, z: 0 };
    this.camera.rotation = { pitch: 0.2, yaw: -0.5 };
    this.camera.distance = 1800;
  }

  project3D(pos) {
    const cam = this.camera;
    const fwd = this.getCameraForward();
    const right = this.getCameraRight();
    const up = this.getCameraUp();

    const dx = pos.x - cam.position.x;
    const dy = pos.y - cam.position.y;
    const dz = pos.z - cam.position.z;

    const x2 = dx * right.x + dy * right.y + dz * right.z;
    const y2 = dx * up.x + dy * up.y + dz * up.z;
    const z2 = dx * fwd.x + dy * fwd.y + dz * fwd.z;

    const fov = 1000; // Adjusted field of view factor
    const distance = Math.max(1, z2);
    const scale = fov / distance;

    return {
      x: this.dom.canvas.width / 2 + x2 * scale,
      y: this.dom.canvas.height / 2 - y2 * scale,
      scale: scale,
      depth: z2,
    };
  }

  // Test function to force render visible neurons
  testRender() {
    // Clear canvas
    this.ctx.fillStyle = "#0a0c12";
    this.ctx.fillRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);

    // Draw test circle to verify canvas works
    this.ctx.fillStyle = "#ff0000";
    this.ctx.beginPath();
    this.ctx.arc(100, 100, 30, 0, Math.PI * 2);
    this.ctx.fill();

    // Check if neurons exist
    if (!this.neurons || this.neurons.length === 0) {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("No neurons created!", 200, 200);
      return;
    }

    // Draw neurons at fixed positions to test visibility
    this.neurons.forEach((neuron, i) => {
      const x = 200 + (i % 10) * 60;
      const y = 200 + Math.floor(i / 10) * 60;
      const radius = 20;

      // Draw neuron
      const color = neuron.colors.primary;
      this.ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(
        color.g * 255
      )}, ${Math.floor(color.b * 255)})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw neuron ID
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "12px Arial";
      this.ctx.fillText(i.toString(), x - 5, y + 3);
    });

    // Draw debug info
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "16px Arial";
    this.ctx.fillText(`Neurons: ${this.neurons.length}`, 20, 50);
    this.ctx.fillText(`Connections: ${this.connections.length}`, 20, 70);
  }

  // Simple working 3D projection
  simpleProject3D(pos) {
    const cam = this.camera;

    // Simple distance-based projection
    const dx = pos.x - cam.position.x;
    const dy = pos.y - cam.position.y;
    const dz = pos.z - cam.position.z;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const scale = 500 / Math.max(distance, 50);

    const screenX = this.dom.canvas.width / 2 + dx * scale;
    const screenY = this.dom.canvas.height / 2 - dy * scale;

    return {
      x: screenX,
      y: screenY,
      scale: Math.max(0.1, scale / 5),
      depth: distance,
    };
  }

  // Working render function
  workingRender() {
    // Clear canvas
    this.ctx.fillStyle = "#0a0c12";
    this.ctx.fillRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);

    if (!this.neurons || this.neurons.length === 0) {
      this.ctx.fillStyle = "#ff0000";
      this.ctx.font = "20px Arial";
      this.ctx.fillText("Network not created!", 100, 100);
      return;
    }

    // Render neurons with simple projection
    this.neurons.forEach((neuron, i) => {
      const projected = this.simpleProject3D(neuron.position);

      if (
        projected.x < -100 ||
        projected.x > this.dom.canvas.width + 100 ||
        projected.y < -100 ||
        projected.y > this.dom.canvas.height + 100
      ) {
        return;
      }

      const radius = Math.max(5, 15 * projected.scale);
      const intensity = neuron.pulse / this.config.pulseIntensity;

      // Draw neuron
      const color =
        intensity > 0.1 ? neuron.colors.glow : neuron.colors.primary;
      const brightness = intensity > 0.1 ? 1.0 : 0.8;
      this.ctx.fillStyle = `rgb(${Math.floor(
        color.r * 255 * brightness
      )}, ${Math.floor(color.g * 255 * brightness)}, ${Math.floor(
        color.b * 255 * brightness
      )})`;

      this.ctx.beginPath();
      this.ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Add rim
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    });

    // Debug info - top center and always visible
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.font = "12px Inter, monospace";
    this.ctx.textAlign = "center";
    const zoom = (1800 / this.camera.distance).toFixed(2);
    const debugText = `CAM DIST: ${Math.round(
      this.camera.distance
    )} | ZOOM: ${zoom}x | NEURONS: ${this.neurons.length}`;
    this.ctx.fillText(debugText, this.dom.canvas.width / 2, 30);
    this.ctx.textAlign = "left"; // Reset alignment
  }

  render() {
    // Clear canvas with pure black background
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);

    // Track which neurons have fired recently for cluster visualization
    const now = Date.now();
    const recentlyFired = new Set();
    this.neurons.forEach((neuron) => {
      if (now - (neuron.lastFire || 0) < 500) {
        recentlyFired.add(neuron.id);
      }
    });

    // Render connections: all light grey except between active neurons in same cluster
    this.connections.forEach((conn) => {
      const startProj = this.project3D(conn.from.position);
      const endProj = this.project3D(conn.to.position);

      // Check if BOTH neurons have fired recently AND are in the same cluster
      const bothFiredRecently =
        recentlyFired.has(conn.from.id) && recentlyFired.has(conn.to.id);
      const sameCluster =
        Math.floor(conn.from.id / (this.config.networkSize / 4)) ===
        Math.floor(conn.to.id / (this.config.networkSize / 4));

      if (bothFiredRecently && sameCluster) {
        // Active connection within the same cluster - highlight with that cluster's color
        const activeColor = conn.from.colors.glow;
        this.ctx.strokeStyle = `rgba(${Math.floor(
          activeColor.r * 255
        )}, ${Math.floor(activeColor.g * 255)}, ${Math.floor(
          activeColor.b * 255
        )}, 0.8)`;
        this.ctx.lineWidth = 0.6; // Slightly thicker for active connections
      } else {
        // Inactive connection - extremely thin grey line
        this.ctx.strokeStyle = `rgba(189, 189, 189, 0.15)`; // Very light grey
        this.ctx.lineWidth = 0.2; // Ultra-thin inactive connections
      }

      this.ctx.beginPath();
      this.ctx.moveTo(startProj.x, startProj.y);
      this.ctx.lineTo(endProj.x, endProj.y);
      this.ctx.stroke();
    });

    // Render neurons with zoom-responsive scaling
    this.neurons.forEach((neuron) => {
      const projected = this.project3D(neuron.position);

      // Skip if way off screen (but allow negative depth for now)
      if (
        projected.x < -200 ||
        projected.x > this.dom.canvas.width + 200 ||
        projected.y < -200 ||
        projected.y > this.dom.canvas.height + 200
      ) {
        return;
      }

      // Zoom-responsive neuron size - much smaller base size
      const baseRadius = 8; // Reduced from 12 to 4
      const radius = Math.max(
        1.5,
        baseRadius *
          projected.scale *
          (projected.zoomFactor || 1) *
          this.config.neuronSize
      );
      const intensity = neuron.pulse / this.config.pulseIntensity;

      // Check if this neuron or its cluster is active
      const isActive = intensity > 0.1;
      const clusterId = Math.floor(neuron.id / (this.config.networkSize / 4));

      // Check if any neuron in this cluster has fired recently
      let clusterActive = isActive;
      if (!clusterActive) {
        // Only check for cluster activity if the neuron itself isn't active
        for (let i = 0; i < this.neurons.length; i++) {
          if (Math.floor(i / (this.config.networkSize / 4)) === clusterId) {
            const otherNeuron = this.neurons[i];
            if (otherNeuron.pulse / this.config.pulseIntensity > 0.1) {
              clusterActive = true;
              break;
            }
          }
        }
      }

      // Draw glow effect when firing - scales with zoom
      if (isActive) {
        const glowRadius = radius * (1.8 + intensity * 2.0);
        const gradient = this.ctx.createRadialGradient(
          projected.x,
          projected.y,
          0,
          projected.x,
          projected.y,
          glowRadius
        );

        const glowColor = neuron.colors.glow;
        gradient.addColorStop(
          0,
          `rgba(${Math.floor(glowColor.r * 255)}, ${Math.floor(
            glowColor.g * 255
          )}, ${Math.floor(glowColor.b * 255)}, ${intensity * 0.6})`
        );
        gradient.addColorStop(
          0.5,
          `rgba(${Math.floor(glowColor.r * 255)}, ${Math.floor(
            glowColor.g * 255
          )}, ${Math.floor(glowColor.b * 255)}, ${intensity * 0.3})`
        );
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(projected.x, projected.y, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Draw neuron body as square - use grey for inactive clusters, color for active ones
      const depthFade = Math.min(1, 800 / Math.max(20, projected.depth));
      const squareSize = radius * 2; // Convert radius to square size

      if (clusterActive) {
        // Use cluster color for active clusters
        const color = isActive ? neuron.colors.glow : neuron.colors.primary;
        const brightness = (isActive ? 1.0 : 0.9) * depthFade;

        this.ctx.fillStyle = `rgba(${Math.floor(
          color.r * 255 * brightness
        )}, ${Math.floor(color.g * 255 * brightness)}, ${Math.floor(
          color.b * 255 * brightness
        )}, 0.5)`; // 50% opacity
      } else {
        // Use grey for inactive clusters
        const greyLevel = Math.floor(150 * depthFade);
        this.ctx.fillStyle = `rgba(${greyLevel}, ${greyLevel}, ${greyLevel}, 0.5)`; // 50% opacity
      }

      // Draw square neuron
      this.ctx.fillRect(
        projected.x - squareSize / 2,
        projected.y - squareSize / 2,
        squareSize,
        squareSize
      ); // Draw thin solid border
      this.ctx.strokeStyle = clusterActive
        ? `rgba(${Math.floor(
            (isActive ? neuron.colors.glow : neuron.colors.primary).r *
              255 *
              depthFade
          )}, ${Math.floor(
            (isActive ? neuron.colors.glow : neuron.colors.primary).g *
              255 *
              depthFade
          )}, ${Math.floor(
            (isActive ? neuron.colors.glow : neuron.colors.primary).b *
              255 *
              depthFade
          )}, 0.9)`
        : `rgba(200, 200, 200, 0.7)`;
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([]); // Ensure solid line
      this.ctx.strokeRect(
        projected.x - squareSize / 2,
        projected.y - squareSize / 2,
        squareSize,
        squareSize
      ); // Draw neuron ID number inside the square
      if (squareSize > 12) {
        // Only show numbers when square is large enough
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * depthFade})`; // White text with fade
        this.ctx.font = `${Math.max(
          8,
          Math.min(12, squareSize * 0.4)
        )}px Inter, monospace`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(neuron.id.toString(), projected.x, projected.y);
      }

      // Highlight selected neuron with premium neural accent color
      if (neuron === this.state.selectedNeuron) {
        this.ctx.strokeStyle = "#374E84"; // Use accent-neural
        this.ctx.lineWidth = Math.max(2, squareSize * 0.1);
        this.ctx.strokeRect(
          projected.x - squareSize / 2,
          projected.y - squareSize / 2,
          squareSize,
          squareSize
        );
      }

      // Show weight information panels if enabled
      if (
        this.state.showWeights &&
        neuron.connections.length > 0 &&
        radius > 8
      ) {
        this.renderWeightPanel(neuron, projected);
      }
    });

    // Debug info - top center and always visible
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.font = "12px Inter, monospace";
    this.ctx.textAlign = "center";
    const zoom = (1800 / this.camera.distance).toFixed(2);
    const debugText = `CAM DIST: ${Math.round(
      this.camera.distance
    )} | ZOOM: ${zoom}x | NEURONS: ${this.neurons.length}`;
    this.ctx.fillText(debugText, this.dom.canvas.width / 2, 30);
    this.ctx.textAlign = "left"; // Reset alignment
  }

  renderWeightPanel(neuron, projected) {
    // Draw a small panel near the neuron showing its outgoing weights
    const panelWidth = 90;
    const panelHeight = 18 + Math.min(5, neuron.connections.length) * 14;
    const x = projected.x + 18;
    const y = projected.y - panelHeight / 2;
    this.ctx.save();
    this.ctx.globalAlpha = 0.92;
    this.ctx.fillStyle = "#181b22";
    this.ctx.strokeStyle = "#374E84";
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, panelWidth, panelHeight, 6);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.globalAlpha = 1.0;
    this.ctx.fillStyle = "#b5b7c3";
    this.ctx.font = "11px Inter, monospace";
    this.ctx.textAlign = "left";
    this.ctx.fillText("Weights:", x + 8, y + 14);
    for (let i = 0; i < Math.min(5, neuron.connections.length); i++) {
      const conn = neuron.connections[i];
      this.ctx.fillStyle = "#b5b7c3";
      this.ctx.fillText(
        `→ ${conn.to.id}: ${conn.weight.toFixed(2)}`,
        x + 8,
        y + 14 + (i + 1) * 13
      );
    }
    this.ctx.restore();
  }

  bindUI() {
    // All the UI binding code
    if (this.dom.playBtn) {
      this.dom.playBtn.addEventListener("click", () => {
        this.state.isRunning = !this.state.isRunning;
        this.dom.playBtn.textContent = this.state.isRunning ? "Pause" : "Play";
        this.dom.playBtn.classList.toggle("on", this.state.isRunning);
      });
    }

    if (this.dom.speedSlider) {
      this.dom.speedSlider.addEventListener("input", (e) => {
        this.state.speed = parseFloat(e.target.value);
      });
    }

    if (this.dom.networkSizeSlider) {
      this.dom.networkSizeSlider.addEventListener("input", (e) => {
        this.config.networkSize = parseInt(e.target.value);
        if (this.dom.sizeValueLabel) {
          this.dom.sizeValueLabel.textContent = this.config.networkSize;
        }
      });

      this.dom.networkSizeSlider.addEventListener("change", () => {
        this.createNetwork();
      });
    }

    if (this.dom.connectionProbSlider) {
      this.dom.connectionProbSlider.addEventListener("input", (e) => {
        this.config.connectionProb = parseFloat(e.target.value);
        if (this.dom.probValueLabel) {
          this.dom.probValueLabel.textContent =
            this.config.connectionProb.toFixed(2);
        }
      });

      this.dom.connectionProbSlider.addEventListener("change", () => {
        this.createNetwork();
      });
    }

    if (this.dom.resetBtn) {
      this.dom.resetBtn.addEventListener("click", () => {
        this.createNetwork();
      });
    }

    if (this.dom.showWeightsBtn) {
      this.dom.showWeightsBtn.addEventListener("click", () => {
        this.state.showWeights = !this.state.showWeights;
        this.dom.showWeightsBtn.classList.toggle("on", this.state.showWeights);
      });
    }

    if (this.dom.injectSpikeBtn) {
      this.dom.injectSpikeBtn.addEventListener("click", () => this.injectSpike());

    window.addEventListener("resize", () => this.resizeCanvas());

    // Initialize camera controls after binding UI
    this.initCameraControls();
  }

  initLessons() {
    // ... (existing initLessons code)
  }

  initTooltips() {
    const infoElements = document.querySelectorAll(".param-info");

    infoElements.forEach((info) => {
      const tooltip = info.querySelector(".tooltip");
      if (!tooltip) return;

      const showTooltip = () => {
        const rect = info.getBoundingClientRect();
        
        // Position tooltip to the right of the icon
        let left = rect.right + 12; // 12px gap
        let top = rect.top + rect.height / 2 - tooltip.offsetHeight / 2;

        // Adjust if it goes off-screen
        if (left + tooltip.offsetWidth > window.innerWidth) {
          left = rect.left - tooltip.offsetWidth - 12;
        }
        if (top < 0) {
          top = 10;
        }
        if (top + tooltip.offsetHeight > window.innerHeight) {
          top = window.innerHeight - tooltip.offsetHeight - 10;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };

      info.addEventListener("mouseenter", showTooltip);
      // Also recalculate on click in case content changes
      info.addEventListener("mousedown", showTooltip); 
    });
  }

  async showFullLesson(lessonNumber) {
    const lessonContentDiv = document.getElementById("lessonContent");
    const modal = document.createElement("div");
    modal.className = "lesson-modal";

    const modalContent = document.createElement("div");
    modalContent.className = "lesson-modal-content";

    // Directly use the loaded HTML file content
    modalContent.innerHTML = `
      <button class="close-btn">&times;</button>
      ${lessonContentDiv.innerHTML}
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b;">
        <button class="btn" onclick="this.closest('.lesson-modal').remove()">CLOSE LESSON</button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Close modal functionality
    const closeBtn = modalContent.querySelector(".close-btn");
    const closeModal = () => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    };

    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Close on escape key
    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", handleKeydown);
      }
    };
    document.addEventListener("keydown", handleKeydown);
  }

  getFullLessonContent(lessonNumber) {
    const lessons = {
      1: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 1: Basic Spike Dynamics</h1>
        <p>Spiking Neural Networks (SNNs) use discrete spikes to communicate information, unlike traditional neural networks that use continuous values. This fundamental difference makes SNNs more biologically realistic and energy-efficient.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Key Concepts</h2>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Membrane Potential</h3>
        <p>The voltage inside a neuron that accumulates over time. In our simulation, this is represented by the <code style="background: #1e293b; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace;">voltage</code> property of each neuron. As the neuron receives inputs from connected neurons, its membrane potential increases.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Threshold</h3>
        <p>When the membrane potential reaches this critical level (typically 1.0 in our simulation), the neuron fires a spike. This is the fundamental mechanism that determines when information is transmitted.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Spike Generation</h3>
        <p>A brief electrical pulse sent to all connected neurons when the threshold is reached. This pulse is what we visualize as spikes in the network.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Reset Mechanism</h3>
        <p>After firing, the membrane potential returns to 0, preparing the neuron for the next accumulation cycle. This prevents continuous firing and creates the discrete nature of spikes.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Interactive Exploration</h2>
        <p>Try adjusting the following parameters to see how they affect spike dynamics:</p>
        <ul style="margin-left: 20px;">
          <li style="margin-bottom: 8px;"><strong style="color: #ff9bf0;">Network Size:</strong> More neurons create more complex spike patterns</li>
          <li style="margin-bottom: 8px;"><strong style="color: #ff9bf0;">Connection Probability:</strong> Higher values create more interconnected networks</li>
          <li style="margin-bottom: 8px;"><strong style="color: #ff9bf0;">Firing Rate:</strong> Controls how often neurons spontaneously fire</li>
          <li style="margin-bottom: 8px;"><strong style="color: #ff9bf0;">Spike Threshold:</strong> Lower values make neurons fire more easily</li>
        </ul>
        <p>Watch how spikes propagate through the network and create cascading patterns of activity!</p>
      `,
      2: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 2: Synaptic Transmission</h1>
        <p>Understanding how spikes travel between neurons and how synaptic weights affect signal transmission in spiking neural networks.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Synaptic Connections</h2>
        <p>In our visualization, you can see synapses as the thin grey lines connecting neurons. These connections have different strengths (weights) that determine how much voltage is transmitted when a spike occurs.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Connection Weights</h3>
        <p>Each synapse has a weight value between 0.1 and 1.0. Stronger connections (higher weights) transmit more voltage, making the receiving neuron more likely to fire.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Spike Propagation</h3>
        <p>When a neuron fires, it sends its spike to all connected neurons simultaneously. The receiving neurons add the weighted input to their membrane potential.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Network Clustering</h2>
        <p>Notice how neurons are organized into clusters with stronger internal connections and weaker connections between clusters. This creates interesting propagation patterns where activity tends to spread within clusters first.</p>
        
        <p><strong style="color: #ff9bf0;">Try this:</strong> Enable "Show Weights" to see detailed connection information for each neuron, and use "Inject Spike" to watch how activity propagates through the network.</p>
      `,
      3: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 3: Network Plasticity</h1>
        <p>How neural networks adapt and learn by modifying their synaptic connections over time.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Hebbian Learning</h2>
        <p>The fundamental principle "neurons that fire together, wire together" governs how connections strengthen when neurons are repeatedly active at the same time.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Synaptic Strengthening</h3>
        <p>When two connected neurons fire within a short time window, their synaptic connection becomes stronger, making future co-activation more likely.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Synaptic Weakening</h3>
        <p>Connections that are rarely used gradually weaken over time, allowing the network to forget unused patterns and focus on relevant information.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Homeostasis</h2>
        <p>Networks maintain stability through homeostatic mechanisms that prevent runaway excitation or complete silence, balancing learning with stable operation.</p>
        
        <p><strong style="color: #ff9bf0;">Observe:</strong> Watch how repeated activation patterns in our network create stronger pathways between frequently co-active neurons.</p>
      `,
      4: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 4: Pattern Recognition</h1>
        <p>How spiking neural networks excel at detecting and learning temporal patterns in spike trains.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Temporal Coding</h2>
        <p>Unlike rate coding, temporal coding uses the precise timing of spikes to encode information, allowing for much faster and more efficient computation.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Spike Time Dependent Plasticity</h3>
        <p>The timing between pre- and post-synaptic spikes determines whether connections strengthen or weaken, enabling learning of temporal sequences.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Feature Detection</h3>
               <p>Specialized neurons can learn to respond to specific temporal patterns, acting as feature detectors for complex spatiotemporal inputs.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Competition and Selection</h2>
        <p>Winner-take-all mechanisms ensure that only the most relevant patterns survive, creating selective responses to important features.</p>
        
        <p><strong style="color: #ff9bf0;">Experiment:</strong> Use the "Inject Spike" button to create different activation patterns and observe how they propagate through different clusters in unique ways.</p>
      `,
      5: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 5: Network Topology</h1>
        <p>Understanding how the organization and structure of neural networks affects information processing and computational capabilities.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Small-World Networks</h2>
        <p>Brain-like networks exhibit small-world properties: high local clustering combined with short path lengths between distant regions, optimizing both specialized processing and global integration.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Modularity</h3>
        <p>Networks organize into modules (clusters) with dense internal connections and sparse connections between modules, enabling specialized processing while maintaining coordination.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Hub Neurons</h3>
        <p>Highly connected neurons act as hubs, integrating information from multiple sources and facilitating communication across the network.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Hierarchical Structure</h2>
        <p>Multiple scales of organization from local circuits to global networks enable complex information processing and emergent behaviors.</p>
        
        <p><strong style="color: #ff9bf0;">Notice:</strong> Our visualization shows clustered organization where neurons within clusters are more densely connected than those between clusters.</p>
      `,
      6: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 6: Inhibition & Competition</h1>
        <p>How inhibitory mechanisms create selection, attention, and decision-making capabilities in neural networks.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Lateral Inhibition</h2>
        <p>Neighboring neurons suppress each other's activity, creating competitive dynamics that enhance contrast and selectivity in neural responses.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Winner-Take-All</h3>
        <p>Competition between neurons ensures that only the strongest signals survive, implementing selection and attention mechanisms crucial for focused processing.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Excitation-Inhibition Balance</h3>
        <p>The critical ratio between excitatory and inhibitory connections determines network dynamics, stability, and computational capabilities.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Attention Mechanisms</h2>
        <p>Inhibitory circuits can gate information flow, allowing networks to focus on relevant inputs while suppressing distracting information.</p>
        
        <p><strong style="color: #ff9bf0;">Experiment:</strong> Try adjusting the threshold parameter to see how it affects competitive dynamics between neurons and clusters.</p>
      `,
      7: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 7: Multi-layer Processing</h1>
        <p>How hierarchical neural networks extract increasingly complex features through multiple processing stages.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Feature Hierarchy</h2>
        <p>Each layer detects features of increasing complexity, from simple edges and patterns in early layers to complex objects and concepts in deeper layers.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Cortical Columns</h3>
        <p>Functional units that process specific aspects of input, organized in columnar structures that work together to analyze complex patterns.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Feed-forward and Feedback</h3>
        <p>Information flows both bottom-up (sensory input) and top-down (predictions and context), enabling sophisticated processing and learning.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Abstraction Levels</h2>
        <p>Progressive abstraction from concrete sensory data to high-level concepts enables flexible and generalizable representations.</p>
        
        <p><strong style="color: #ff9bf0;">Observe:</strong> Notice how activity patterns in our network create hierarchical processing as signals propagate through connected clusters.</p>
      `,
      8: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 8: Memory Systems</h1>
        <p>How different types of memory emerge from distinct neural network architectures and plasticity mechanisms.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Working Memory</h2>
        <p>Temporary storage through persistent neural activity, maintaining information in active states for immediate use in cognitive tasks.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Long-term Memory</h3>
        <p>Stable information storage through permanent changes in synaptic strengths, enabling retention of knowledge and experiences over time.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Episodic Memory</h3>
        <p>Time-linked sequences of events stored as patterns of neural activity, enabling recall of specific experiences and their temporal context.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Associative Memory</h2>
        <p>Pattern completion and recall mechanisms that retrieve complete memories from partial cues, enabling flexible and robust memory access.</p>
        
        <p><strong style="color: #ff9bf0;">Watch:</strong> Observe how persistent activity in our network clusters creates memory-like behavior where patterns can be sustained over time.</p>
      `,
      9: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 9: Large-Scale Networks</h1>
        <p>How brain-wide coordination enables higher-order cognitive functions and potentially consciousness.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Global Workspace</h2>
        <p>Conscious access through global broadcasting of information across brain networks, enabling integration and flexible cognitive control.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Default Mode Network</h3>
        <p>Resting state activity patterns that maintain global connectivity and prepare the brain for future cognitive demands.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Information Integration</h3>
        <p>Binding of distributed processing across brain regions to create unified perceptual and cognitive experiences.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Critical Dynamics</h2>
        <p>Networks operating at the edge of chaos exhibit optimal information processing, flexibility, and computational capabilities.</p>
        
        <p><strong style="color: #ff9bf0;">Observe:</strong> Watch how activity spreads across the entire network, demonstrating global integration of distributed processing.</p>
      `,
      10: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 10: Neural Oscillations</h1>
        <p>How rhythmic neural activity coordinates processing across brain regions and enables temporal organization.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Gamma Rhythms</h2>
        <p>High-frequency oscillations (30-100 Hz) that coordinate local processing, attention, and conscious awareness within brain regions.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Alpha and Beta Rhythms</h3>
        <p>Medium-frequency oscillations (8-30 Hz) that facilitate communication between brain regions and regulate information flow.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Theta Rhythms</h3>
        <p>Low-frequency oscillations (4-8 Hz) crucial for memory formation, spatial navigation, and temporal sequence encoding.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Phase Coupling</h2>
        <p>Synchronization of oscillations across brain regions enables temporal coordination and binding of distributed processing.</p>
        
        <p><strong style="color: #ff9bf0;">Look for:</strong> Rhythmic patterns in the voltage traces and synchronized activity between connected neurons in our simulation.</p>
      `,
      11: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 11: Brain Emulation Theory</h1>
        <p>The ultimate goal of computational neuroscience: creating complete functional copies of biological brains.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Whole Brain Emulation</h2>
        <p>Creating digital copies of specific brains that preserve individual personality, memories, and cognitive patterns through detailed neural simulation.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Scanning Technology</h3>
        <p>Advanced imaging techniques needed to map every neuron, synapse, and molecular detail with sufficient resolution for functional reconstruction.</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Computational Requirements</h3>
        <p>Enormous processing power and storage needed to simulate 86 billion neurons and 100 trillion synapses in real-time with biological accuracy.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Technical Challenges</h2>
        <p>Scaling from current small-scale simulations to full brain complexity while maintaining speed, accuracy, and biological fidelity.</p>
        
        <p><strong style="color: #ff9bf0;">Foundation:</strong> Our simple network demonstrates the basic principles that must scale up millions of times for complete brain emulation.</p>
      `,
      12: `
        <h1 style="color: #ff9bf0; font-size: 28px; margin-bottom: 16px;">Lesson 12: Ethics & Future</h1>
        <p>The profound philosophical and ethical questions raised by the possibility of creating digital minds.</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Consciousness Questions</h2>
        <p>Would a perfect neural simulation be conscious? How could we determine consciousness in digital minds, and what are the implications?</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Identity and Continuity</h3>
        <p>What makes you "you" - is it the pattern of neural activity, the physical substrate, or something else? Could there be multiple copies of the same person?</p>
        
        <h3 style="color: #ff9bf0; margin-top: 24px;">Rights and Protections</h3>
        <p>If digital minds are conscious, what rights should they have? Protection from suffering, deletion, unwanted modification, or forced labor?</p>
        
        <h2 style="color: #ff9bf0; font-size: 22px; margin-top: 24px; margin-bottom: 12px;">Our Responsibility</h2>
        <p>As creators of potentially conscious digital minds, we have profound moral obligations to consider their wellbeing, rights, and place in society.</p>
        
        <p><strong style="color: #ff9bf0;">Critical Thinking:</strong> These questions require careful consideration as we advance toward more sophisticated neural simulations and potential digital consciousness.</p>
      `,
    };

    return lessons[lessonNumber] || null;
  }

  getFallbackContent(lessonNumber) {
    const fallbackContent = {
      1: `
        <h2>Basic Spike Dynamics</h2>
        <p>Spiking Neural Networks use discrete spikes to communicate information. Key concepts include:</p>
        <ul>
          <li><strong>Membrane Potential:</strong> Voltage that accumulates over time</li>
          <li><strong>Threshold:</strong> Critical level that triggers spike firing</li>
          <li><strong>Spike:</strong> Brief electrical pulse sent to connected neurons</li>
          <li><strong>Reset:</strong> Return to baseline voltage after firing</li>
        </ul>
        <p>Experiment with the network parameters to see how these dynamics affect spike propagation!</p>
      `,
      2: `
        <h2>Synaptic Transmission</h2>
        <p>Spikes travel through synaptic connections between neurons:</p>
        <ul>
          <li><strong>Synapses:</strong> Connections visible as grey lines</li>
          <li><strong>Weights:</strong> Connection strength affecting signal transmission</li>
          <li><strong>Propagation:</strong> How spikes spread through the network</li>
          <li><strong>Clustering:</strong> Groups of neurons that fire together</li>
        </ul>
        <p>Enable "Show Weights" to see detailed connection information for each neuron.</p>
      `,
      3: `
        <h2>Network Plasticity</h2>
        <p>Networks adapt and learn through connection modifications:</p>
        <ul>
          <li><strong>Hebbian Learning:</strong> "Neurons that fire together, wire together"</li>
          <li><strong>Strengthening:</strong> Frequently used connections become stronger</li>
          <li><strong>Weakening:</strong> Unused connections fade over time</li>
          <li><strong>Homeostasis:</strong> Balance between stability and adaptability</li>
        </ul>
        <p>Watch how network patterns evolve as neurons interact over time.</p>
      `,
      4: `
        <h2>Pattern Recognition</h2>
        <p>SNNs excel at temporal pattern detection:</p>
        <ul>
          <li><strong>Temporal Coding:</strong> Information in spike timing</li>
          <li><strong>Feature Detection:</strong> Specialized neural responses</li>
          <li><strong>Competition:</strong> Winner-take-all mechanisms</li>
          <li><strong>Real-time Processing:</strong> Event-driven computation</li>
        </ul>
        <p>Use "Inject Spike" to trigger patterns and observe how they propagate through different clusters.</p>
      `,
    };

    return (
      fallbackContent[lessonNumber] || "<p>Lesson content not available.</p>"
    );
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.updateCameraPosition();

    if (this.state.isRunning) {
      this.updateNetwork();
    }

    this.render();
  }
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  if (typeof THREE === "undefined") {
    console.warn("THREE.js not found, using fallback");
  }

  try {
    new SNNVisualizer();
  } catch (error) {
    console.error("Failed to initialize SNN Visualizer:", error);
    const errEl = document.getElementById("err");
    if (errEl) {
      errEl.textContent = "Failed to initialize neural network visualization.";
      errEl.style.display = "block";
    }
  }
});

// Remove emergency fallback - it causes the wrong style flash
