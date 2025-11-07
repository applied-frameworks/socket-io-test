// Simplified WebGL Drawing App with Socket.IO Integration
// Focuses on ellipses (circles), rectangles, and triangles
class WebGLDrawingApp {
    constructor(canvas, previewCanvas, container, documentId, userId, socket) {
        this.canvas = canvas;
        this.previewCanvas = previewCanvas;
        this.container = container;
        this.documentId = documentId;
        this.userId = userId;
        this.socket = socket;

        // Initialize WebGL context
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        this.previewCtx = this.previewCanvas.getContext('2d');

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        // Drawing state
        this.isDrawing = false;
        this.currentTool = 'ellipse'; // Priority: ellipse (circles)
        this.currentStrokeColor = { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
        this.currentFillColor = { r: 1.0, g: 1.0, b: 1.0, a: 0.0 };
        this.strokeSize = 5;

        // Shape drawing state
        this.shapeStartX = 0;
        this.shapeStartY = 0;

        // Store shapes locally
        this.shapes = [];

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupWebGL();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.render();
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;

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

        // Enable blending for transparency
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
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

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
            this.redrawAllShapes();
        });
    }

    setupSocketListeners() {
        if (!this.socket) return;

        // Listen for document state (all shapes)
        this.socket.on('document:state', (data) => {
            if (data.documentId === this.documentId) {
                this.shapes = data.shapes || [];
                this.redrawAllShapes();
            }
        });

        // Listen for new shapes
        this.socket.on('shape:add', (shape) => {
            if (shape.documentId === this.documentId && shape.userId !== this.userId) {
                this.shapes.push(shape);
                this.drawShape(shape);
            }
        });

        // Listen for shape updates
        this.socket.on('shape:update', (shape) => {
            if (shape.documentId === this.documentId) {
                const index = this.shapes.findIndex(s => s.id === shape.id);
                if (index !== -1) {
                    this.shapes[index] = shape;
                    this.redrawAllShapes();
                }
            }
        });

        // Listen for shape deletions
        this.socket.on('shape:delete', (data) => {
            if (data.documentId === this.documentId) {
                this.shapes = this.shapes.filter(s => s.id !== data.shapeId);
                this.redrawAllShapes();
            }
        });
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
        this.isDrawing = true;
        this.shapeStartX = pos.x;
        this.shapeStartY = pos.y;
    }

    draw(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);
        this.drawShapePreview(this.shapeStartX, this.shapeStartY, pos.x, pos.y);
    }

    stopDrawing() {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();
        const lastMouseEvent = window.event;
        if (!lastMouseEvent) {
            this.isDrawing = false;
            this.clearPreview();
            return;
        }

        const pos = this.getMousePos(lastMouseEvent);
        this.finalizeShape(this.shapeStartX, this.shapeStartY, pos.x, pos.y);
        this.clearPreview();
        this.isDrawing = false;
    }

    drawShapePreview(x1, y1, x2, y2) {
        this.clearPreview();

        const ctx = this.previewCtx;

        // Convert WebGL color to CSS
        const r = Math.round(this.currentStrokeColor.r * 255);
        const g = Math.round(this.currentStrokeColor.g * 255);
        const b = Math.round(this.currentStrokeColor.b * 255);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${this.currentStrokeColor.a})`;
        ctx.lineWidth = this.strokeSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Fill color
        const fr = Math.round(this.currentFillColor.r * 255);
        const fg = Math.round(this.currentFillColor.g * 255);
        const fb = Math.round(this.currentFillColor.b * 255);
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${this.currentFillColor.a})`;

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

        if (this.currentFillColor.a > 0) {
            ctx.fill();
        }
        ctx.stroke();
    }

    clearPreview() {
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }

    finalizeShape(x1, y1, x2, y2) {
        // Convert color objects to JSON strings for database storage
        const strokeColorJSON = JSON.stringify(this.currentStrokeColor);
        const fillColorJSON = JSON.stringify(this.currentFillColor);

        const shape = {
            id: Date.now() + Math.random(), // Temporary ID, server will assign final one
            documentId: this.documentId,
            userId: this.userId,
            type: this.currentTool,
            x1,
            y1,
            x2,
            y2,
            strokeColor: strokeColorJSON,
            fillColor: fillColorJSON,
            strokeSize: this.strokeSize,
            customLabel: null,
            order: this.shapes.length
        };

        // Add to local shapes array
        this.shapes.push(shape);

        // Draw the shape immediately
        this.drawShape(shape);

        // Emit to server via Socket.IO
        if (this.socket) {
            this.socket.emit('shape:add', shape);
        }
    }

    drawShape(shape) {
        const { type, x1, y1, x2, y2, strokeColor, fillColor, strokeSize } = shape;

        // Parse color JSON strings
        const stroke = typeof strokeColor === 'string' ? JSON.parse(strokeColor) : strokeColor;
        const fill = typeof fillColor === 'string' ? JSON.parse(fillColor) : fillColor;

        switch (type) {
            case 'rectangle':
                this.drawRectangle(x1, y1, x2, y2, stroke, strokeSize, fill);
                break;
            case 'triangle':
                this.drawTriangle(x1, y1, x2, y2, stroke, strokeSize, fill);
                break;
            case 'ellipse':
                this.drawEllipse(x1, y1, x2, y2, stroke, strokeSize, fill);
                break;
        }
    }

    drawRectangle(x1, y1, x2, y2, strokeColor, lineWidth, fillColor) {
        // Draw fill if it has opacity
        if (fillColor && fillColor.a > 0) {
            this.drawRectangleFill(x1, y1, x2, y2, fillColor);
        }

        // Draw four lines to form rectangle stroke
        this.drawLine(x1, y1, x2, y1, strokeColor, lineWidth); // Top
        this.drawLine(x2, y1, x2, y2, strokeColor, lineWidth); // Right
        this.drawLine(x2, y2, x1, y2, strokeColor, lineWidth); // Bottom
        this.drawLine(x1, y2, x1, y1, strokeColor, lineWidth); // Left
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

    drawTriangle(x1, y1, x2, y2, strokeColor, lineWidth, fillColor) {
        const centerX = (x1 + x2) / 2;

        // Draw fill if it has opacity
        if (fillColor && fillColor.a > 0) {
            this.drawTriangleFill(centerX, y1, x1, y2, x2, y2, fillColor);
        }

        // Draw three lines to form triangle stroke
        this.drawLine(centerX, y1, x1, y2, strokeColor, lineWidth); // Left side
        this.drawLine(x1, y2, x2, y2, strokeColor, lineWidth); // Bottom
        this.drawLine(x2, y2, centerX, y1, strokeColor, lineWidth); // Right side
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

    drawEllipse(x1, y1, x2, y2, strokeColor, lineWidth, fillColor) {
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

            this.drawLine(prevX, prevY, x, y, strokeColor, lineWidth);

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

    drawLine(x1, y1, x2, y2, color, size) {
        const gl = this.gl;

        // Calculate line segment with thickness
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.1) {
            // Draw a circle for single point
            this.drawCircle(x1, y1, size, color);
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

        const colors = [
            color.r, color.g, color.b, color.a,
            color.r, color.g, color.b, color.a,
            color.r, color.g, color.b, color.a,
            color.r, color.g, color.b, color.a
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

        // Draw circles at endpoints for smooth lines
        this.drawCircle(x1, y1, size, color);
        this.drawCircle(x2, y2, size, color);
    }

    drawCircle(x, y, size, color) {
        const gl = this.gl;
        const segments = 20;
        const radius = size / 2;

        const positions = [x, y]; // Center point
        const colors = [color.r, color.g, color.b, color.a];

        // Create circle vertices
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            positions.push(
                x + Math.cos(angle) * radius,
                y + Math.sin(angle) * radius
            );
            colors.push(color.r, color.g, color.b, color.a);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

        gl.useProgram(this.program);
        gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.enableVertexAttribArray(this.colorLocation);
        gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 2);
    }

    redrawAllShapes() {
        const gl = this.gl;
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Redraw all shapes in order
        for (const shape of this.shapes) {
            this.drawShape(shape);
        }
    }

    // Public API methods
    setTool(tool) {
        if (['ellipse', 'rectangle', 'triangle'].includes(tool)) {
            this.currentTool = tool;
        }
    }

    setStrokeColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16) / 255;
        const g = parseInt(hexColor.substr(3, 2), 16) / 255;
        const b = parseInt(hexColor.substr(5, 2), 16) / 255;

        this.currentStrokeColor.r = r;
        this.currentStrokeColor.g = g;
        this.currentStrokeColor.b = b;
    }

    setFillColor(hexColor) {
        const r = parseInt(hexColor.substr(1, 2), 16) / 255;
        const g = parseInt(hexColor.substr(3, 2), 16) / 255;
        const b = parseInt(hexColor.substr(5, 2), 16) / 255;

        this.currentFillColor.r = r;
        this.currentFillColor.g = g;
        this.currentFillColor.b = b;
    }

    clearCanvas() {
        this.shapes = [];
        this.redrawAllShapes();
        if (this.socket) {
            this.socket.emit('canvas:clear', { documentId: this.documentId });
        }
    }

    cleanup() {
        // Remove event listeners
        window.removeEventListener('resize', this.resizeCanvas);

        // Remove socket listeners
        if (this.socket) {
            this.socket.off('document:state');
            this.socket.off('shape:add');
            this.socket.off('shape:update');
            this.socket.off('shape:delete');
        }

        // Clean up WebGL resources
        const gl = this.gl;
        if (gl) {
            gl.deleteBuffer(this.positionBuffer);
            gl.deleteBuffer(this.colorBuffer);
            gl.deleteProgram(this.program);
        }
    }

    render() {
        // Animation loop (can be used for future animations)
        requestAnimationFrame(() => this.render());
    }
}

export default WebGLDrawingApp;
