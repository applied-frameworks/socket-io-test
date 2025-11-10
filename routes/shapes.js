const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../services/prisma');

// Create a new shape
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      documentId, type, x1, y1, x2, y2,
      strokeColor, fillColor, strokeSize,
      customLabel, points, order, data
    } = req.body;

    if (!documentId || !type) {
      return res.status(400).json({
        error: 'Document ID and type are required'
      });
    }

    // Verify user has access to document
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create shape with new schema fields
    const shape = await prisma.shape.create({
      data: {
        documentId,
        userId: req.user.userId,
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
        data
      }
    });

    console.log('Created shape:', shape.id);

    res.status(201).json({
      message: 'Shape created successfully',
      shape
    });
  } catch (error) {
    console.error('Error creating shape:', error);
    res.status(500).json({
      error: 'Internal server error while creating shape'
    });
  }
});

// Get all shapes for a document
router.get('/document/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Verify user has access to document
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all shapes ordered by order field then creation time
    const shapes = await prisma.shape.findMany({
      where: { documentId },
      orderBy: [
        { order: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    res.json({ shapes });
  } catch (error) {
    console.error('Error fetching shapes:', error);
    res.status(500).json({
      error: 'Internal server error while fetching shapes'
    });
  }
});

// Update a shape
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      x1, y1, x2, y2,
      strokeColor, fillColor, strokeSize,
      customLabel, points, order, data
    } = req.body;

    // Check if shape exists
    const existingShape = await prisma.shape.findUnique({
      where: { id },
      include: { document: true }
    });

    if (!existingShape) {
      return res.status(404).json({ error: 'Shape not found' });
    }

    // Verify user has access to the document
    if (existingShape.document.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update shape
    const shape = await prisma.shape.update({
      where: { id },
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
        data: data !== undefined ? data : undefined
      }
    });

    console.log('Updated shape:', shape.id);

    res.json({
      message: 'Shape updated successfully',
      shape
    });
  } catch (error) {
    console.error('Error updating shape:', error);
    res.status(500).json({
      error: 'Internal server error while updating shape'
    });
  }
});

// Delete a shape
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if shape exists
    const existingShape = await prisma.shape.findUnique({
      where: { id },
      include: { document: true }
    });

    if (!existingShape) {
      return res.status(404).json({ error: 'Shape not found' });
    }

    // Verify user has access to the document
    if (existingShape.document.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete shape
    await prisma.shape.delete({
      where: { id }
    });

    console.log('Deleted shape:', id);

    res.json({
      message: 'Shape deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shape:', error);
    res.status(500).json({
      error: 'Internal server error while deleting shape'
    });
  }
});

module.exports = router;
