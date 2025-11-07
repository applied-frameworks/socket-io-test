const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all documents for the current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: {
        ownerId: req.user.userId
      },
      orderBy: {
        lastModified: 'desc'
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastModified: true,
        ownerId: true
      }
    });

    res.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Internal server error while fetching documents'
    });
  }
});

// Get a single document by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user owns the document
    if (document.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ document });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      error: 'Internal server error while fetching document'
    });
  }
});

// Create a new document
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Document name is required'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'Document name must be less than 100 characters'
      });
    }

    // Create document
    const document = await prisma.document.create({
      data: {
        name: name.trim(),
        ownerId: req.user.userId
      }
    });

    res.status(201).json({
      message: 'Document created successfully',
      document: {
        id: document.id,
        name: document.name,
        createdAt: document.createdAt,
        lastModified: document.lastModified,
        ownerId: document.ownerId
      }
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({
      error: 'Internal server error while creating document'
    });
  }
});

// Update a document
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Document name is required'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'Document name must be less than 100 characters'
      });
    }

    // Check if document exists and user owns it
    const existingDocument = await prisma.document.findUnique({
      where: { id }
    });

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (existingDocument.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update document
    const document = await prisma.document.update({
      where: { id },
      data: {
        name: name.trim()
      }
    });

    res.json({
      message: 'Document updated successfully',
      document: {
        id: document.id,
        name: document.name,
        createdAt: document.createdAt,
        lastModified: document.lastModified,
        ownerId: document.ownerId
      }
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      error: 'Internal server error while updating document'
    });
  }
});

// Delete a document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if document exists and user owns it
    const existingDocument = await prisma.document.findUnique({
      where: { id }
    });

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (existingDocument.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete document (cascade will delete related shapes and draw events)
    await prisma.document.delete({
      where: { id }
    });

    res.json({
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      error: 'Internal server error while deleting document'
    });
  }
});

module.exports = router;
