// Document Manager - Database-backed with Prisma
// Manages document collaboration with persistent shapes
const prisma = require('./prisma');

class DocumentManager {
  constructor() {
    // In-memory cache for active users (ephemeral)
    this.activeUsers = new Map(); // Map<documentId, Map<userId, userInfo>>
  }

  // Get document state with all shapes
  async getDocumentState(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        shapes: {
          orderBy: [
            { order: 'asc' },
            { createdAt: 'asc' }
          ],
        },
      },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Initialize active users cache if needed
    if (!this.activeUsers.has(documentId)) {
      this.activeUsers.set(documentId, new Map());
    }

    return {
      id: document.id,
      name: document.name,
      shapes: document.shapes,
      users: Array.from(this.activeUsers.get(documentId).values()),
      lastModified: document.lastModified.toISOString(),
    };
  }

  // Add a shape to the document
  async addShape(documentId, shapeData) {
    const {
      id, type, x1, y1, x2, y2,
      strokeColor, fillColor, strokeSize,
      customLabel, points, order, userId
    } = shapeData;

    const shape = await prisma.shape.create({
      data: {
        id: id || undefined, // Use provided ID or let Prisma generate
        documentId,
        userId,
        type,
        x1: x1 !== undefined ? parseFloat(x1) : null,
        y1: y1 !== undefined ? parseFloat(y1) : null,
        x2: x2 !== undefined ? parseFloat(x2) : null,
        y2: y2 !== undefined ? parseFloat(y2) : null,
        strokeColor,
        fillColor,
        strokeSize: strokeSize !== undefined ? parseFloat(strokeSize) : null,
        customLabel,
        points,
        order: order !== undefined ? parseInt(order) : 0,
      },
    });

    console.log('Shape created:', shape.id);
    return shape;
  }

  // Update a shape
  async updateShape(documentId, shapeId, updates) {
    const {
      x1, y1, x2, y2,
      strokeColor, fillColor, strokeSize,
      customLabel, points, order
    } = updates;

    const shape = await prisma.shape.update({
      where: { id: shapeId },
      data: {
        x1: x1 !== undefined ? parseFloat(x1) : undefined,
        y1: y1 !== undefined ? parseFloat(y1) : undefined,
        x2: x2 !== undefined ? parseFloat(x2) : undefined,
        y2: y2 !== undefined ? parseFloat(y2) : undefined,
        strokeColor: strokeColor !== undefined ? strokeColor : undefined,
        fillColor: fillColor !== undefined ? fillColor : undefined,
        strokeSize: strokeSize !== undefined ? parseFloat(strokeSize) : undefined,
        customLabel: customLabel !== undefined ? customLabel : undefined,
        points: points !== undefined ? points : undefined,
        order: order !== undefined ? parseInt(order) : undefined,
      },
    });

    console.log('Shape updated:', shape.id);
    return shape;
  }

  // Delete a shape
  async deleteShape(documentId, shapeId) {
    try {
      await prisma.shape.delete({
        where: { id: shapeId },
      });
      console.log('Shape deleted:', shapeId);
    } catch (error) {
      console.error('Error deleting shape:', error);
      // Shape might not exist, ignore error
    }
  }

  // Clear all shapes from a document
  async clearDocument(documentId) {
    await prisma.shape.deleteMany({
      where: { documentId },
    });

    console.log('Document cleared:', documentId);
  }

  // Add user to document (in-memory only - ephemeral)
  addUser(documentId, userId, userInfo) {
    if (!this.activeUsers.has(documentId)) {
      this.activeUsers.set(documentId, new Map());
    }

    this.activeUsers.get(documentId).set(userId, {
      userId,
      ...userInfo,
      joinedAt: new Date().toISOString(),
    });
  }

  // Remove user from document (in-memory)
  removeUser(documentId, userId) {
    if (this.activeUsers.has(documentId)) {
      this.activeUsers.get(documentId).delete(userId);
    }
  }

  // Get document users (in-memory)
  getDocumentUsers(documentId) {
    if (!this.activeUsers.has(documentId)) {
      return [];
    }
    return Array.from(this.activeUsers.get(documentId).values());
  }
}

// Singleton instance
const documentManager = new DocumentManager();

module.exports = documentManager;
