const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../services/prisma');

// Create a new draw event
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { documentId, type, data } = req.body;

    if (!documentId || !data) {
      return res.status(400).json({
        error: 'Document ID and data are required'
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

    // Create draw event
    const drawEvent = await prisma.drawEvent.create({
      data: {
        documentId,
        userId: req.user.userId,
        data
      }
    });

    console.log('Created draw event:', drawEvent.id);

    res.status(201).json({
      message: 'Draw event created successfully',
      drawEvent
    });
  } catch (error) {
    console.error('Error creating draw event:', error);
    res.status(500).json({
      error: 'Internal server error while creating draw event'
    });
  }
});

// Get all draw events for a document
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

    // Get all draw events
    const drawEvents = await prisma.drawEvent.findMany({
      where: { documentId },
      orderBy: { timestamp: 'asc' }
    });

    res.json({ drawEvents });
  } catch (error) {
    console.error('Error fetching draw events:', error);
    res.status(500).json({
      error: 'Internal server error while fetching draw events'
    });
  }
});

module.exports = router;
