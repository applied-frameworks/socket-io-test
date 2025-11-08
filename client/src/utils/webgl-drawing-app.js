/**
 * WebGL Drawing App - ES6 Module for React Integration
 * Collaborative drawing canvas with Socket.IO support
 */

export class WebGLDrawingApp {
  constructor(options = {}) {
    // Required options
    this.canvas = options.canvas;
    this.previewCanvas = options.previewCanvas;
    this.container = options.container;
    this.documentId = options.documentId;
    this.userId = options.userId;
    this.socket = options.socket;

    if (!this.canvas || !this.previewCanvas || !this.container) {
      throw new Error('Canvas, preview canvas, and container are required');
    }

    // Initialize WebGL context with alpha disabled for opaque background
    const glOptions = {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    };
    this.gl = this.canvas.glContext = this.canvas.getContext('webgl2', glOptions) ||
                                      this.canvas.getContext('webgl', glOptions);
    this.previewCtx = this.previewCanvas.getContext('2d');

    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    // Drawing state
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    this.currentFillColor = { r: 1.0, g: 1.0, b: 1.0, a: 0.0 };
    this.brushSize = 5;
    this.lastX = 0;
    this.lastY = 0;

    // Shape drawing state
    this.shapeStartX = 0;
    this.shapeStartY = 0;

    // Selection and resize state
    this.selectedShape = null;
    this.isResizing = false;
    this.isMoving = false;
    this.resizeHandle = null;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.moveStartX = 0;
    this.moveStartY = 0;
    this.shapeOriginalBounds = null;

    // Store drawing strokes
    this.strokes = [];
    this.currentStroke = null;

    // Track last mouse position
    this.lastMouseEvent = null;

    // Animation frame ID for cleanup
    this.animationFrameId = null;

    // Bound event handlers (for cleanup)
    this.boundHandlers = new Map();

    this.init();
  }

  init() {
    this.resizeCanvas();
    this.setupWebGL();
    this.setupEventListeners();

    // Start render loop
    this.render();
  }

  resizeCanvas() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;

    // Resize preview canvas too
    this.previewCanvas.width = this.canvas.width;
    this.previewCanvas.height = this.canvas.height;

    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

      // Reset clear color and clear canvas after resize
      // (resizing the canvas clears it to transparent)
      this.gl.clearColor(0.0, 0.0, 0.0, 1.0); // Pure black background
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    // Ensure preview canvas is transparent
    if (this.previewCtx) {
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }
  }

  setupWebGL() {
    const gl = this.gl;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      varying vec4 v_color;

      void main() {
        vec2 clipSpace = ((a_position / u_resolution) * 2.0 - 1.0) * vec2(1, -1);
        gl_Position = vec4(clipSpace, 0, 1);
        v_color = a_color;
      }
    `;

    // Fragment shader
    const fragmentShaderSource = `
      precision mediump float;
      varying vec4 v_color;

      void main() {
        gl_FragColor = v_color;
      }
    `;

    // Compile shaders
    const vertexShader = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

    // Create program
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Program linking failed:', gl.getProgramInfoLog(this.program));
      return;
    }

    // Get attribute and uniform locations
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.colorLocation = gl.getAttribLocation(this.program, 'a_color');
    this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');

    // Create buffers
    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();

    // Enable blending for smooth lines
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Clear canvas
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Pure black background
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  setupEventListeners() {
    // Mouse events on canvas
    const handlers = {
      mousedown: (e) => this.handleMouseDown(e),
      mousemove: (e) => this.handleMouseMove(e),
      mouseup: () => this.handleMouseUp(),
      mouseout: () => this.handleMouseOut(),
      touchstart: (e) => this.handleTouchStart(e),
      touchmove: (e) => this.handleTouchMove(e),
      touchend: (e) => this.handleTouchEnd(e)
    };

    for (const [event, handler] of Object.entries(handlers)) {
      this.canvas.addEventListener(event, handler);
      this.boundHandlers.set(event, handler);
    }

    // Global mouse events for resize/move
    const documentMouseMove = (e) => this.handleDocumentMouseMove(e);
    const documentMouseUp = (e) => this.handleDocumentMouseUp(e);

    document.addEventListener('mousemove', documentMouseMove, { passive: false });
    document.addEventListener('mouseup', documentMouseUp);

    this.boundHandlers.set('document-mousemove', documentMouseMove);
    this.boundHandlers.set('document-mouseup', documentMouseUp);

    // Window resize
    const windowResize = () => {
      this.resizeCanvas();
      this.redrawAllStrokes();

      // Update selection box if a shape is selected
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
    };
    window.addEventListener('resize', windowResize);
    this.boundHandlers.set('window-resize', windowResize);

    // Handle mousedown on resize handles
    const containerMouseDown = (e) => this.handleContainerMouseDown(e);
    this.container.addEventListener('mousedown', containerMouseDown, true);
    this.boundHandlers.set('container-mousedown', containerMouseDown);

    // Keyboard event listeners for shortcuts
    const keydownHandler = (e) => {
      // Delete/Backspace to delete selected shape
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedShape) {
          e.preventDefault();
          this.deleteSelectedShape();
        }
      }
      // Escape to deselect
      else if (e.key === 'Escape') {
        if (this.selectedShape) {
          e.preventDefault();
          this.clearSelection();
        }
      }
    };

    document.addEventListener('keydown', keydownHandler);
    this.boundHandlers.set('keydown', keydownHandler);
  }

  handleMouseDown(e) {
    if (this.isResizing || this.isMoving) return;
    this.lastMouseEvent = e;
    this.startDrawing(e);
  }

  handleMouseMove(e) {
    if (this.isResizing || this.isMoving) return;
    this.lastMouseEvent = e;
    this.updateCursor(e);
    this.draw(e);
  }

  handleMouseUp() {
    if (!this.isResizing && !this.isMoving) {
      this.stopDrawing();
    }
  }

  handleMouseOut() {
    if (!this.isResizing && !this.isMoving) {
      this.stopDrawing();
    }
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.startDrawing(touch);
  }

  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.draw(touch);
  }

  handleTouchEnd(e) {
    e.preventDefault();
    this.stopDrawing();
  }

  handleDocumentMouseMove(e) {
    if (this.isResizing || this.isMoving) {
      e.preventDefault();
      const canvasRect = this.canvas.getBoundingClientRect();
      const mouseX = (e.clientX - canvasRect.left) * (this.canvas.width / canvasRect.width);
      const mouseY = (e.clientY - canvasRect.top) * (this.canvas.height / canvasRect.height);

      if (this.isResizing) {
        this.resizeShape(mouseX, mouseY);
      } else if (this.isMoving) {
        this.moveShape(mouseX, mouseY);
      }
    }
  }

  handleDocumentMouseUp(e) {
    if (this.isResizing || this.isMoving) {
      this.stopDrawing();
    }
  }

  handleContainerMouseDown(e) {
    if (e.target.classList.contains('selection-handle')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const handle = e.target.dataset.handle;
      const canvasRect = this.canvas.getBoundingClientRect();
      const mouseX = (e.clientX - canvasRect.left) * (this.canvas.width / canvasRect.width);
      const mouseY = (e.clientY - canvasRect.top) * (this.canvas.height / canvasRect.height);

      this.isResizing = true;
      this.resizeHandle = handle;
      this.resizeStartX = mouseX;
      this.resizeStartY = mouseY;

      this.shapeOriginalBounds = {
        x1: this.selectedShape.x1,
        y1: this.selectedShape.y1,
        x2: this.selectedShape.x2,
        y2: this.selectedShape.y2
      };
    }
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  startDrawing(e) {
    const pos = this.getMousePos(e);

    // Handle select tool
    if (this.currentTool === 'select') {
      if (this.isResizing) return;

      // Check if clicking on the selected shape (to move it)
      if (this.selectedShape) {
        const clickedShape = this.getShapeAt(pos.x, pos.y);
        if (clickedShape && clickedShape.id === this.selectedShape.id) {
          this.isMoving = true;
          this.moveStartX = pos.x;
          this.moveStartY = pos.y;
          this.shapeOriginalBounds = {
            x1: this.selectedShape.x1,
            y1: this.selectedShape.y1,
            x2: this.selectedShape.x2,
            y2: this.selectedShape.y2
          };
          return;
        }
      }

      // Check if clicking on a different shape
      const clickedShape = this.getShapeAt(pos.x, pos.y);
      if (clickedShape) {
        this.selectShape(clickedShape);
      } else {
        this.clearSelection();
      }
      return;
    }

    this.isDrawing = true;
    this.lastX = pos.x;
    this.lastY = pos.y;

    // For shape tools, store start position
    if (this.isShapeTool()) {
      this.shapeStartX = pos.x;
      this.shapeStartY = pos.y;
      return;
    }

    // Start a new stroke for brush/eraser
    this.currentStroke = {
      id: this.generateShapeId(),
      userId: this.userId,
      tool: this.currentTool,
      color: { ...this.currentColor },
      size: this.brushSize,
      points: [pos]
    };
  }

  isShapeTool() {
    return ['rectangle', 'triangle', 'ellipse'].includes(this.currentTool);
  }

  draw(e) {
    const pos = this.getMousePos(e);

    if (!this.isDrawing) return;

    // Handle shape tools with preview
    if (this.isShapeTool()) {
      this.drawShapePreview(this.shapeStartX, this.shapeStartY, pos.x, pos.y);
      return;
    }

    // Add point to current stroke for brush/eraser
    this.currentStroke.points.push(pos);

    // Draw line segment
    this.drawLine(
      this.lastX, this.lastY,
      pos.x, pos.y,
      this.currentStroke.color,
      this.currentStroke.size,
      this.currentTool === 'eraser'
    );

    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  stopDrawing() {
    // Handle move end
    if (this.isMoving) {
      this.isMoving = false;

      // Emit shape update via socket
      if (this.socket && this.selectedShape) {
        this.emitShapeUpdate(this.selectedShape);
      }

      this.shapeOriginalBounds = null;
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
      return;
    }

    // Handle resize end
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;

      // Emit shape update via socket
      if (this.socket && this.selectedShape) {
        this.emitShapeUpdate(this.selectedShape);
      }

      this.shapeOriginalBounds = null;
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
      return;
    }

    if (!this.isDrawing) return;

    // Handle shape tools
    if (this.isShapeTool()) {
      const rect = this.canvas.getBoundingClientRect();
      const lastMouseEvent = this.lastMouseEvent || { clientX: rect.left, clientY: rect.top };
      const pos = this.getMousePos(lastMouseEvent);
      this.finalizeShape(this.shapeStartX, this.shapeStartY, pos.x, pos.y);
      this.clearPreview();
      this.isDrawing = false;
      return;
    }

    // Handle brush/eraser - convert to shape and emit
    if (this.currentStroke && this.currentStroke.points.length > 0) {
      // Convert stroke to shape format for persistence
      const brushShape = {
        id: this.generateShapeId(),
        userId: this.userId,
        tool: this.currentStroke.tool,
        color: { ...this.currentStroke.color },
        fillColor: { r: 0, g: 0, b: 0, a: 0 },
        size: this.currentStroke.size,
        x1: this.currentStroke.points[0].x,
        y1: this.currentStroke.points[0].y,
        x2: this.currentStroke.points[this.currentStroke.points.length - 1].x,
        y2: this.currentStroke.points[this.currentStroke.points.length - 1].y,
        customLabel: null,
        points: this.currentStroke.points // Store all points for accurate replay
      };

      this.strokes.push(brushShape);

      // Emit to server for persistence and realtime sync
      this.emitShapeAdd(brushShape);

      this.currentStroke = null;
    }
    this.isDrawing = false;
  }

  drawLine(x1, y1, x2, y2, color, size, isEraser = false) {
    const gl = this.gl;

    // Calculate line segment with thickness
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      this.drawCircle(x1, y1, size, color, isEraser);
      return;
    }

    // Perpendicular vector for line width
    const nx = -dy / dist;
    const ny = dx / dist;
    const halfSize = size / 2;

    // Create quad vertices
    const positions = [
      x1 + nx * halfSize, y1 + ny * halfSize,
      x1 - nx * halfSize, y1 - ny * halfSize,
      x2 + nx * halfSize, y2 + ny * halfSize,
      x2 - nx * halfSize, y2 - ny * halfSize
    ];

    // Set color (background color for eraser)
    const drawColor = isEraser ?
      { r: 0.1, g: 0.1, b: 0.1, a: 1.0 } : color;

    const colors = [
      drawColor.r, drawColor.g, drawColor.b, drawColor.a,
      drawColor.r, drawColor.g, drawColor.b, drawColor.a,
      drawColor.r, drawColor.g, drawColor.b, drawColor.a,
      drawColor.r, drawColor.g, drawColor.b, drawColor.a
    ];

    // Use program
    gl.useProgram(this.program);

    // Upload data to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    // Set uniforms
    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

    // Set attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Draw circles at endpoints for smooth lines
    this.drawCircle(x1, y1, size, color, isEraser);
    this.drawCircle(x2, y2, size, color, isEraser);
  }

  drawCircle(x, y, size, color, isEraser = false) {
    const gl = this.gl;
    const segments = 20;
    const radius = size / 2;

    const positions = [x, y]; // Center point
    const drawColor = isEraser ?
      { r: 0.1, g: 0.1, b: 0.1, a: 1.0 } : color;
    const colors = [drawColor.r, drawColor.g, drawColor.b, drawColor.a];

    // Create circle vertices
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius
      );
      colors.push(drawColor.r, drawColor.g, drawColor.b, drawColor.a);
    }

    // Upload data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    // Use program
    gl.useProgram(this.program);
    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

    // Set attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 2);
  }

  drawShapePreview(x1, y1, x2, y2) {
    this.clearPreview();

    const ctx = this.previewCtx;

    // Convert WebGL color to CSS
    const r = Math.round(this.currentColor.r * 255);
    const g = Math.round(this.currentColor.g * 255);
    const b = Math.round(this.currentColor.b * 255);
    ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.lineWidth = this.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    switch (this.currentTool) {
      case 'rectangle':
        const width = x2 - x1;
        const height = y2 - y1;
        ctx.rect(x1, y1, width, height);
        break;

      case 'triangle':
        const centerX = (x1 + x2) / 2;
        ctx.moveTo(centerX, y1);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        break;

      case 'ellipse':
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;
        const centerEllipseX = (x1 + x2) / 2;
        const centerEllipseY = (y1 + y2) / 2;
        ctx.ellipse(centerEllipseX, centerEllipseY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
    }

    ctx.stroke();
  }

  clearPreview() {
    this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
  }

  finalizeShape(x1, y1, x2, y2) {
    const shape = {
      id: this.generateShapeId(),
      userId: this.userId,
      tool: this.currentTool,
      color: { ...this.currentColor },
      fillColor: { ...this.currentFillColor },
      size: this.brushSize,
      x1, y1, x2, y2,
      customLabel: null
    };

    this.strokes.push(shape);
    this.redrawAllStrokes();

    // Update outline panel
    this.updateOutlinePanel();

    // Emit shape via Socket.IO
    this.emitShapeAdd(shape);
  }

  drawShapeWebGL(shape) {
    const { tool, x1, y1, x2, y2, color, size, fillColor } = shape;

    switch (tool) {
      case 'rectangle':
        this.drawRectangle(x1, y1, x2, y2, color, size, fillColor);
        break;
      case 'triangle':
        this.drawTriangle(x1, y1, x2, y2, color, size, fillColor);
        break;
      case 'ellipse':
        this.drawEllipse(x1, y1, x2, y2, color, size, fillColor);
        break;
    }
  }

  drawRectangle(x1, y1, x2, y2, color, lineWidth, fillColor) {
    // Draw fill if it has opacity
    if (fillColor && fillColor.a > 0) {
      this.drawRectangleFill(x1, y1, x2, y2, fillColor);
    }

    // Draw four lines to form rectangle stroke
    this.drawLine(x1, y1, x2, y1, color, lineWidth); // Top
    this.drawLine(x2, y1, x2, y2, color, lineWidth); // Right
    this.drawLine(x2, y2, x1, y2, color, lineWidth); // Bottom
    this.drawLine(x1, y2, x1, y1, color, lineWidth); // Left
  }

  drawRectangleFill(x1, y1, x2, y2, fillColor) {
    const gl = this.gl;

    const positions = [
      x1, y1,
      x2, y1,
      x1, y2,
      x2, y2
    ];

    const colors = [
      fillColor.r, fillColor.g, fillColor.b, fillColor.a,
      fillColor.r, fillColor.g, fillColor.b, fillColor.a,
      fillColor.r, fillColor.g, fillColor.b, fillColor.a,
      fillColor.r, fillColor.g, fillColor.b, fillColor.a
    ];

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  drawTriangle(x1, y1, x2, y2, color, lineWidth, fillColor) {
    const centerX = (x1 + x2) / 2;

    // Draw fill if it has opacity
    if (fillColor && fillColor.a > 0) {
      this.drawTriangleFill(centerX, y1, x1, y2, x2, y2, fillColor);
    }

    // Draw three lines to form triangle stroke
    this.drawLine(centerX, y1, x1, y2, color, lineWidth); // Left side
    this.drawLine(x1, y2, x2, y2, color, lineWidth); // Bottom
    this.drawLine(x2, y2, centerX, y1, color, lineWidth); // Right side
  }

  drawTriangleFill(x1, y1, x2, y2, x3, y3, fillColor) {
    const gl = this.gl;

    const positions = [x1, y1, x2, y2, x3, y3];
    const colors = [
      fillColor.r, fillColor.g, fillColor.b, fillColor.a,
      fillColor.r, fillColor.g, fillColor.b, fillColor.a,
      fillColor.r, fillColor.g, fillColor.b, fillColor.a
    ];

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  drawEllipse(x1, y1, x2, y2, color, lineWidth, fillColor) {
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const segments = 50;

    // Draw fill if it has opacity
    if (fillColor && fillColor.a > 0) {
      this.drawEllipseFill(centerX, centerY, radiusX, radiusY, fillColor, segments);
    }

    // Draw ellipse as connected line segments
    let prevX = centerX + radiusX;
    let prevY = centerY;

    for (let i = 1; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;

      this.drawLine(prevX, prevY, x, y, color, lineWidth);

      prevX = x;
      prevY = y;
    }
  }

  drawEllipseFill(centerX, centerY, radiusX, radiusY, fillColor, segments) {
    const gl = this.gl;

    const positions = [centerX, centerY]; // Center point
    const colors = [fillColor.r, fillColor.g, fillColor.b, fillColor.a];

    // Create circle vertices
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions.push(
        centerX + Math.cos(angle) * radiusX,
        centerY + Math.sin(angle) * radiusY
      );
      colors.push(fillColor.r, fillColor.g, fillColor.b, fillColor.a);
    }

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 2);
  }

  updateCursor(e) {
    if (this.currentTool !== 'select') return;
    if (this.isResizing || this.isMoving) return;

    const pos = this.getMousePos(e);

    // Check if hovering over a resize handle
    const handle = this.getResizeHandleAt(pos.x, pos.y);
    if (handle && this.selectedShape) {
      const cursors = {
        'nw': 'nw-resize',
        'ne': 'ne-resize',
        'sw': 'sw-resize',
        'se': 'se-resize'
      };
      this.canvas.style.cursor = cursors[handle];
      return;
    }

    // Check if hovering over selected shape
    if (this.selectedShape) {
      const hoveredShape = this.getShapeAt(pos.x, pos.y);
      if (hoveredShape && hoveredShape.id === this.selectedShape.id) {
        this.canvas.style.cursor = 'move';
        return;
      }
    }

    this.canvas.style.cursor = 'default';
  }

  getShapeAt(x, y) {
    // Check shapes in reverse order (top to bottom)
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i];

      // Only check shapes, not freehand strokes
      if (stroke.x1 === undefined || stroke.x2 === undefined) continue;

      const bounds = this.getShapeBounds(stroke);
      const padding = 10; // Click tolerance

      if (x >= bounds.minX - padding && x <= bounds.maxX + padding &&
          y >= bounds.minY - padding && y <= bounds.maxY + padding) {
        return stroke;
      }
    }
    return null;
  }

  getShapeBounds(shape) {
    return {
      minX: Math.min(shape.x1, shape.x2),
      maxX: Math.max(shape.x1, shape.x2),
      minY: Math.min(shape.y1, shape.y2),
      maxY: Math.max(shape.y1, shape.y2)
    };
  }

  selectShape(shape) {
    this.selectedShape = shape;
    this.drawSelectionBox(shape);

    // Update outline panel to show selection
    this.updateOutlinePanel();

    // Update UI controls to match selected shape
    if (shape.color) {
      this.currentColor = { ...shape.color };
    }

    if (shape.fillColor) {
      this.currentFillColor = { ...shape.fillColor };
    }
  }

  clearSelection() {
    this.selectedShape = null;
    this.removeSelectionUI();

    // Update outline panel to remove selection
    this.updateOutlinePanel();
  }

  drawSelectionBox(shape) {
    // Remove old selection UI
    this.removeSelectionUI();

    const bounds = this.getShapeBounds(shape);

    // Get canvas display scale factor
    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.canvas.width;
    const scaleY = canvasRect.height / this.canvas.height;

    // Convert canvas coordinates to screen coordinates
    const screenMinX = bounds.minX * scaleX;
    const screenMinY = bounds.minY * scaleY;
    const screenMaxX = bounds.maxX * scaleX;
    const screenMaxY = bounds.maxY * scaleY;

    // Create selection box
    const selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    selectionBox.id = 'selection-box';
    selectionBox.style.left = screenMinX + 'px';
    selectionBox.style.top = screenMinY + 'px';
    selectionBox.style.width = (screenMaxX - screenMinX) + 'px';
    selectionBox.style.height = (screenMaxY - screenMinY) + 'px';
    this.container.appendChild(selectionBox);

    // Create resize handles at four corners
    const handles = [
      { pos: 'nw', x: screenMinX, y: screenMinY, cursor: 'nw-resize' },
      { pos: 'ne', x: screenMaxX, y: screenMinY, cursor: 'ne-resize' },
      { pos: 'sw', x: screenMinX, y: screenMaxY, cursor: 'sw-resize' },
      { pos: 'se', x: screenMaxX, y: screenMaxY, cursor: 'se-resize' }
    ];

    handles.forEach(handle => {
      const div = document.createElement('div');
      div.className = 'selection-handle';
      div.id = `handle-${handle.pos}`;
      div.style.left = (handle.x - 6) + 'px';
      div.style.top = (handle.y - 6) + 'px';
      div.style.cursor = handle.cursor;
      div.dataset.handle = handle.pos;

      this.container.appendChild(div);
    });
  }

  removeSelectionUI() {
    const box = document.getElementById('selection-box');
    if (box) box.remove();

    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
      const handle = document.getElementById(`handle-${pos}`);
      if (handle) handle.remove();
    });
  }

  getResizeHandleAt(x, y) {
    const handles = document.querySelectorAll('.selection-handle');
    for (const handle of handles) {
      const rect = handle.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();

      const screenX = (x / this.canvas.width) * canvasRect.width + canvasRect.left;
      const screenY = (y / this.canvas.height) * canvasRect.height + canvasRect.top;

      if (screenX >= rect.left && screenX <= rect.right &&
          screenY >= rect.top && screenY <= rect.bottom) {
        return handle.dataset.handle;
      }
    }

    return null;
  }

  resizeShape(mouseX, mouseY) {
    if (!this.selectedShape || !this.resizeHandle || !this.shapeOriginalBounds) return;

    const shape = this.selectedShape;
    const original = this.shapeOriginalBounds;

    // Calculate offset from start position
    const deltaX = mouseX - this.resizeStartX;
    const deltaY = mouseY - this.resizeStartY;

    // Update shape coordinates based on which handle is being dragged
    switch (this.resizeHandle) {
      case 'nw':
        shape.x1 = original.x1 + deltaX;
        shape.y1 = original.y1 + deltaY;
        shape.x2 = original.x2;
        shape.y2 = original.y2;
        break;
      case 'ne':
        shape.x1 = original.x1;
        shape.y1 = original.y1 + deltaY;
        shape.x2 = original.x2 + deltaX;
        shape.y2 = original.y2;
        break;
      case 'sw':
        shape.x1 = original.x1 + deltaX;
        shape.y1 = original.y1;
        shape.x2 = original.x2;
        shape.y2 = original.y2 + deltaY;
        break;
      case 'se':
        shape.x1 = original.x1;
        shape.y1 = original.y1;
        shape.x2 = original.x2 + deltaX;
        shape.y2 = original.y2 + deltaY;
        break;
    }

    // Redraw everything
    this.redrawAllStrokes();

    // Update selection box
    this.drawSelectionBox(shape);
  }

  moveShape(mouseX, mouseY) {
    if (!this.selectedShape || !this.shapeOriginalBounds) return;

    const shape = this.selectedShape;
    const original = this.shapeOriginalBounds;

    // Calculate offset from start position
    const deltaX = mouseX - this.moveStartX;
    const deltaY = mouseY - this.moveStartY;

    // Move both corners by the same delta
    shape.x1 = original.x1 + deltaX;
    shape.y1 = original.y1 + deltaY;
    shape.x2 = original.x2 + deltaX;
    shape.y2 = original.y2 + deltaY;

    // Redraw everything
    this.redrawAllStrokes();

    // Update selection box
    this.drawSelectionBox(shape);
  }

  deleteSelectedShape() {
    if (!this.selectedShape) return;

    const shapeToDelete = this.selectedShape;
    const shapeIndex = this.strokes.findIndex(s => s.id === shapeToDelete.id);

    if (shapeIndex === -1) return;

    // Remove from strokes
    this.strokes.splice(shapeIndex, 1);

    // Emit delete via socket
    this.emitShapeDelete(shapeToDelete);

    // Clear selection
    this.clearSelection();

    // Redraw
    this.redrawAllStrokes();

    // Update outline panel
    this.updateOutlinePanel();
  }

  clearCanvas() {
    const gl = this.gl;
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Pure black background
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.strokes = [];
    this.clearSelection();

    // Emit to server to clear shapes from database
    if (this.socket) {
      this.socket.emit('document:clear');
    }
  }

  redrawAllStrokes() {
    const gl = this.gl;
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Pure black background
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Redraw all saved strokes
    for (const stroke of this.strokes) {
      // Check if it's a shape or a freehand stroke
      if (stroke.x1 !== undefined && stroke.x2 !== undefined) {
        // It's a shape
        this.drawShapeWebGL(stroke);
      } else if (stroke.points) {
        // It's a freehand stroke
        for (let i = 1; i < stroke.points.length; i++) {
          const p1 = stroke.points[i - 1];
          const p2 = stroke.points[i];
          this.drawLine(
            p1.x, p1.y,
            p2.x, p2.y,
            stroke.color,
            stroke.size,
            stroke.tool === 'eraser'
          );
        }
      }
    }
  }

  // Socket.IO Integration Methods

  /**
   * Emit shape:add event to server
   */
  emitShapeAdd(shape) {
    if (!this.socket) return;

    const shapeData = this.convertShapeToBackendFormat(shape);
    this.socket.emit('shape:add', shapeData);
  }

  /**
   * Emit shape:update event to server
   */
  emitShapeUpdate(shape) {
    if (!this.socket) return;

    const shapeData = this.convertShapeToBackendFormat(shape);
    this.socket.emit('shape:update', {
      shapeId: shape.id,
      ...shapeData
    });
  }

  /**
   * Emit shape:delete event to server
   */
  emitShapeDelete(shape) {
    if (!this.socket) return;

    this.socket.emit('shape:delete', {
      id: shape.id  // Server expects 'id', not 'shapeId'
    });
  }

  /**
   * Convert internal shape format to backend schema format
   */
  convertShapeToBackendFormat(shape) {
    return {
      id: shape.id,
      documentId: this.documentId,
      type: shape.tool,
      x1: shape.x1,
      y1: shape.y1,
      x2: shape.x2,
      y2: shape.y2,
      strokeColor: JSON.stringify(shape.color),
      fillColor: JSON.stringify(shape.fillColor),
      strokeSize: shape.size,
      customLabel: shape.customLabel,
      points: shape.points ? JSON.stringify(shape.points) : null // For brush/eraser strokes
    };
  }

  /**
   * Convert backend shape format to internal format
   */
  convertShapeFromBackendFormat(backendShape) {
    const shape = {
      id: backendShape.id,
      userId: backendShape.userId,
      tool: backendShape.type,
      color: typeof backendShape.strokeColor === 'string'
        ? JSON.parse(backendShape.strokeColor)
        : backendShape.strokeColor,
      fillColor: typeof backendShape.fillColor === 'string'
        ? JSON.parse(backendShape.fillColor)
        : backendShape.fillColor,
      size: backendShape.strokeSize,
      x1: backendShape.x1,
      y1: backendShape.y1,
      x2: backendShape.x2,
      y2: backendShape.y2,
      customLabel: backendShape.customLabel
    };

    // Add points array for brush/eraser strokes
    if (backendShape.points && typeof backendShape.points === 'string') {
      shape.points = JSON.parse(backendShape.points);
    }

    return shape;
  }

  /**
   * Receive shape from socket and add/update/delete it
   * @param {Object} shape - Shape data from socket
   * @param {String} action - 'add', 'update', or 'delete'
   */
  receiveShape(shape, action) {
    if (action === 'delete') {
      // Remove shape by ID
      this.strokes = this.strokes.filter(s => s.id !== shape.shapeId);
      this.redrawAllStrokes();
      this.updateOutlinePanel();
      return;
    }

    const convertedShape = this.convertShapeFromBackendFormat(shape);

    if (action === 'add') {
      // Add new shape
      this.strokes.push(convertedShape);
      this.drawShapeWebGL(convertedShape);
      this.updateOutlinePanel();
    } else if (action === 'update') {
      // Update existing shape
      const index = this.strokes.findIndex(s => s.id === shape.shapeId || s.id === shape.id);
      if (index !== -1) {
        this.strokes[index] = convertedShape;
        this.redrawAllStrokes();
        this.updateOutlinePanel();
      }
    }
  }

  /**
   * Load initial canvas state from server
   * @param {Object} state - Canvas state with shapes array
   */
  loadState(state) {
    if (!state || !state.shapes) return;

    // Convert all shapes from backend format
    this.strokes = state.shapes.map(shape =>
      this.convertShapeFromBackendFormat(shape)
    );

    // Redraw canvas
    this.redrawAllStrokes();

    // Update outline panel
    this.updateOutlinePanel();
  }

  /**
   * Generate a unique shape ID
   */
  generateShapeId() {
    return `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set the current drawing tool
   */
  setTool(tool) {
    this.currentTool = tool;

    // Clear selection when switching away from select tool
    if (tool !== 'select' && this.selectedShape) {
      this.clearSelection();
    }

    // Update cursor
    if (tool === 'select') {
      this.canvas.style.cursor = 'default';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  /**
   * Set stroke color
   */
  setStrokeColor(hexColor) {
    const r = parseInt(hexColor.substr(1, 2), 16) / 255;
    const g = parseInt(hexColor.substr(3, 2), 16) / 255;
    const b = parseInt(hexColor.substr(5, 2), 16) / 255;

    this.currentColor.r = r;
    this.currentColor.g = g;
    this.currentColor.b = b;

    // Update selected shape color if in select mode
    if (this.selectedShape && this.currentTool === 'select') {
      this.selectedShape.color = { ...this.currentColor };
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
    }
  }

  /**
   * Set fill color
   */
  setFillColor(hexColor) {
    const r = parseInt(hexColor.substr(1, 2), 16) / 255;
    const g = parseInt(hexColor.substr(3, 2), 16) / 255;
    const b = parseInt(hexColor.substr(5, 2), 16) / 255;

    this.currentFillColor.r = r;
    this.currentFillColor.g = g;
    this.currentFillColor.b = b;

    // Update selected shape fill color if in select mode
    if (this.selectedShape && this.currentTool === 'select') {
      this.selectedShape.fillColor = { ...this.currentFillColor };
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
    }
  }

  /**
   * Set stroke opacity (0-100)
   */
  setStrokeOpacity(opacity) {
    this.currentColor.a = opacity / 100;

    if (this.selectedShape && this.currentTool === 'select') {
      this.selectedShape.color.a = this.currentColor.a;
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
    }
  }

  /**
   * Set fill opacity (0-100)
   */
  setFillOpacity(opacity) {
    this.currentFillColor.a = opacity / 100;

    if (this.selectedShape && this.currentTool === 'select') {
      this.selectedShape.fillColor.a = this.currentFillColor.a;
      this.redrawAllStrokes();
      if (this.selectedShape) {
        this.drawSelectionBox(this.selectedShape);
      }
    }
  }

  /**
   * Set brush size
   */
  setBrushSize(size) {
    this.brushSize = size;
  }

  /**
   * Update the outline panel with current shapes
   */
  updateOutlinePanel() {
    const outlineList = document.getElementById('outline-content');
    if (!outlineList) return;

    outlineList.innerHTML = '';

    // Get only shapes (not freehand strokes)
    const shapes = this.strokes.filter(s => s.x1 !== undefined && s.x2 !== undefined);

    if (shapes.length === 0) {
      outlineList.innerHTML = '<div class="outline-empty">No shapes yet. Draw something!</div>';
      return;
    }

    // Create outline items in reverse order (top of list = top layer = last drawn)
    for (let i = shapes.length - 1; i >= 0; i--) {
      const item = this.createOutlineItem(shapes[i], shapes.length - 1 - i);
      outlineList.appendChild(item);
    }
  }

  /**
   * Create an outline item element for a shape
   */
  createOutlineItem(shape, displayIndex) {
    const item = document.createElement('div');
    item.className = 'outline-item';
    item.dataset.shapeId = shape.id;

    // Add selected class if this shape is selected
    if (this.selectedShape && this.selectedShape.id === shape.id) {
      item.classList.add('selected');
    }

    // Icon based on shape type
    const icon = document.createElement('div');
    icon.className = 'outline-icon';
    icon.textContent = this.getShapeIcon(shape.tool);
    item.appendChild(icon);

    // Label
    const label = document.createElement('div');
    label.className = 'outline-label';
    label.textContent = this.getShapeLabel(shape);
    item.appendChild(label);

    // Color indicator
    const colorDiv = document.createElement('div');
    colorDiv.className = 'outline-color';
    const r = Math.round(shape.color.r * 255);
    const g = Math.round(shape.color.g * 255);
    const b = Math.round(shape.color.b * 255);
    colorDiv.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    item.appendChild(colorDiv);

    // Click to select
    item.addEventListener('click', () => {
      this.selectShapeByIndex(displayIndex);
    });

    return item;
  }

  /**
   * Get icon for shape type
   */
  getShapeIcon(tool) {
    const icons = {
      'rectangle': '▭',
      'triangle': '▲',
      'ellipse': '⬭',
      'brush': '✏️',
      'eraser': '🧹'
    };
    return icons[tool] || '●';
  }

  /**
   * Get label for shape
   */
  getShapeLabel(shape) {
    if (shape.customLabel) {
      return shape.customLabel;
    }

    const labels = {
      'rectangle': 'Rectangle',
      'triangle': 'Triangle',
      'ellipse': 'Ellipse'
    };
    return labels[shape.tool] || 'Shape';
  }

  /**
   * Select shape by index in outline panel
   */
  selectShapeByIndex(displayIndex) {
    const shapes = this.strokes.filter(s => s.x1 !== undefined && s.x2 !== undefined);

    // Convert display index to actual array index
    const actualIndex = shapes.length - 1 - displayIndex;

    if (actualIndex >= 0 && actualIndex < shapes.length) {
      const shape = shapes[actualIndex];

      // Switch to select tool if not already
      if (this.currentTool !== 'select') {
        this.setTool('select');
      }

      this.selectShape(shape);
    }
  }

  render() {
    // Animation loop
    this.animationFrameId = requestAnimationFrame(() => this.render());
  }

  /**
   * Cleanup method to remove event listeners and stop animation
   */
  destroy() {
    // Stop animation loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Remove canvas event listeners
    for (const [event, handler] of this.boundHandlers.entries()) {
      if (event.startsWith('document-')) {
        const actualEvent = event.replace('document-', '');
        document.removeEventListener(actualEvent, handler);
      } else if (event.startsWith('window-')) {
        const actualEvent = event.replace('window-', '');
        window.removeEventListener(actualEvent, handler);
      } else if (event.startsWith('container-')) {
        const actualEvent = event.replace('container-', '');
        this.container.removeEventListener(actualEvent, handler);
      } else if (event === 'keydown') {
        document.removeEventListener('keydown', handler);
      } else {
        this.canvas.removeEventListener(event, handler);
      }
    }

    // Clear bound handlers
    this.boundHandlers.clear();

    // Clear selection UI
    this.removeSelectionUI();

    // Clear WebGL context
    if (this.gl) {
      const gl = this.gl;
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer);
      if (this.program) gl.deleteProgram(this.program);
    }
  }
}

export default WebGLDrawingApp;
