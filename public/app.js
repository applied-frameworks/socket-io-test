// WebGL Drawing App with Real-time Collaboration
class WebGLDrawingApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.gl = this.canvas.glContext = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        
        // Preview canvas for shape drawing
        this.previewCanvas = document.getElementById('preview-canvas');
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        if (!this.gl) {
            alert('WebGL not supported');
            return;
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
        this.resizeHandle = null; // 'nw', 'ne', 'sw', 'se'
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.moveStartX = 0;
        this.moveStartY = 0;
        this.shapeOriginalBounds = null;
        this.lastResizeTime = 0;
        
        // Outline panel state
        this.draggedItem = null;
        this.draggedIndex = -1;
        
        // History and undo/redo state
        this.history = [];
        this.currentHistoryIndex = -1;
        this.tempResizeState = null; // Store state before resize starts
        
        // Store drawing strokes for collaboration
        this.strokes = [];
        this.currentStroke = null;
        
        // User ID for collaborative sessions
        this.userId = this.generateUserId();
        
        this.init();
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    init() {
        this.resizeCanvas();
        this.setupWebGL();
        this.setupEventListeners();
        this.setupUI();
        this.updateOutlinePanel();
        this.updateHistoryPanel();
        
        // Start render loop
        this.render();
        
        this.updateStatus('Ready to draw!');
    }

    resizeCanvas() {
        const container = document.getElementById('canvas-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Resize preview canvas too
        this.previewCanvas.width = this.canvas.width;
        this.previewCanvas.height = this.canvas.height;
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
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
        // Track last mouse position for shape finalization
        window.lastMouseEvent = null;
        
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => {
            // Don't start drawing if we're already resizing
            if (this.isResizing || this.isMoving) {
                return;
            }
            window.lastMouseEvent = e;
            this.startDrawing(e);
        });
        this.canvas.addEventListener('mousemove', (e) => {
            // Don't update cursor or draw if we're resizing/moving (handled globally)
            if (this.isResizing || this.isMoving) {
                return;
            }
            window.lastMouseEvent = e;
            this.updateCursor(e);
            this.draw(e);
        });
        this.canvas.addEventListener('mouseup', () => {
            if (!this.isResizing && !this.isMoving) {
                this.stopDrawing();
            }
        });
        this.canvas.addEventListener('mouseout', () => {
            if (!this.isResizing && !this.isMoving) {
                this.stopDrawing();
            }
        });

        // Global mouse events for resize/move (works anywhere in document)
        let pendingUpdate = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        document.addEventListener('mousemove', (e) => {
            if (this.isResizing || this.isMoving) {
                e.preventDefault();
                
                // Store latest mouse position
                const canvasRect = this.canvas.getBoundingClientRect();
                lastMouseX = (e.clientX - canvasRect.left) * (this.canvas.width / canvasRect.width);
                lastMouseY = (e.clientY - canvasRect.top) * (this.canvas.height / canvasRect.height);
                
                // Use requestAnimationFrame to batch updates
                if (!pendingUpdate) {
                    pendingUpdate = true;
                    requestAnimationFrame(() => {
                        if (this.isResizing) {
                            this.resizeShape(lastMouseX, lastMouseY);
                        } else if (this.isMoving) {
                            this.moveShape(lastMouseX, lastMouseY);
                        }
                        pendingUpdate = false;
                    });
                }
            }
        }, { passive: false });
        
        document.addEventListener('mouseup', (e) => {
            if (this.isResizing || this.isMoving) {
                console.log('Mouse up - stopping operation');
                this.stopDrawing();
            }
        });

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.startDrawing(touch);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.draw(touch);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopDrawing();
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.redrawAllStrokes();
        });
        
        // Handle mousedown on resize handles (event delegation from container)
        const container = document.getElementById('canvas-container');
        container.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('selection-handle')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                const handle = e.target.dataset.handle;
                
                // Get mouse position in canvas coordinates
                const canvasRect = this.canvas.getBoundingClientRect();
                const mouseX = (e.clientX - canvasRect.left) * (this.canvas.width / canvasRect.width);
                const mouseY = (e.clientY - canvasRect.top) * (this.canvas.height / canvasRect.height);
                
                this.isResizing = true;
                this.resizeHandle = handle;
                this.resizeStartX = mouseX;
                this.resizeStartY = mouseY;
                
                // Store original bounds for resizing
                this.shapeOriginalBounds = {
                    x1: this.selectedShape.x1,
                    y1: this.selectedShape.y1,
                    x2: this.selectedShape.x2,
                    y2: this.selectedShape.y2
                };
                
                // Store state before resize for history
                this.tempResizeState = {
                    shapeId: this.selectedShape.id,
                    before: { ...this.shapeOriginalBounds }
                };
                
                console.log('Resize started:', handle, 'at', mouseX, mouseY);
            }
        }, true); // Use capture phase
    }

    setupUI() {
        // Panel tabs
        document.getElementById('outline-tab').addEventListener('click', () => {
            this.switchTab('outline');
        });
        
        document.getElementById('history-tab').addEventListener('click', () => {
            this.switchTab('history');
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + Z for undo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Cmd/Ctrl + Shift + Z for redo
            else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
                e.preventDefault();
                this.redo();
            }
        });

        // Select button
        document.getElementById('select-btn').addEventListener('click', () => {
            this.setTool('select');
        });

        // Brush button
        document.getElementById('brush-btn').addEventListener('click', () => {
            this.setTool('brush');
        });

        // Eraser button
        document.getElementById('eraser-btn').addEventListener('click', () => {
            this.setTool('eraser');
        });

        // Shape buttons
        document.getElementById('rectangle-btn').addEventListener('click', () => {
            this.setTool('rectangle');
        });

        document.getElementById('triangle-btn').addEventListener('click', () => {
            this.setTool('triangle');
        });

        document.getElementById('ellipse-btn').addEventListener('click', () => {
            this.setTool('ellipse');
        });

        // Color picker
        document.getElementById('color-picker').addEventListener('input', (e) => {
            this.setStrokeColor(e.target.value);
        });
        
        // Stroke opacity slider
        document.getElementById('stroke-opacity-slider').addEventListener('input', (e) => {
            this.currentColor.a = parseInt(e.target.value) / 100;
            this.updateSelectedShapeColors();
        });
        
        // Fill color picker
        document.getElementById('fill-picker').addEventListener('input', (e) => {
            this.setFillColor(e.target.value);
        });
        
        // Fill opacity slider
        document.getElementById('fill-opacity-slider').addEventListener('input', (e) => {
            this.currentFillColor.a = parseInt(e.target.value) / 100;
            this.updateSelectedShapeColors();
        });

        // Brush size slider
        document.getElementById('size-slider').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
        });
        
        // Delete button
        document.getElementById('delete-btn').addEventListener('click', () => {
            this.deleteSelectedShape();
        });

        // Clear button
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearCanvas();
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        
        // Clear selection when switching away from select tool
        if (tool !== 'select' && this.selectedShape) {
            this.clearSelection();
        }
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${tool}-btn`).classList.add('active');
        
        // Update cursor
        if (tool === 'select') {
            this.canvas.style.cursor = 'default';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
        
        this.updateStatus(`Tool: ${tool}`);
    }

    setStrokeColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16) / 255;
        const g = parseInt(hexColor.substr(3, 2), 16) / 255;
        const b = parseInt(hexColor.substr(5, 2), 16) / 255;
        
        this.currentColor.r = r;
        this.currentColor.g = g;
        this.currentColor.b = b;
        
        this.updateSelectedShapeColors();
    }
    
    setFillColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16) / 255;
        const g = parseInt(hexColor.substr(3, 2), 16) / 255;
        const b = parseInt(hexColor.substr(5, 2), 16) / 255;
        
        this.currentFillColor.r = r;
        this.currentFillColor.g = g;
        this.currentFillColor.b = b;
        
        this.updateSelectedShapeColors();
    }
    
    updateSelectedShapeColors() {
        if (this.selectedShape && this.currentTool === 'select') {
            // Store before state for history
            const beforeState = {
                color: { ...this.selectedShape.color },
                fillColor: { ...this.selectedShape.fillColor }
            };
            
            // Update shape colors
            this.selectedShape.color = { ...this.currentColor };
            this.selectedShape.fillColor = { ...this.currentFillColor };
            
            // Add to history
            this.addToHistory({
                type: 'colorChange',
                shapeId: this.selectedShape.id,
                before: beforeState,
                after: {
                    color: { ...this.selectedShape.color },
                    fillColor: { ...this.selectedShape.fillColor }
                }
            });
            
            // Redraw
            this.redrawAllStrokes();
            this.drawSelectionBox(this.selectedShape);
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
            // If we're already resizing (from handle mousedown), don't do anything
            if (this.isResizing) {
                return;
            }
            
            // Check if clicking on the selected shape (to move it)
            if (this.selectedShape) {
                const clickedShape = this.getShapeAt(pos.x, pos.y);
                if (clickedShape && clickedShape.id === this.selectedShape.id) {
                    this.isMoving = true;
                    this.moveStartX = pos.x;
                    this.moveStartY = pos.y;
                    // Store original bounds for moving
                    this.shapeOriginalBounds = {
                        x1: this.selectedShape.x1,
                        y1: this.selectedShape.y1,
                        x2: this.selectedShape.x2,
                        y2: this.selectedShape.y2
                    };
                    // Store state before move for history
                    this.tempResizeState = {
                        shapeId: this.selectedShape.id,
                        before: { ...this.shapeOriginalBounds }
                    };
                    console.log('Move started at', pos.x, pos.y);
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
            id: Date.now(),
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
        
        // Resize and move are now handled by global document mousemove
        // This only handles drawing operations
        
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
            
            // Add move to history if shape was actually moved
            if (this.tempResizeState) {
                this.addToHistory({
                    type: 'move',
                    shapeId: this.tempResizeState.shapeId,
                    before: this.tempResizeState.before,
                    after: {
                        x1: this.selectedShape.x1,
                        y1: this.selectedShape.y1,
                        x2: this.selectedShape.x2,
                        y2: this.selectedShape.y2
                    }
                });
                this.tempResizeState = null;
            }
            
            this.shapeOriginalBounds = null;
            // Redraw with updated shape
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
            
            // Add resize to history if shape was actually resized
            if (this.tempResizeState) {
                this.addToHistory({
                    type: 'resize',
                    shapeId: this.tempResizeState.shapeId,
                    before: this.tempResizeState.before,
                    after: {
                        x1: this.selectedShape.x1,
                        y1: this.selectedShape.y1,
                        x2: this.selectedShape.x2,
                        y2: this.selectedShape.y2
                    }
                });
                this.tempResizeState = null;
            }
            
            this.shapeOriginalBounds = null;
            // Redraw with updated shape
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
            const lastMouseEvent = window.lastMouseEvent || { clientX: rect.left, clientY: rect.top };
            const pos = this.getMousePos(lastMouseEvent);
            this.finalizeShape(this.shapeStartX, this.shapeStartY, pos.x, pos.y);
            this.clearPreview();
            this.isDrawing = false;
            return;
        }

        // Handle brush/eraser
        if (this.currentStroke) {
            // Save the completed stroke
            this.strokes.push(this.currentStroke);
            
            // Add brush/eraser stroke to history
            this.addToHistory({
                type: 'draw',
                tool: this.currentTool,
                stroke: this.currentStroke
            });
            
            // Emit stroke to other users (placeholder for WebSocket implementation)
            this.emitStroke(this.currentStroke);
            
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
            // Draw a circle for single point
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
        // Clear only the preview canvas (not the main WebGL canvas)
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
            id: Date.now(),
            userId: this.userId,
            tool: this.currentTool,
            color: { ...this.currentColor },
            fillColor: { ...this.currentFillColor },
            size: this.brushSize,
            x1, y1, x2, y2,
            customLabel: null // Will store user's custom label
        };

        this.strokes.push(shape);
        
        // Add to history
        this.addToHistory({
            type: 'create',
            tool: this.currentTool,
            shape: shape
        });
        
        // Redraw all strokes to show the new shape along with existing ones
        this.redrawAllStrokes();
        
        // Update outline panel
        this.updateOutlinePanel();
        
        this.emitStroke(shape);
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
        
        // Create rectangle vertices
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
        
        // Use program
        gl.useProgram(this.program);
        
        // Upload data
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
            // Set appropriate resize cursor
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
        
        // Default cursor for select tool
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
        this.updateOutlinePanel();
        
        // Update UI controls to match selected shape
        if (shape.color) {
            this.currentColor = { ...shape.color };
            const strokeHex = this.rgbToHex(shape.color.r, shape.color.g, shape.color.b);
            document.getElementById('color-picker').value = strokeHex;
            document.getElementById('stroke-opacity-slider').value = Math.round(shape.color.a * 100);
        }
        
        if (shape.fillColor) {
            this.currentFillColor = { ...shape.fillColor };
            const fillHex = this.rgbToHex(shape.fillColor.r, shape.fillColor.g, shape.fillColor.b);
            document.getElementById('fill-picker').value = fillHex;
            document.getElementById('fill-opacity-slider').value = Math.round(shape.fillColor.a * 100);
        }
        
        // Show delete button
        document.getElementById('delete-btn').style.display = 'flex';
        
        this.updateStatus('Shape selected - drag handles to resize, press Delete to remove');
    }
    
    rgbToHex(r, g, b) {
        const toHex = (n) => {
            const hex = Math.round(n * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    clearSelection() {
        this.selectedShape = null;
        this.removeSelectionUI();
        this.updateOutlinePanel();
        
        // Hide delete button
        document.getElementById('delete-btn').style.display = 'none';
    }

    drawSelectionBox(shape) {
        // Remove old selection UI
        this.removeSelectionUI();
        
        const bounds = this.getShapeBounds(shape);
        const rect = this.canvas.getBoundingClientRect();
        const container = document.getElementById('canvas-container');
        
        // Create selection box
        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        selectionBox.id = 'selection-box';
        selectionBox.style.left = bounds.minX + 'px';
        selectionBox.style.top = bounds.minY + 'px';
        selectionBox.style.width = (bounds.maxX - bounds.minX) + 'px';
        selectionBox.style.height = (bounds.maxY - bounds.minY) + 'px';
        container.appendChild(selectionBox);
        
        // Create resize handles at four corners
        const handles = [
            { pos: 'nw', x: bounds.minX, y: bounds.minY, cursor: 'nw-resize' },
            { pos: 'ne', x: bounds.maxX, y: bounds.minY, cursor: 'ne-resize' },
            { pos: 'sw', x: bounds.minX, y: bounds.maxY, cursor: 'sw-resize' },
            { pos: 'se', x: bounds.maxX, y: bounds.maxY, cursor: 'se-resize' }
        ];
        
        handles.forEach(handle => {
            const div = document.createElement('div');
            div.className = 'selection-handle';
            div.id = `handle-${handle.pos}`;
            div.style.left = (handle.x - 6) + 'px';
            div.style.top = (handle.y - 6) + 'px';
            div.style.cursor = handle.cursor;
            div.dataset.handle = handle.pos;
            
            container.appendChild(div);
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
        // Check if we're hovering over any handle DOM element
        const handles = document.querySelectorAll('.selection-handle');
        for (const handle of handles) {
            const rect = handle.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            // Convert screen coordinates to canvas coordinates
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
        
        console.log('Resizing:', this.resizeHandle, 'delta:', deltaX, deltaY);
        
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
        
        // Add to history
        this.addToHistory({
            type: 'delete',
            shape: shapeToDelete,
            index: shapeIndex
        });
        
        // Clear selection
        this.clearSelection();
        
        // Redraw
        this.redrawAllStrokes();
        this.updateOutlinePanel();
        
        this.updateStatus('Shape deleted');
    }

    clearCanvas() {
        const gl = this.gl;
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.strokes = [];
        this.clearSelection();
        this.updateOutlinePanel();
        this.updateStatus('Canvas cleared');
    }

    redrawAllStrokes() {
        const gl = this.gl;
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
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

    // Placeholder for WebSocket collaboration
    emitStroke(stroke) {
        // This will be implemented with WebSocket connection
        console.log('Stroke to emit:', stroke);
    }

    receiveStroke(stroke) {
        // Draw stroke from another user
        this.strokes.push(stroke);
        
        // Check if it's a shape or freehand stroke
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

    updateOutlinePanel() {
        const outlineList = document.getElementById('outline-content');
        outlineList.innerHTML = '';
        
        // Get only shapes (not freehand strokes)
        const shapes = this.strokes.filter(s => s.x1 !== undefined && s.x2 !== undefined);
        
        if (shapes.length === 0) {
            outlineList.innerHTML = '<div class="outline-empty">No shapes yet. Draw something!</div>';
            return;
        }
        
        // Create outline items in reverse order (top of list = top layer = last drawn)
        // So we iterate backwards through the shapes array
        for (let i = shapes.length - 1; i >= 0; i--) {
            const item = this.createOutlineItem(shapes[i], i);
            outlineList.appendChild(item);
        }
    }

    createOutlineItem(shape, index) {
        const item = document.createElement('div');
        item.className = 'outline-item';
        item.draggable = true;
        item.dataset.index = index;
        
        // Add selected class if this shape is selected
        if (this.selectedShape && this.selectedShape.id === shape.id) {
            item.classList.add('selected');
        }
        
        // Icon based on shape type
        const icon = document.createElement('div');
        icon.className = 'outline-icon';
        icon.textContent = this.getShapeIcon(shape.tool);
        item.appendChild(icon);
        
        // Label (editable)
        const label = document.createElement('div');
        label.className = 'outline-label';
        label.contentEditable = false;
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
        
        // Click to select (but not on label)
        item.addEventListener('click', (e) => {
            if (e.target !== label) {
                this.selectShapeByIndex(index);
            }
        });
        
        // Double-click label to edit
        label.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.startEditingLabel(label, shape);
        });
        
        // Single click on label to edit (when shape is selected)
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedShape && this.selectedShape.id === shape.id) {
                this.startEditingLabel(label, shape);
            } else {
                this.selectShapeByIndex(index);
            }
        });
        
        // Drag and drop events
        item.addEventListener('dragstart', (e) => {
            // Don't allow dragging while editing
            if (label.contentEditable === 'true') {
                e.preventDefault();
                return;
            }
            
            this.draggedItem = item;
            this.draggedIndex = index;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
            this.draggedItem = null;
            this.draggedIndex = -1;
            // Remove all drag-over classes
            document.querySelectorAll('.outline-item').forEach(i => {
                i.classList.remove('drag-over');
            });
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (this.draggedItem && this.draggedItem !== item) {
                item.classList.add('drag-over');
            }
        });
        
        item.addEventListener('dragleave', (e) => {
            item.classList.remove('drag-over');
        });
        
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            
            if (this.draggedIndex !== -1 && this.draggedIndex !== index) {
                this.reorderShapes(this.draggedIndex, index);
            }
        });
        
        return item;
    }

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

    getShapeLabel(shape) {
        // If shape has a custom label, use that; otherwise use default shape type name
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

    selectShapeByIndex(index) {
        const shapes = this.strokes.filter(s => s.x1 !== undefined && s.x2 !== undefined);
        
        // Since outline displays in reverse, convert display index to actual array index
        const actualIndex = shapes.length - 1 - index;
        
        if (actualIndex >= 0 && actualIndex < shapes.length) {
            const shape = shapes[actualIndex];
            
            // Switch to select tool if not already
            if (this.currentTool !== 'select') {
                this.setTool('select');
            }
            
            this.selectShape(shape);
        }
    }

    reorderShapes(fromIndex, toIndex) {
        // Get only shapes
        const shapes = this.strokes.filter(s => s.x1 !== undefined && s.x2 !== undefined);
        const freehandStrokes = this.strokes.filter(s => s.points !== undefined);
        
        if (fromIndex < 0 || fromIndex >= shapes.length || toIndex < 0 || toIndex >= shapes.length) {
            return;
        }
        
        // Store state before reorder for history
        const beforeState = [...this.strokes];
        
        // Since the outline displays in reverse (last item at top of list),
        // we need to reverse the indices when moving items in the actual array
        const actualFromIndex = shapes.length - 1 - fromIndex;
        const actualToIndex = shapes.length - 1 - toIndex;
        
        // Move the shape
        const [movedShape] = shapes.splice(actualFromIndex, 1);
        shapes.splice(actualToIndex, 0, movedShape);
        
        // Reconstruct strokes array with new order (freehand strokes first, then reordered shapes)
        this.strokes = [...freehandStrokes, ...shapes];
        
        // Add to history
        this.addToHistory({
            type: 'reorder',
            before: beforeState,
            after: [...this.strokes]
        });
        
        // Redraw everything
        this.redrawAllStrokes();
        
        // Update outline panel
        this.updateOutlinePanel();
        
        // Maintain selection if the moved shape was selected
        if (this.selectedShape && this.selectedShape.id === movedShape.id) {
            this.drawSelectionBox(this.selectedShape);
        }
        
        const position = toIndex === 0 ? 'top' : toIndex === shapes.length - 1 ? 'bottom' : `position ${toIndex + 1}`;
        this.updateStatus(`Moved "${this.getShapeLabel(movedShape)}" to ${position}`);
    }

    startEditingLabel(labelElement, shape) {
        // Make label editable
        labelElement.contentEditable = true;
        labelElement.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(labelElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Store original value in case user cancels
        const originalValue = labelElement.textContent;
        
        // Finish editing on Enter or blur
        const finishEditing = (save) => {
            labelElement.contentEditable = false;
            
            if (save) {
                const newLabel = labelElement.textContent.trim();
                if (newLabel && newLabel !== originalValue) {
                    // Save the custom label (empty string if they cleared it)
                    shape.customLabel = newLabel;
                    this.updateStatus(`Renamed to "${newLabel}"`);
                } else if (!newLabel) {
                    // If empty, revert to default
                    shape.customLabel = null;
                    labelElement.textContent = this.getShapeLabel(shape);
                }
            } else {
                // Restore original value
                labelElement.textContent = originalValue;
            }
            
            // Update outline to reflect changes
            this.updateOutlinePanel();
        };
        
        // Handle keyboard events
        const keyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing(true);
                labelElement.removeEventListener('keydown', keyHandler);
                labelElement.removeEventListener('blur', blurHandler);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEditing(false);
                labelElement.removeEventListener('keydown', keyHandler);
                labelElement.removeEventListener('blur', blurHandler);
            }
        };
        
        const blurHandler = () => {
            finishEditing(true);
            labelElement.removeEventListener('keydown', keyHandler);
            labelElement.removeEventListener('blur', blurHandler);
        };
        
        labelElement.addEventListener('keydown', keyHandler);
        labelElement.addEventListener('blur', blurHandler);
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.panel-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.panel-content').forEach(content => content.classList.remove('active'));
        
        if (tab === 'outline') {
            document.getElementById('outline-tab').classList.add('active');
            document.getElementById('outline-content').classList.add('active');
        } else if (tab === 'history') {
            document.getElementById('history-tab').classList.add('active');
            document.getElementById('history-content').classList.add('active');
        }
    }

    addToHistory(action) {
        // Remove any future history if we're not at the end
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentHistoryIndex + 1);
        }
        
        // Add timestamp
        action.timestamp = Date.now();
        
        // Add action to history
        this.history.push(action);
        this.currentHistoryIndex++;
        
        // Update history panel
        this.updateHistoryPanel();
        
        console.log('Added to history:', action);
    }

    undo() {
        if (this.currentHistoryIndex < 0) {
            this.updateStatus('Nothing to undo');
            return;
        }
        
        const action = this.history[this.currentHistoryIndex];
        this.currentHistoryIndex--;
        
        console.log('Undoing:', action);
        
        switch (action.type) {
            case 'create':
                // Remove the created shape
                this.strokes = this.strokes.filter(s => s.id !== action.shape.id);
                break;
                
            case 'draw':
                // Remove the drawn stroke
                this.strokes = this.strokes.filter(s => s.id !== action.stroke.id);
                break;
                
            case 'resize':
            case 'move':
                // Restore previous bounds
                const shape = this.strokes.find(s => s.id === action.shapeId);
                if (shape) {
                    shape.x1 = action.before.x1;
                    shape.y1 = action.before.y1;
                    shape.x2 = action.before.x2;
                    shape.y2 = action.before.y2;
                }
                break;
                
            case 'colorChange':
                // Restore previous colors
                const colorShape = this.strokes.find(s => s.id === action.shapeId);
                if (colorShape) {
                    colorShape.color = { ...action.before.color };
                    colorShape.fillColor = { ...action.before.fillColor };
                }
                break;
                
            case 'delete':
                // Re-add the deleted shape at its original position
                this.strokes.splice(action.index, 0, action.shape);
                break;
                
            case 'reorder':
                // Restore previous order
                this.strokes = action.before.slice();
                break;
        }
        
        this.redrawAllStrokes();
        this.updateOutlinePanel();
        this.updateHistoryPanel();
        this.updateStatus('Undo: ' + this.getActionDescription(action));
        
        // Clear selection after undo
        this.clearSelection();
    }

    redo() {
        if (this.currentHistoryIndex >= this.history.length - 1) {
            this.updateStatus('Nothing to redo');
            return;
        }
        
        this.currentHistoryIndex++;
        const action = this.history[this.currentHistoryIndex];
        
        console.log('Redoing:', action);
        
        switch (action.type) {
            case 'create':
                // Re-add the created shape
                this.strokes.push(action.shape);
                break;
                
            case 'draw':
                // Re-add the drawn stroke
                this.strokes.push(action.stroke);
                break;
                
            case 'resize':
            case 'move':
                // Restore new bounds
                const shape = this.strokes.find(s => s.id === action.shapeId);
                if (shape) {
                    shape.x1 = action.after.x1;
                    shape.y1 = action.after.y1;
                    shape.x2 = action.after.x2;
                    shape.y2 = action.after.y2;
                }
                break;
                
            case 'colorChange':
                // Restore new colors
                const colorShape = this.strokes.find(s => s.id === action.shapeId);
                if (colorShape) {
                    colorShape.color = { ...action.after.color };
                    colorShape.fillColor = { ...action.after.fillColor };
                }
                break;
                
            case 'delete':
                // Remove the shape again
                this.strokes = this.strokes.filter(s => s.id !== action.shape.id);
                break;
                
            case 'reorder':
                // Restore new order
                this.strokes = action.after.slice();
                break;
        }
        
        this.redrawAllStrokes();
        this.updateOutlinePanel();
        this.updateHistoryPanel();
        this.updateStatus('Redo: ' + this.getActionDescription(action));
        
        // Clear selection after redo
        this.clearSelection();
    }

    getActionDescription(action) {
        switch (action.type) {
            case 'create':
                const labels = {
                    'rectangle': 'Rectangle',
                    'triangle': 'Triangle',
                    'ellipse': 'Ellipse'
                };
                return `Create ${labels[action.tool] || 'Shape'}`;
            case 'draw':
                return action.tool === 'brush' ? 'Draw' : 'Erase';
            case 'resize':
                return 'Resize';
            case 'move':
                return 'Move';
            case 'reorder':
                return 'Reorder';
            case 'colorChange':
                return 'Change Color';
            case 'delete':
                return 'Delete';
            default:
                return 'Action';
        }
    }

    getActionIcon(action) {
        switch (action.type) {
            case 'create':
                return this.getShapeIcon(action.tool);
            case 'draw':
                return action.tool === 'brush' ? '✏️' : '🧹';
            case 'resize':
                return '↔️';
            case 'move':
                return '↕️';
            case 'reorder':
                return '⇅';
            case 'colorChange':
                return '🎨';
            case 'delete':
                return '🗑️';
            default:
                return '●';
        }
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 1000) return 'now';
        if (diff < 60000) return Math.floor(diff / 1000) + 's';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
        return Math.floor(diff / 3600000) + 'h';
    }

    updateHistoryPanel() {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = '';
        
        if (this.history.length === 0) {
            historyContent.innerHTML = '<div class="outline-empty">No actions yet.</div>';
            return;
        }
        
        // Display history items
        this.history.forEach((action, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            // Mark current position
            if (index === this.currentHistoryIndex) {
                item.classList.add('current');
            }
            // Mark future items (after current position)
            if (index > this.currentHistoryIndex) {
                item.classList.add('future');
            }
            
            // Icon
            const icon = document.createElement('div');
            icon.className = 'history-icon';
            icon.textContent = this.getActionIcon(action);
            item.appendChild(icon);
            
            // Description
            const text = document.createElement('div');
            text.className = 'history-text';
            text.textContent = this.getActionDescription(action);
            item.appendChild(text);
            
            // Time
            const time = document.createElement('div');
            time.className = 'history-time';
            time.textContent = this.formatTime(action.timestamp);
            item.appendChild(time);
            
            historyContent.appendChild(item);
        });
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    render() {
        // Animation loop (can be used for future animations)
        requestAnimationFrame(() => this.render());
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.drawingApp = new WebGLDrawingApp();
});
