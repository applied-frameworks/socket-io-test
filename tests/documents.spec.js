const { test, expect } = require('@playwright/test');

test.describe('Document CRUD API', () => {
  let userToken;
  let userId;
  let testEmail;
  let secondUserToken;
  let secondUserId;

  // Helper function to register a user and get token
  async function registerUser(request, suffix = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const email = `test_${timestamp}_${random}${suffix}@example.com`;

    const response = await request.post('/api/auth/register', {
      data: {
        firstName: 'Test',
        lastName: `User${timestamp}`,
        email: email,
        password: 'testPassword123'
      }
    });

    const data = await response.json();
    return {
      token: data.token,
      userId: data.user.id,
      email: email
    };
  }

  test.beforeEach(async ({ request }) => {
    // Register a primary test user
    const user = await registerUser(request);
    userToken = user.token;
    userId = user.userId;
    testEmail = user.email;
  });

  test.describe('Create Document', () => {
    test('should successfully create a document', async ({ request }) => {
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: 'My First Document'
        }
      });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data.message).toBe('Document created successfully');
      expect(data.document).toBeDefined();
      expect(data.document.id).toBeDefined();
      expect(data.document.name).toBe('My First Document');
      expect(data.document.ownerId).toBe(userId);
      expect(data.document.createdAt).toBeDefined();
      expect(data.document.lastModified).toBeDefined();
    });

    test('should trim whitespace from document name', async ({ request }) => {
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: '  Whitespace Document  '
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.document.name).toBe('Whitespace Document');
    });

    test('should fail without authentication', async ({ request }) => {
      const response = await request.post('/api/documents', {
        data: {
          name: 'Unauthorized Document'
        }
      });

      expect(response.status()).toBe(401);
    });

    test('should fail with empty document name', async ({ request }) => {
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: ''
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Document name is required');
    });

    test('should fail with whitespace-only document name', async ({ request }) => {
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: '   '
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Document name is required');
    });

    test('should fail with document name longer than 100 characters', async ({ request }) => {
      const longName = 'A'.repeat(101);
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: longName
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Document name must be less than 100 characters');
    });

    test('should accept document name with exactly 100 characters', async ({ request }) => {
      const exactLength = 'A'.repeat(100);
      const response = await request.post('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          name: exactLength
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.document.name).toBe(exactLength);
    });
  });

  test.describe('Get Documents', () => {
    test('should get empty list for new user', async ({ request }) => {
      const response = await request.get('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.documents).toBeDefined();
      expect(Array.isArray(data.documents)).toBeTruthy();
      expect(data.documents.length).toBe(0);
    });

    test('should get all user documents', async ({ request }) => {
      // Create multiple documents
      const doc1 = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document 1' }
      });
      const doc1Data = await doc1.json();

      const doc2 = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document 2' }
      });
      const doc2Data = await doc2.json();

      const doc3 = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document 3' }
      });
      const doc3Data = await doc3.json();

      // Get all documents
      const response = await request.get('/api/documents', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.documents.length).toBe(3);

      // Verify documents are sorted by lastModified (descending)
      expect(data.documents[0].id).toBe(doc3Data.document.id);
      expect(data.documents[1].id).toBe(doc2Data.document.id);
      expect(data.documents[2].id).toBe(doc1Data.document.id);
    });

    test('should only get documents owned by authenticated user', async ({ request }) => {
      // Create document for first user
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'User 1 Document' }
      });

      // Register second user
      const user2 = await registerUser(request, '_second');
      secondUserToken = user2.token;
      secondUserId = user2.userId;

      // Create document for second user
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` },
        data: { name: 'User 2 Document' }
      });

      // Get documents for first user
      const response1 = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data1 = await response1.json();
      expect(data1.documents.length).toBe(1);
      expect(data1.documents[0].name).toBe('User 1 Document');
      expect(data1.documents[0].ownerId).toBe(userId);

      // Get documents for second user
      const response2 = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      });
      const data2 = await response2.json();
      expect(data2.documents.length).toBe(1);
      expect(data2.documents[0].name).toBe('User 2 Document');
      expect(data2.documents[0].ownerId).toBe(secondUserId);
    });

    test('should fail to get documents without authentication', async ({ request }) => {
      const response = await request.get('/api/documents');
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Get Single Document', () => {
    test('should get a specific document', async ({ request }) => {
      // Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Specific Document' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Get the document
      const response = await request.get(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.document).toBeDefined();
      expect(data.document.id).toBe(documentId);
      expect(data.document.name).toBe('Specific Document');
      expect(data.document.owner).toBeDefined();
      expect(data.document.owner.id).toBe(userId);
    });

    test('should return 404 for non-existent document', async ({ request }) => {
      const response = await request.get('/api/documents/non-existent-id', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    test('should deny access to another user\'s document', async ({ request }) => {
      // Create document for first user
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Private Document' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Register second user
      const user2 = await registerUser(request, '_second');
      secondUserToken = user2.token;

      // Try to get document as second user
      const response = await request.get(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      });

      expect(response.status()).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');
    });
  });

  test.describe('Update Document', () => {
    test('should successfully update document name', async ({ request }) => {
      // Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Original Name' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Update the document
      const response = await request.put(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Updated Name' }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.message).toBe('Document updated successfully');
      expect(data.document.name).toBe('Updated Name');
      expect(data.document.id).toBe(documentId);
    });

    test('should update lastModified timestamp', async ({ request }) => {
      // Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Test Document' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;
      const originalModified = createData.document.lastModified;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update the document
      const response = await request.put(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Updated Name' }
      });

      const data = await response.json();
      expect(new Date(data.document.lastModified).getTime())
        .toBeGreaterThan(new Date(originalModified).getTime());
    });

    test('should fail to update with empty name', async ({ request }) => {
      // Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Original Name' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Try to update with empty name
      const response = await request.put(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: '' }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Document name is required');
    });

    test('should fail to update non-existent document', async ({ request }) => {
      const response = await request.put('/api/documents/non-existent-id', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'New Name' }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    test('should deny update to another user\'s document', async ({ request }) => {
      // Create document for first user
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'User 1 Document' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Register second user
      const user2 = await registerUser(request, '_second');
      secondUserToken = user2.token;

      // Try to update as second user
      const response = await request.put(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${secondUserToken}` },
        data: { name: 'Hacked Name' }
      });

      expect(response.status()).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');
    });
  });

  test.describe('Delete Document', () => {
    test('should successfully delete a document', async ({ request }) => {
      // Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document to Delete' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Delete the document
      const deleteResponse = await request.delete(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expect(deleteResponse.ok()).toBeTruthy();
      const deleteData = await deleteResponse.json();
      expect(deleteData.message).toBe('Document deleted successfully');

      // Verify it's deleted
      const getResponse = await request.get(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      expect(getResponse.status()).toBe(404);
    });

    test('should remove document from user\'s list after deletion', async ({ request }) => {
      // Create documents
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document 1' }
      });
      const doc2Response = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Document 2' }
      });
      const doc2Data = await doc2Response.json();

      // Verify we have 2 documents
      let listResponse = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      let listData = await listResponse.json();
      expect(listData.documents.length).toBe(2);

      // Delete one document
      await request.delete(`/api/documents/${doc2Data.document.id}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      // Verify we have 1 document
      listResponse = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      listData = await listResponse.json();
      expect(listData.documents.length).toBe(1);
      expect(listData.documents[0].name).toBe('Document 1');
    });

    test('should fail to delete non-existent document', async ({ request }) => {
      const response = await request.delete('/api/documents/non-existent-id', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    test('should deny deletion of another user\'s document', async ({ request }) => {
      // Create document for first user
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'User 1 Document' }
      });
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // Register second user
      const user2 = await registerUser(request, '_second');
      secondUserToken = user2.token;

      // Try to delete as second user
      const response = await request.delete(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      });

      expect(response.status()).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');

      // Verify document still exists for owner
      const getResponse = await request.get(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      expect(getResponse.ok()).toBeTruthy();
    });
  });

  test.describe('Integration Tests', () => {
    test('should handle complete document lifecycle', async ({ request }) => {
      // 1. Create a document
      const createResponse = await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Lifecycle Document' }
      });
      expect(createResponse.ok()).toBeTruthy();
      const createData = await createResponse.json();
      const documentId = createData.document.id;

      // 2. Get the document
      const getResponse = await request.get(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.document.name).toBe('Lifecycle Document');

      // 3. Update the document
      const updateResponse = await request.put(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'Updated Lifecycle Document' }
      });
      expect(updateResponse.ok()).toBeTruthy();

      // 4. Verify update in list
      const listResponse = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const listData = await listResponse.json();
      expect(listData.documents[0].name).toBe('Updated Lifecycle Document');

      // 5. Delete the document
      const deleteResponse = await request.delete(`/api/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      expect(deleteResponse.ok()).toBeTruthy();

      // 6. Verify deletion
      const finalListResponse = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const finalListData = await finalListResponse.json();
      expect(finalListData.documents.length).toBe(0);
    });

    test('should handle multiple users with multiple documents', async ({ request }) => {
      // User 1 creates 2 documents
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'User 1 Doc 1' }
      });
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        data: { name: 'User 1 Doc 2' }
      });

      // Register user 2
      const user2 = await registerUser(request, '_second');
      secondUserToken = user2.token;

      // User 2 creates 3 documents
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` },
        data: { name: 'User 2 Doc 1' }
      });
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` },
        data: { name: 'User 2 Doc 2' }
      });
      await request.post('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` },
        data: { name: 'User 2 Doc 3' }
      });

      // Verify each user sees only their documents
      const user1Response = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const user1Data = await user1Response.json();
      expect(user1Data.documents.length).toBe(2);

      const user2Response = await request.get('/api/documents', {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      });
      const user2Data = await user2Response.json();
      expect(user2Data.documents.length).toBe(3);
    });
  });
});
