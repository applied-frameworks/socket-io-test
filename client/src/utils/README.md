# WebGL Drawing App - React Integration Guide

This ES6 module provides a WebGL-based collaborative drawing canvas that integrates with Socket.IO for real-time collaboration.

## Features

- **WebGL Rendering**: High-performance canvas rendering using WebGL
- **Shape Tools**: Ellipse, Rectangle, Triangle
- **Selection & Manipulation**: Select, move, and resize shapes with visual handles
- **Stroke & Fill**: Customizable stroke and fill colors with opacity controls
- **Socket.IO Integration**: Real-time collaboration with automatic shape synchronization
- **Backend Compatible**: Shapes are automatically converted to match the Prisma schema format

## Quick Start

### Basic Usage

```javascript
import { WebGLDrawingApp } from './utils/webgl-drawing-app';
import './utils/webgl-drawing-app.css';

// Initialize the app
const app = new WebGLDrawingApp({
  canvas: canvasElement,           // Main canvas element
  previewCanvas: previewElement,   // Preview canvas for shape drawing
  container: containerElement,     // Container div (for selection UI)
  documentId: 'doc-123',          // Document ID
  userId: 'user-456',             // User ID
  socket: socketInstance          // Socket.IO client instance
});
```

### React Component Example

See `WebGLCanvas.jsx` for a complete React component example.

```jsx
import React, { useEffect, useRef } from 'react';
import { WebGLDrawingApp } from '../utils/webgl-drawing-app';
import '../utils/webgl-drawing-app.css';

export function MyCanvas({ socket, documentId, userId }) {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const appRef = useRef(null);

  useEffect(() => {
    const app = new WebGLDrawingApp({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      container: containerRef.current,
      documentId,
      userId,
      socket
    });

    appRef.current = app;

    // Set up socket listeners
    socket.on('shape:add', (shape) => app.receiveShape(shape, 'add'));
    socket.on('shape:update', (shape) => app.receiveShape(shape, 'update'));
    socket.on('shape:delete', (data) => app.receiveShape(data, 'delete'));
    socket.on('canvas:state', (state) => app.loadState(state));

    return () => {
      socket.off('shape:add');
      socket.off('shape:update');
      socket.off('shape:delete');
      socket.off('canvas:state');
      app.destroy();
    };
  }, [socket, documentId, userId]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '600px' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
      <canvas ref={previewCanvasRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
    </div>
  );
}
```

## API Reference

### Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `canvas` | HTMLCanvasElement | Yes | Main WebGL canvas element |
| `previewCanvas` | HTMLCanvasElement | Yes | Overlay canvas for shape previews |
| `container` | HTMLElement | Yes | Container element for selection UI |
| `documentId` | String | Yes | Document/canvas ID for backend |
| `userId` | String | Yes | Current user ID |
| `socket` | Socket | Yes | Socket.IO client instance |

### Public Methods

#### Tool Management

```javascript
app.setTool(tool)
```
Set the current drawing tool. Options: `'select'`, `'ellipse'`, `'rectangle'`, `'triangle'`, `'brush'`, `'eraser'`

#### Color & Style

```javascript
app.setStrokeColor(hexColor)      // e.g., '#ff0000'
app.setFillColor(hexColor)        // e.g., '#00ff00'
app.setStrokeOpacity(opacity)     // 0-100
app.setFillOpacity(opacity)       // 0-100
app.setBrushSize(size)            // 1-20 (pixels)
```

#### Shape Management

```javascript
app.deleteSelectedShape()         // Delete currently selected shape
app.clearCanvas()                 // Clear entire canvas
```

#### Socket Integration

```javascript
// Receive shape from another user
app.receiveShape(shape, action)   // action: 'add', 'update', or 'delete'

// Load initial canvas state
app.loadState(state)              // state: { shapes: [...] }
```

#### Cleanup

```javascript
app.destroy()                     // Clean up event listeners and resources
```

### Socket Events

#### Emitted by App (Client → Server)

```javascript
// Add new shape
socket.emit('shape:add', {
  id: 'shape_123',
  documentId: 'doc-123',
  type: 'ellipse',
  x1: 100, y1: 100,
  x2: 200, y2: 200,
  strokeColor: '{"r":1,"g":1,"b":1,"a":1}',
  fillColor: '{"r":1,"g":1,"b":1,"a":0}',
  strokeSize: 5,
  customLabel: null
});

// Update existing shape
socket.emit('shape:update', {
  shapeId: 'shape_123',
  // ... updated properties
});

// Delete shape
socket.emit('shape:delete', {
  shapeId: 'shape_123'
});
```

#### Received from Server (Server → Client)

```javascript
// New shape added by another user
socket.on('shape:add', (shape) => {
  app.receiveShape(shape, 'add');
});

// Shape updated by another user
socket.on('shape:update', (shape) => {
  app.receiveShape(shape, 'update');
});

// Shape deleted by another user
socket.on('shape:delete', (data) => {
  app.receiveShape(data, 'delete');
});

// Initial canvas state on join
socket.on('canvas:state', (state) => {
  app.loadState(state);
});
```

## Shape Data Format

### Internal Format (WebGL App)

```javascript
{
  id: 'shape_123',
  userId: 'user-456',
  tool: 'ellipse',
  color: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },      // stroke color (0-1 range)
  fillColor: { r: 1.0, g: 1.0, b: 1.0, a: 0.0 },  // fill color (0-1 range)
  size: 5,                                          // stroke width in pixels
  x1: 100, y1: 100,                                 // top-left corner
  x2: 200, y2: 200,                                 // bottom-right corner
  customLabel: 'My Circle'                          // optional label
}
```

### Backend Format (Prisma Schema)

```javascript
{
  id: 'cuid_xyz',
  documentId: 'doc-123',
  userId: 'user-456',
  type: 'ellipse',
  x1: 100.0,
  y1: 100.0,
  x2: 200.0,
  y2: 200.0,
  strokeColor: '{"r":1,"g":1,"b":1,"a":1}',       // JSON string
  fillColor: '{"r":1,"g":1,"b":1,"a":0}',         // JSON string
  strokeSize: 5.0,
  customLabel: 'My Circle',
  order: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
}
```

The WebGLDrawingApp automatically converts between these formats using:
- `convertShapeToBackendFormat(shape)` - for emitting to server
- `convertShapeFromBackendFormat(backendShape)` - for receiving from server

## Styling

The app requires CSS for selection UI. Import the stylesheet:

```javascript
import './utils/webgl-drawing-app.css';
```

Or customize the styles:

```css
.selection-box {
  position: absolute;
  border: 2px dashed #4CAF50;
  pointer-events: none;
  z-index: 1000;
}

.selection-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #4CAF50;
  border: 2px solid white;
  border-radius: 50%;
  z-index: 1001;
  cursor: pointer;
}
```

## Browser Support

- Requires WebGL support (WebGL 2.0 preferred, falls back to WebGL 1.0)
- Tested on modern browsers: Chrome, Firefox, Safari, Edge
- Mobile touch events supported

## Performance Notes

- WebGL rendering is highly performant for complex shapes
- Shape data is stored in memory (consider pagination for large canvases)
- Selection handles use DOM elements (minimal performance impact)
- Canvas automatically resizes on window resize

## Troubleshooting

### WebGL not supported error
Ensure the browser supports WebGL. Check with:
```javascript
const canvas = document.createElement('canvas');
const hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
```

### Shapes not appearing
- Verify canvas dimensions are set correctly
- Check that WebGL context initialized successfully
- Ensure colors have proper alpha values (> 0)

### Socket events not working
- Verify socket connection is established
- Check that documentId matches server-side canvas/room ID
- Ensure socket event listeners are set up before shapes are created

## Future Enhancements

Potential improvements for future versions:
- Brush and eraser tool Socket.IO integration
- Undo/redo with history management
- Layer ordering and z-index controls
- Shape outline panel for navigation
- Multi-selection support
- Copy/paste functionality
- Export to PNG/SVG
