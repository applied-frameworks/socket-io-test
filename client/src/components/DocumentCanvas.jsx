import React, { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import '../styles/DocumentCanvas.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const DocumentCanvas = ({ documentId, userId }) => {
  const canvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const containerRef = useRef(null)
  const socketRef = useRef(null)
  const appRef = useRef(null)

  useEffect(() => {
    if (!documentId || !userId) return

    // Initialize Socket.IO connection
    const token = localStorage.getItem('token')
    const socket = io(API_URL, {
      auth: { token }
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to server')
      // Join the document room
      socket.emit('document:join', { documentId })
    })

    socket.on('document:state', (state) => {
      console.log('Received document state:', state)
      if (appRef.current) {
        appRef.current.loadState(state)
      }
    })

    socket.on('shape:add', (shape) => {
      console.log('Received shape:add', shape)
      if (appRef.current) {
        appRef.current.receiveShape(shape, 'add')
      }
    })

    socket.on('shape:update', (shape) => {
      console.log('Received shape:update', shape)
      if (appRef.current) {
        appRef.current.receiveShape(shape, 'update')
      }
    })

    socket.on('shape:delete', (data) => {
      console.log('Received shape:delete', data)
      if (appRef.current) {
        appRef.current.receiveShape(data, 'delete')
      }
    })

    // Initialize WebGL Drawing App
    import('../utils/webgl-drawing-app').then(({ WebGLDrawingApp }) => {
      appRef.current = new WebGLDrawingApp({
        canvas: canvasRef.current,
        previewCanvas: previewCanvasRef.current,
        container: containerRef.current,
        documentId,
        userId,
        socket: socketRef.current
      })
    })

    return () => {
      socket.disconnect()
      if (appRef.current) {
        appRef.current.destroy()
      }
    }
  }, [documentId, userId])

  return (
    <div id="container" ref={containerRef}>
      <div id="toolbar">
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

      <div id="canvas-container">
        <canvas id="canvas" ref={canvasRef}></canvas>
        <canvas id="preview-canvas" ref={previewCanvasRef}></canvas>
        <div id="status">Ready</div>
      </div>

      <div id="outline-panel">
        <div id="panel-tabs">
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
  )
}

export default DocumentCanvas
