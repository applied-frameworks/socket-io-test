import React, { useEffect, useRef } from 'react';
import WebGLDrawingApp from '../utils/WebGLDrawingApp';
import './DrawingCanvas.css';

const DrawingCanvas = ({ documentId, userId, socket, onDataChange }) => {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingAppRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !previewCanvasRef.current) return;

    console.log('Initializing DrawingCanvas', { documentId, userId });

    drawingAppRef.current = new WebGLDrawingApp({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      container: containerRef.current,
      documentId,
      userId,
      socket,
      onDataChange
    });

    return () => {
      if (drawingAppRef.current) {
        drawingAppRef.current.cleanup();
      }
    };
  }, [documentId, userId, socket, onDataChange]);

  return (
    <div className="drawing-app-container">
      <div className="toolbar">
        <button className="tool-btn" id="select-btn" title="Select">👆</button>
        <button className="tool-btn active" id="brush-btn" title="Brush">✏️</button>
        <button className="tool-btn" id="eraser-btn" title="Eraser">🧹</button>
        <button className="tool-btn" id="rectangle-btn" title="Rectangle">▭</button>
        <button className="tool-btn" id="triangle-btn" title="Triangle">▲</button>
        <button className="tool-btn" id="ellipse-btn" title="Ellipse">⬭</button>

        <div className="slider-container">
          <label>Stroke</label>
          <input type="color" id="color-picker" defaultValue="#ffffff" title="Stroke Color" />
        </div>

        <div className="slider-container">
          <label>Opacity</label>
          <input type="range" id="stroke-opacity-slider" min="0" max="100" defaultValue="100" />
        </div>

        <div className="slider-container">
          <label>Fill</label>
          <input type="color" id="fill-picker" defaultValue="#ffffff" title="Fill Color" />
        </div>

        <div className="slider-container">
          <label>Opacity</label>
          <input type="range" id="fill-opacity-slider" min="0" max="100" defaultValue="0" />
        </div>

        <div className="slider-container">
          <label>Size</label>
          <input type="range" id="size-slider" min="1" max="50" defaultValue="5" />
        </div>

        <button className="tool-btn" id="delete-btn" title="Delete Shape" style={{ display: 'none' }}>🗑️</button>
        <button className="tool-btn" id="clear-btn" title="Clear Canvas">🗑️</button>
      </div>

      <div id="canvas-container" ref={containerRef} className="canvas-container">
        <canvas id="canvas" ref={canvasRef}></canvas>
        <canvas id="preview-canvas" ref={previewCanvasRef}></canvas>
        <div id="status">Ready to draw!</div>
      </div>

      <div className="outline-panel">
        <div id="panel-tabs" className="panel-tabs">
          <button className="panel-tab active" id="outline-tab">Outline</button>
          <button className="panel-tab" id="history-tab">History</button>
        </div>
        <div id="outline-content" className="panel-content active">
          <div className="outline-empty">No shapes yet. Draw something!</div>
        </div>
        <div id="history-content" className="panel-content">
          <div className="outline-empty">No actions yet.</div>
        </div>
      </div>
    </div>
  );
};

export default DrawingCanvas;
