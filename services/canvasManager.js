// Canvas Manager - Database-backed with Prisma
// Hybrid approach: Active users in-memory, persistent data in database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

class CanvasManager {
  constructor() {
    // Store prisma client in instance
    this.prisma = prisma;

    // In-memory cache for active users (ephemeral)
    this.activeUsers = new Map(); // Map<canvasId, Map<userId, userInfo>>
    // In-memory buffer for draw events (for performance)
    this.drawEventBuffers = new Map(); // Map<canvasId, Array<drawEvent>>
  }

  // Get or create canvas state
  async getCanvasState(canvasId) {
    // Ensure canvas exists in database
    let canvas = await this.prisma.document.findUnique({
      where: { id: canvasId },
      include: {
        shapes: {
          orderBy: { createdAt: 'asc' },
        },
        drawEvents: {
          orderBy: { timestamp: 'desc' },
          take: 100, // Last 100 draw events
        },
      },
    });

    if (!canvas) {
      // Document not found - return empty state
      // Documents should be created through the document API
      return {
        id: canvasId,
        shapes: [],
        drawEvents: [],
        users: [],
        lastModified: new Date().toISOString(),
      };
    }

    // Initialize active users cache if needed
    if (!this.activeUsers.has(canvasId)) {
      this.activeUsers.set(canvasId, new Map());
    }

    // Get buffered draw events
    const bufferedEvents = this.drawEventBuffers.get(canvasId) || [];

    return {
      id: canvas.id,
      shapes: canvas.shapes.map(s => ({
        ...JSON.parse(s.data),
        id: s.id,
      })),
      drawEvents: [...canvas.drawEvents.map(e => JSON.parse(e.data)), ...bufferedEvents].slice(-100),
      users: Array.from(this.activeUsers.get(canvasId).values()),
      lastModified: canvas.lastModified.toISOString(),
    };
  }

  // Add a draw event (buffered for performance)
  async addDrawEvent(canvasId, drawData) {
    const canvas = await this._ensureCanvas(canvasId);

    // Add to buffer
    if (!this.drawEventBuffers.has(canvasId)) {
      this.drawEventBuffers.set(canvasId, []);
    }

    const buffer = this.drawEventBuffers.get(canvasId);
    buffer.push(drawData);

    // Periodically flush buffer to database (every 50 events or 10 seconds)
    if (buffer.length >= 50) {
      await this._flushDrawEvents(canvasId, canvas.id);
    }
  }

  async _flushDrawEvents(canvasId, dbCanvasId) {
    const buffer = this.drawEventBuffers.get(canvasId);
    if (!buffer || buffer.length === 0) return;

    await this.prisma.drawEvent.createMany({
      data: buffer.map(event => ({
        documentId: dbCanvasId,
        userId: event.userId,
        data: JSON.stringify(event),
      })),
    });

    // Clear buffer and keep only last 100
    this.drawEventBuffers.set(canvasId, []);

    // Clean up old draw events (keep only last 1000)
    const oldEvents = await this.prisma.drawEvent.findMany({
      where: { documentId: dbCanvasId },
      orderBy: { timestamp: 'desc' },
      skip: 1000,
      select: { id: true },
    });

    if (oldEvents.length > 0) {
      await this.prisma.drawEvent.deleteMany({
        where: {
          id: { in: oldEvents.map(e => e.id) },
        },
      });
    }
  }

  // Add a shape
  async addShape(canvasId, shapeData) {
    const canvas = await this._ensureCanvas(canvasId);

    await this.prisma.shape.create({
      data: {
        documentId: canvas.id,
        userId: shapeData.userId,
        type: shapeData.type || 'unknown',
        data: JSON.stringify(shapeData),
      },
    });
  }

  // Update a shape
  async updateShape(canvasId, shapeId, updates) {
    const existingShape = await this.prisma.shape.findUnique({
      where: { id: shapeId },
    });

    if (existingShape) {
      const currentData = JSON.parse(existingShape.data);
      const updatedData = { ...currentData, ...updates, id: shapeId };

      await this.prisma.shape.update({
        where: { id: shapeId },
        data: {
          data: JSON.stringify(updatedData),
        },
      });
    }
  }

  // Delete a shape
  async deleteShape(canvasId, shapeId) {
    await this.prisma.shape.delete({
      where: { id: shapeId },
    }).catch(() => {
      // Shape might not exist, ignore error
    });
  }

  // Clear canvas
  async clearCanvas(canvasId) {
    const canvas = await this._ensureCanvas(canvasId);

    await this.prisma.shape.deleteMany({
      where: { documentId: canvas.id },
    });

    await this.prisma.drawEvent.deleteMany({
      where: { documentId: canvas.id },
    });

    // Clear buffers
    this.drawEventBuffers.set(canvasId, []);
  }

  // Add user to canvas (in-memory only - ephemeral)
  addUser(canvasId, userId, username) {
    if (!this.activeUsers.has(canvasId)) {
      this.activeUsers.set(canvasId, new Map());
    }

    this.activeUsers.get(canvasId).set(userId, {
      userId,
      username,
      joinedAt: new Date().toISOString(),
    });
  }

  // Remove user from canvas (in-memory)
  removeUser(canvasId, userId) {
    if (this.activeUsers.has(canvasId)) {
      this.activeUsers.get(canvasId).delete(userId);
    }
  }

  // Get canvas users (in-memory)
  getCanvasUsers(canvasId) {
    if (!this.activeUsers.has(canvasId)) {
      return [];
    }
    return Array.from(this.activeUsers.get(canvasId).values());
  }

  // Get all canvases (for admin purposes)
  async getAllCanvases() {
    const canvases = await this.prisma.document.findMany({
      include: {
        _count: {
          select: { shapes: true },
        },
      },
    });

    return canvases.map(canvas => ({
      id: canvas.id,
      name: canvas.name,
      shapeCount: canvas._count.shapes,
      userCount: this.activeUsers.get(canvas.id)?.size || 0,
      createdAt: canvas.createdAt.toISOString(),
      lastModified: canvas.lastModified.toISOString(),
    }));
  }

  // Delete old canvases (cleanup job)
  async cleanupOldCanvases(maxAgeHours = 24) {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const oldCanvases = await this.prisma.document.findMany({
      where: {
        lastModified: { lt: cutoffTime },
      },
    });

    for (const canvas of oldCanvases) {
      const hasActiveUsers = this.activeUsers.get(canvas.id)?.size > 0;
      if (!hasActiveUsers) {
        await this.prisma.document.delete({
          where: { id: canvas.id },
        });
        console.log(`Cleaned up canvas: ${canvas.name}`);
      }
    }
  }

  // Helper to ensure canvas exists
  async _ensureCanvas(canvasId) {
    let canvas = await this.prisma.document.findUnique({
      where: { id: canvasId },
    });

    if (!canvas) {
      // Document not found - documents should be created through the API
      throw new Error(`Document ${canvasId} not found. Please create the document first.`);
    }

    return canvas;
  }
}

// Singleton instance
const canvasManager = new CanvasManager();

// Run cleanup every hour
setInterval(() => {
  canvasManager.cleanupOldCanvases(24);
}, 60 * 60 * 1000);

// Flush draw events periodically
setInterval(() => {
  for (const [canvasId] of canvasManager.drawEventBuffers) {
    canvasManager._ensureCanvas(canvasId).then(canvas => {
      canvasManager._flushDrawEvents(canvasId, canvas.id);
    });
  }
}, 10 * 1000); // Every 10 seconds

module.exports = canvasManager;
