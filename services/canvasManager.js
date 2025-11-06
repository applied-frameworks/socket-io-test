// Canvas Manager - Handles canvas state and operations
// In production, persist this to a database

class CanvasManager {
  constructor() {
    this.canvases = new Map();
  }

  // Get or create canvas state
  getCanvasState(canvasId) {
    if (!this.canvases.has(canvasId)) {
      this.canvases.set(canvasId, {
        id: canvasId,
        shapes: [],
        drawEvents: [],
        users: new Map(),
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      });
    }
    
    const canvas = this.canvases.get(canvasId);
    return {
      id: canvas.id,
      shapes: canvas.shapes,
      drawEvents: canvas.drawEvents.slice(-100), // Last 100 draw events
      users: Array.from(canvas.users.values()),
      lastModified: canvas.lastModified
    };
  }

  // Add a draw event
  addDrawEvent(canvasId, drawData) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.drawEvents.push(drawData);
      canvas.lastModified = new Date().toISOString();
      
      // Keep only last 1000 draw events to prevent memory issues
      if (canvas.drawEvents.length > 1000) {
        canvas.drawEvents = canvas.drawEvents.slice(-1000);
      }
    }
  }

  // Add a shape
  addShape(canvasId, shapeData) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.shapes.push({
        ...shapeData,
        id: shapeData.id || this.generateShapeId()
      });
      canvas.lastModified = new Date().toISOString();
    }
  }

  // Update a shape
  updateShape(canvasId, shapeId, updates) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      const shapeIndex = canvas.shapes.findIndex(s => s.id === shapeId);
      if (shapeIndex !== -1) {
        canvas.shapes[shapeIndex] = {
          ...canvas.shapes[shapeIndex],
          ...updates,
          id: shapeId // Preserve original ID
        };
        canvas.lastModified = new Date().toISOString();
      }
    }
  }

  // Delete a shape
  deleteShape(canvasId, shapeId) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.shapes = canvas.shapes.filter(s => s.id !== shapeId);
      canvas.lastModified = new Date().toISOString();
    }
  }

  // Clear canvas
  clearCanvas(canvasId) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.shapes = [];
      canvas.drawEvents = [];
      canvas.lastModified = new Date().toISOString();
    }
  }

  // Add user to canvas
  addUser(canvasId, userId, username) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.users.set(userId, {
        userId,
        username,
        joinedAt: new Date().toISOString()
      });
    }
  }

  // Remove user from canvas
  removeUser(canvasId, userId) {
    const canvas = this.canvases.get(canvasId);
    if (canvas) {
      canvas.users.delete(userId);
    }
  }

  // Get canvas users
  getCanvasUsers(canvasId) {
    const canvas = this.canvases.get(canvasId);
    return canvas ? Array.from(canvas.users.values()) : [];
  }

  // Get all canvases (for admin purposes)
  getAllCanvases() {
    return Array.from(this.canvases.values()).map(canvas => ({
      id: canvas.id,
      shapeCount: canvas.shapes.length,
      userCount: canvas.users.size,
      createdAt: canvas.createdAt,
      lastModified: canvas.lastModified
    }));
  }

  // Delete old canvases (cleanup job)
  cleanupOldCanvases(maxAgeHours = 24) {
    const now = new Date();
    const cutoffTime = new Date(now - maxAgeHours * 60 * 60 * 1000);

    for (const [canvasId, canvas] of this.canvases.entries()) {
      const lastModified = new Date(canvas.lastModified);
      if (lastModified < cutoffTime && canvas.users.size === 0) {
        this.canvases.delete(canvasId);
        console.log(`Cleaned up canvas: ${canvasId}`);
      }
    }
  }

  generateShapeId() {
    return `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
const canvasManager = new CanvasManager();

// Run cleanup every hour
setInterval(() => {
  canvasManager.cleanupOldCanvases(24);
}, 60 * 60 * 1000);

module.exports = canvasManager;
