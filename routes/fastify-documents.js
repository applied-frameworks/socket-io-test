const { authenticateToken } = require('../middleware/fastify-auth');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function documentRoutes(fastify, options) {
  // Get all documents for the current user
  fastify.get('/', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const documents = await prisma.document.findMany({
        where: {
          ownerId: request.user.userId
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          createdAt: true,
          lastModified: true,
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          lastModified: 'desc'
        }
      });

      return { documents };
    } catch (error) {
      console.error('Error fetching documents:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });

  // Create a new document
  fastify.post('/', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const { name } = request.body;

      if (!name || name.trim().length === 0) {
        return reply.code(400).send({
          error: 'Document name is required'
        });
      }

      if (name.trim().length > 100) {
        return reply.code(400).send({
          error: 'Document name must be less than 100 characters'
        });
      }

      const document = await prisma.document.create({
        data: {
          name: name.trim(),
          ownerId: request.user.userId
        },
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

      return reply.code(201).send({
        message: 'Document created successfully',
        document: {
          ...document,
          ownerId: document.ownerId
        }
      });
    } catch (error) {
      console.error('Error creating document:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });

  // Get a specific document
  fastify.get('/:id', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const document = await prisma.document.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          ownerId: true,
          createdAt: true,
          lastModified: true,
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
        return reply.code(404).send({
          error: 'Document not found'
        });
      }

      // Check if user owns the document
      if (document.ownerId !== request.user.userId) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }

      return { document };
    } catch (error) {
      console.error('Error fetching document:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });

  // Update a document
  fastify.put('/:id', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name } = request.body;

      if (!name || name.trim().length === 0) {
        return reply.code(400).send({
          error: 'Document name is required'
        });
      }

      if (name.trim().length > 100) {
        return reply.code(400).send({
          error: 'Document name must be less than 100 characters'
        });
      }

      // Check if document exists and user owns it
      const existingDocument = await prisma.document.findUnique({
        where: { id }
      });

      if (!existingDocument) {
        return reply.code(404).send({
          error: 'Document not found'
        });
      }

      if (existingDocument.ownerId !== request.user.userId) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }

      // Update document
      const document = await prisma.document.update({
        where: { id },
        data: {
          name: name.trim()
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          createdAt: true,
          lastModified: true,
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

      return {
        message: 'Document updated successfully',
        document
      };
    } catch (error) {
      console.error('Error updating document:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });

  // Delete a document
  fastify.delete('/:id', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if document exists and user owns it
      const existingDocument = await prisma.document.findUnique({
        where: { id }
      });

      if (!existingDocument) {
        return reply.code(404).send({
          error: 'Document not found'
        });
      }

      if (existingDocument.ownerId !== request.user.userId) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }

      // Delete document (cascade will handle document users)
      await prisma.document.delete({
        where: { id }
      });

      return { message: 'Document deleted successfully' };
    } catch (error) {
      console.error('Error deleting document:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });
}

module.exports = documentRoutes;
