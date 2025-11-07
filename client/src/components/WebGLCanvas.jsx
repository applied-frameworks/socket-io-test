/**
 * WebGLCanvas Component
 * Example React component showing how to integrate WebGLDrawingApp
 */

import React, { useEffect, useRef, useState } from 'react';
import { WebGLDrawingApp } from '../utils/webgl-drawing-app';
import '../utils/webgl-drawing-app.css';

export function WebGLCanvas({ socket, documentId, userId }) {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const appRef = useRef(null);

  const [currentTool, setCurrentTool] = useState('ellipse');
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [strokeOpacity, setStrokeOpacity] = useState(100);
  const [fillOpacity, setFillOpacity] = useState(0);
  const [brushSize, setBrushSize] = useState(5);

  useEffect(() => {
    if (!canvasRef.current || !previewCanvasRef.current || !containerRef.current || !socket) {
      return;
    }

    // Initialize WebGL Drawing App
    const app = new WebGLDrawingApp({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      container: containerRef.current,
      documentId: documentId,
      userId: userId,
      socket: socket
    });

    appRef.current = app;

    // Set up socket event listeners
    socket.on('shape:add', (shape) => {
      console.log('Received shape:add', shape);
      app.receiveShape(shape, 'add');
    });

    socket.on('shape:update', (shape) => {
      console.log('Received shape:update', shape);
      app.receiveShape(shape, 'update');
    });

    socket.on('shape:delete', (data) => {
      console.log('Received shape:delete', data);
      app.receiveShape(data, 'delete');
    });

    socket.on('canvas:state', (state) => {
      console.log('Received canvas state', state);
      app.loadState(state);
    });

    // Cleanup on unmount
    return () => {
      socket.off('shape:add');
      socket.off('shape:update');
      socket.off('shape:delete');
      socket.off('canvas:state');
      app.destroy();
    };
  }, [socket, documentId, userId]);

  // Update tool when changed
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setTool(currentTool);
    }
  }, [currentTool]);

  // Update stroke color
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setStrokeColor(strokeColor);
    }
  }, [strokeColor]);

  // Update fill color
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setFillColor(fillColor);
    }
  }, [fillColor]);

  // Update stroke opacity
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setStrokeOpacity(strokeOpacity);
    }
  }, [strokeOpacity]);

  // Update fill opacity
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setFillOpacity(fillOpacity);
    }
  }, [fillOpacity]);

  // Update brush size
  useEffect(() => {
    if (appRef.current) {
      appRef.current.setBrushSize(brushSize);
    }
  }, [brushSize]);

  const handleClearCanvas = () => {
    if (appRef.current) {
      appRef.current.clearCanvas();
    }
  };

  const handleDeleteSelected = () => {
    if (appRef.current) {
      appRef.current.deleteSelectedShape();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px',
        background: '#2c2c2c',
        borderBottom: '1px solid #444',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Tool Selection */}
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => setCurrentTool('select')}
            style={{
              padding: '8px 12px',
              background: currentTool === 'select' ? '#4CAF50' : '#444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Select
          </button>
          <button
            onClick={() => setCurrentTool('ellipse')}
            style={{
              padding: '8px 12px',
              background: currentTool === 'ellipse' ? '#4CAF50' : '#444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Ellipse
          </button>
          <button
            onClick={() => setCurrentTool('rectangle')}
            style={{
              padding: '8px 12px',
              background: currentTool === 'rectangle' ? '#4CAF50' : '#444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Rectangle
          </button>
          <button
            onClick={() => setCurrentTool('triangle')}
            style={{
              padding: '8px 12px',
              background: currentTool === 'triangle' ? '#4CAF50' : '#444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Triangle
          </button>
        </div>

        {/* Color Pickers */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
            Stroke:
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              style={{ width: '40px', height: '30px', cursor: 'pointer' }}
            />
          </label>
          <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
            Opacity:
            <input
              type="range"
              min="0"
              max="100"
              value={strokeOpacity}
              onChange={(e) => setStrokeOpacity(parseInt(e.target.value))}
              style={{ width: '80px' }}
            />
            <span style={{ minWidth: '30px' }}>{strokeOpacity}%</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
            Fill:
            <input
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
              style={{ width: '40px', height: '30px', cursor: 'pointer' }}
            />
          </label>
          <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
            Opacity:
            <input
              type="range"
              min="0"
              max="100"
              value={fillOpacity}
              onChange={(e) => setFillOpacity(parseInt(e.target.value))}
              style={{ width: '80px' }}
            />
            <span style={{ minWidth: '30px' }}>{fillOpacity}%</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
            Size:
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              style={{ width: '80px' }}
            />
            <span style={{ minWidth: '30px' }}>{brushSize}px</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '5px', marginLeft: 'auto' }}>
          <button
            onClick={handleDeleteSelected}
            style={{
              padding: '8px 12px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Delete Selected
          </button>
          <button
            onClick={handleClearCanvas}
            style={{
              padding: '8px 12px',
              background: '#ff9800',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Clear Canvas
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          background: '#1a1a1a',
          overflow: 'hidden'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
        />
        <canvas
          ref={previewCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        />
      </div>
    </div>
  );
}

export default WebGLCanvas;
