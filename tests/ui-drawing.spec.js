const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

test.describe('Drawing Functionality', () => {
  let prisma;
  let testUser;
  let testDocument;
  let authToken;

  test.beforeAll(async () => {
    prisma = new PrismaClient();

    // Create a test user with properly hashed password
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const password = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(password, 10);

    testUser = await prisma.user.create({
      data: {
        firstName: 'DrawTest',
        lastName: 'User',
        email: `drawtest_${timestamp}_${random}@example.com`,
        password: hashedPassword
      }
    });

    // Generate a valid JWT token
    authToken = jwt.sign(
      {
        userId: testUser.id,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        email: testUser.email
      },
      process.env.JWT_SECRET || 'ccc5a82389ffe2284f68af528a858091ab8b7c927df2a68d6509d6cba1ddd48aee0c27b54ecec3a7736d0127a0e79f697d3ac4defe788b9e88dc460ea8291eb5',
      { expiresIn: '7d' }
    );

    console.log(`\n🧪 Created test user: ${testUser.email}`);
  });

  test.afterAll(async () => {
    // Cleanup: delete test documents and user
    if (testUser) {
      // Delete all documents and shapes for this user
      const userDocuments = await prisma.document.findMany({
        where: { ownerId: testUser.id }
      });

      for (const doc of userDocuments) {
        await prisma.shape.deleteMany({ where: { documentId: doc.id } });
        await prisma.document.delete({ where: { id: doc.id } });
      }

      await prisma.user.delete({ where: { id: testUser.id } });
      console.log(`\n🧹 Cleaned up test user: ${testUser.email}`);
    }
    await prisma.$disconnect();
  });

  // Helper function to setup document for testing
  async function setupTestDocument(page) {
    // Set the auth token and user in localStorage
    await page.goto('http://localhost:8000');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, {
      token: authToken,
      user: {
        id: testUser.id,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        email: testUser.email
      }
    });

    // Create a new test document for this test
    const docName = `Test Doc ${Date.now()}`;
    const doc = await prisma.document.create({
      data: {
        name: docName,
        owner: {
          connect: { id: testUser.id }
        }
      }
    });

    // Navigate to the document
    await page.goto(`http://localhost:8000/editor/${doc.id}`);

    // Wait for canvas to be ready
    await page.waitForSelector('#canvas', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000); // Give WebGL time to initialize

    return doc;
  }

  // Helper to cleanup document after test
  async function cleanupDocument(doc) {
    if (doc) {
      await prisma.shape.deleteMany({ where: { documentId: doc.id } });
      await prisma.document.delete({ where: { id: doc.id } });
    }
  }

  test.describe('Core Drawing Tools', () => {
    test('should draw a rectangle', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing rectangle drawing...');

      // Click rectangle tool
      await page.click('#rectangle-btn');
      await expect(page.locator('#rectangle-btn')).toHaveClass(/active/);

      // Wait for tool to be fully set
      await page.waitForTimeout(100);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw a rectangle by clicking and dragging
      const startX = canvasBounds.x + 100;
      const startY = canvasBounds.y + 100;
      const endX = canvasBounds.x + 300;
      const endY = canvasBounds.y + 200;

      await page.mouse.move(startX, startY);
      await page.waitForTimeout(50); // Small delay before mousedown
      await page.mouse.down();
      await page.waitForTimeout(50); // Small delay to ensure drag is recognized
      await page.mouse.move(endX, endY, { steps: 10 }); // Slower movement with steps
      await page.waitForTimeout(50);
      await page.mouse.up();

      // Wait for shape to be created and persisted
      await page.waitForTimeout(800);

      // Verify rectangle was created in database
      const shapes = await prisma.shape.findMany({
        where: {
          documentId: doc.id,
          type: 'rectangle'  // Filter for rectangles only
        }
      });

      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes[0].type).toBe('rectangle');
      console.log('✅ Rectangle created successfully');

      await cleanupDocument(doc);
    });

    test('should draw ONLY a rectangle without extra white line', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing that rectangle drawing creates only ONE shape...');

      // Capture browser console logs
      const consoleLogs = [];
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DEBUG') || text.includes('shape') || text.includes('stroke')) {
          consoleLogs.push(text);
          console.log(`[BROWSER] ${text}`);
        }
      });

      // Click rectangle tool
      await page.click('#rectangle-btn');
      await expect(page.locator('#rectangle-btn')).toHaveClass(/active/);

      // Wait for tool to be fully set
      await page.waitForTimeout(100);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw a rectangle by clicking and dragging
      const startX = canvasBounds.x + 100;
      const startY = canvasBounds.y + 100;
      const endX = canvasBounds.x + 300;
      const endY = canvasBounds.y + 200;

      await page.mouse.move(startX, startY);
      await page.waitForTimeout(50);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.waitForTimeout(50);
      await page.mouse.up();

      // Wait for shape to be created and persisted
      await page.waitForTimeout(800);

      // Verify ONLY ONE shape was created (no extra white line)
      const allShapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      console.log(`📊 Total shapes created: ${allShapes.length} (expected 1)`);
      if (allShapes.length > 1) {
        console.log(`❌ Extra shapes found:`, allShapes.map(s => ({ type: s.type, id: s.id })));
      }

      // Should have exactly 1 shape
      expect(allShapes.length).toBe(1);
      expect(allShapes[0].type).toBe('rectangle');

      console.log('✅ Only one rectangle created (no extra white line)');

      await cleanupDocument(doc);
    });

    test('should draw a triangle', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing triangle drawing...');

      // Click triangle tool
      await page.click('#triangle-btn');
      await expect(page.locator('#triangle-btn')).toHaveClass(/active/);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw a triangle
      const startX = canvasBounds.x + 150;
      const startY = canvasBounds.y + 150;
      const endX = canvasBounds.x + 250;
      const endY = canvasBounds.y + 250;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY);
      await page.mouse.up();

      // Wait for shape to be created
      await page.waitForTimeout(500);

      // Verify shape was created in database
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      const triangle = shapes.find(s => s.type === 'triangle');
      expect(triangle).toBeTruthy();
      console.log('✅ Triangle created successfully');

      await cleanupDocument(doc);
    });

    test('should draw an ellipse', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing ellipse drawing...');

      // Click ellipse tool
      await page.click('#ellipse-btn');
      await expect(page.locator('#ellipse-btn')).toHaveClass(/active/);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw an ellipse
      const startX = canvasBounds.x + 200;
      const startY = canvasBounds.y + 200;
      const endX = canvasBounds.x + 350;
      const endY = canvasBounds.y + 300;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY);
      await page.mouse.up();

      // Wait for shape to be created
      await page.waitForTimeout(500);

      // Verify shape was created in database
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      const ellipse = shapes.find(s => s.type === 'ellipse');
      expect(ellipse).toBeTruthy();
      console.log('✅ Ellipse created successfully');

      await cleanupDocument(doc);
    });

    test('should use brush tool for freehand drawing', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing brush drawing...');

      // Brush should be active by default
      await expect(page.locator('#brush-btn')).toHaveClass(/active/);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw a simple line
      const startX = canvasBounds.x + 100;
      const startY = canvasBounds.y + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();

      // Draw a curved line
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(startX + i * 10, startY + Math.sin(i) * 20);
      }

      await page.mouse.up();

      // Wait for drawing to be processed
      await page.waitForTimeout(500);

      // Brush creates shapes too (stroke paths)
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      expect(shapes.length).toBeGreaterThan(0);
      console.log('✅ Brush drawing created successfully');

      await cleanupDocument(doc);
    });
  });

  test.describe('Color and Opacity Controls', () => {
    test('should change stroke color', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing stroke color change...');

      // Change stroke color to red
      await page.locator('#color-picker').fill('#ff0000');

      // Verify color was set (check the input value)
      const colorValue = await page.locator('#color-picker').inputValue();
      expect(colorValue).toBe('#ff0000');

      // Draw a shape with the new color
      await page.click('#rectangle-btn');
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      await page.mouse.move(canvasBounds.x + 100, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 200);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Verify shape was created
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      expect(shapes.length).toBeGreaterThan(0);
      console.log('✅ Stroke color changed successfully');

      await cleanupDocument(doc);
    });

    test('should change fill color', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing fill color change...');

      // Change fill color to blue
      await page.locator('#fill-picker').fill('#0000ff');

      // Change fill opacity to visible
      await page.locator('#fill-opacity-slider').fill('100');

      // Verify values
      const fillColor = await page.locator('#fill-picker').inputValue();
      const fillOpacity = await page.locator('#fill-opacity-slider').inputValue();

      expect(fillColor).toBe('#0000ff');
      expect(fillOpacity).toBe('100');

      console.log('✅ Fill color and opacity changed successfully');

      await cleanupDocument(doc);
    });

    test('should adjust stroke opacity', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing stroke opacity change...');

      // Set stroke opacity to 50%
      await page.locator('#stroke-opacity-slider').fill('50');

      const opacityValue = await page.locator('#stroke-opacity-slider').inputValue();
      expect(opacityValue).toBe('50');

      console.log('✅ Stroke opacity changed successfully');

      await cleanupDocument(doc);
    });

    test('should adjust brush size', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing brush size change...');

      // Set size to maximum
      await page.locator('#size-slider').fill('50');

      const sizeValue = await page.locator('#size-slider').inputValue();
      expect(sizeValue).toBe('50');

      // Set size to minimum
      await page.locator('#size-slider').fill('1');

      const minSizeValue = await page.locator('#size-slider').inputValue();
      expect(minSizeValue).toBe('1');

      console.log('✅ Brush size adjusted successfully');

      await cleanupDocument(doc);
    });
  });

  test.describe('Tool Switching', () => {
    test('should NOT draw with select/pointer tool', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing that select tool does not draw lines...');

      // Check if there are any shapes created during page load
      const shapesBeforeTest = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });
      console.log(`📊 Shapes before test starts: ${shapesBeforeTest.length}`);
      if (shapesBeforeTest.length > 0) {
        console.log(`⚠️  Shapes exist before test:`, shapesBeforeTest.map(s => ({ type: s.type, id: s.id })));
        // Clean them up
        await prisma.shape.deleteMany({ where: { documentId: doc.id } });
        console.log(`🧹 Cleaned up ${shapesBeforeTest.length} shapes before test`);
      }

      // First, manually set the tool via JavaScript to ensure it's set
      await page.evaluate(() => {
        // Find the WebGLDrawingApp instance
        const canvas = document.getElementById('canvas');
        if (canvas && canvas.glContext) {
          // The app stores gl context on the canvas
          console.log('[TEST] Found canvas with WebGL context');
        }

        // Try to find appRef through React's fiber
        const container = document.getElementById('container');
        console.log('[TEST] Container found:', !!container);
      });

      // Switch to select tool via clicking
      await page.click('#select-btn');
      await expect(page.locator('#select-btn')).toHaveClass(/active/);

      // Ensure brush is no longer active
      await expect(page.locator('#brush-btn')).not.toHaveClass(/active/);

      // Wait longer for tool to be fully set and WebGL state to update
      await page.waitForTimeout(500);

      // Verify the tool was actually set in JavaScript
      const currentTool = await page.evaluate(() => {
        const canvas = document.getElementById('canvas');
        // Try to access the WebGLDrawingApp instance
        // It might be stored on the canvas or in a React ref
        return window.currentTool || 'unknown';
      });
      console.log(`[TEST] Current tool after click: ${currentTool}`);

      // Get canvas element
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Try to draw by clicking and dragging
      const startX = canvasBounds.x + 100;
      const startY = canvasBounds.y + 100;
      const endX = canvasBounds.x + 300;
      const endY = canvasBounds.y + 200;

      // Check tool before drag
      const toolBeforeDrag = await page.evaluate(() => window.currentTool);
      console.log(`[TEST] Tool before drag: ${toolBeforeDrag}`);

      await page.mouse.move(startX, startY);
      await page.waitForTimeout(50);
      await page.mouse.down();
      await page.waitForTimeout(50);

      // Check tool during drag (after mouse down)
      const toolDuringDrag = await page.evaluate(() => window.currentTool);
      console.log(`[TEST] Tool during drag (after mousedown): ${toolDuringDrag}`);

      // Drag across the canvas
      await page.mouse.move(endX, endY, { steps: 20 });
      await page.waitForTimeout(50);
      await page.mouse.up();

      // Check tool after drag
      const toolAfterDrag = await page.evaluate(() => window.currentTool);
      console.log(`[TEST] Tool after drag: ${toolAfterDrag}`);

      // Wait to see if any shapes were accidentally created
      await page.waitForTimeout(800);

      // Verify NO shapes were created in database
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      console.log(`📊 Shapes created with select tool: ${shapes.length} (expected 0)`);
      if (shapes.length > 0) {
        console.log(`❌ Unexpected shapes:`, shapes.map(s => ({ type: s.type, id: s.id })));
      }

      // Should have zero shapes - select tool should not draw
      expect(shapes.length).toBe(0);

      console.log('✅ Select tool correctly does not draw lines');

      await cleanupDocument(doc);
    });

    test('should switch between tools correctly', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing tool switching...');

      // Start with brush (should be active by default)
      await expect(page.locator('#brush-btn')).toHaveClass(/active/);

      // Switch to rectangle
      await page.click('#rectangle-btn');
      await expect(page.locator('#rectangle-btn')).toHaveClass(/active/);
      await expect(page.locator('#brush-btn')).not.toHaveClass(/active/);

      // Switch to triangle
      await page.click('#triangle-btn');
      await expect(page.locator('#triangle-btn')).toHaveClass(/active/);
      await expect(page.locator('#rectangle-btn')).not.toHaveClass(/active/);

      // Switch to ellipse
      await page.click('#ellipse-btn');
      await expect(page.locator('#ellipse-btn')).toHaveClass(/active/);
      await expect(page.locator('#triangle-btn')).not.toHaveClass(/active/);

      // Switch to select
      await page.click('#select-btn');
      await expect(page.locator('#select-btn')).toHaveClass(/active/);
      await expect(page.locator('#ellipse-btn')).not.toHaveClass(/active/);

      // Switch to eraser
      await page.click('#eraser-btn');
      await expect(page.locator('#eraser-btn')).toHaveClass(/active/);
      await expect(page.locator('#select-btn')).not.toHaveClass(/active/);

      // Switch back to brush
      await page.click('#brush-btn');
      await expect(page.locator('#brush-btn')).toHaveClass(/active/);
      await expect(page.locator('#eraser-btn')).not.toHaveClass(/active/);

      console.log('✅ Tool switching works correctly');

      await cleanupDocument(doc);
    });

    test('should maintain tool state after drawing', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing tool state persistence...');

      // Switch to rectangle
      await page.click('#rectangle-btn');

      // Draw a rectangle
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      await page.mouse.move(canvasBounds.x + 100, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 200);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Rectangle tool should still be active
      await expect(page.locator('#rectangle-btn')).toHaveClass(/active/);

      console.log('✅ Tool state maintained after drawing');

      await cleanupDocument(doc);
    });
  });

  test.describe('Shape Selection and Deletion', () => {
    test('should select and delete a shape', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing shape selection and deletion...');

      // First, draw a rectangle
      await page.click('#rectangle-btn');
      await page.waitForTimeout(100); // Wait for tool to be set

      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      const rectCenterX = canvasBounds.x + 150;
      const rectCenterY = canvasBounds.y + 150;

      await page.mouse.move(canvasBounds.x + 100, canvasBounds.y + 100);
      await page.waitForTimeout(50);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 200, { steps: 10 });
      await page.waitForTimeout(50);
      await page.mouse.up();

      // Wait for shape to be created and persisted
      await page.waitForTimeout(800);

      // Verify rectangle was created (filter by type to avoid counting accidental brush strokes)
      let rectangles = await prisma.shape.findMany({
        where: {
          documentId: doc.id,
          type: 'rectangle'
        }
      });
      expect(rectangles.length).toBeGreaterThan(0);
      console.log(`📊 Initial rectangle count: ${rectangles.length}`);

      // Switch to select tool
      await page.click('#select-btn');
      await page.waitForTimeout(100);

      // Click on the rectangle to select it
      await page.mouse.click(rectCenterX, rectCenterY);
      await page.waitForTimeout(500); // Wait for selection to register

      // Delete the shape via keyboard
      await page.keyboard.press('Delete');

      // Wait longer for deletion to propagate to database
      await page.waitForTimeout(1000);

      // Verify rectangle was deleted from database
      rectangles = await prisma.shape.findMany({
        where: {
          documentId: doc.id,
          type: 'rectangle'
        }
      });

      console.log(`📊 Final rectangle count: ${rectangles.length} (expected 0)`);

      // Should have zero rectangles after deletion
      expect(rectangles.length).toBe(0);

      console.log('✅ Shape selected and deleted successfully');

      await cleanupDocument(doc);
    });

    test('should align transform box correctly with selected shape', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing transform box alignment...');

      // Test with different shape types at various positions
      const shapesToTest = [
        { tool: '#rectangle-btn', type: 'rectangle', name: 'Rectangle' },
        { tool: '#triangle-btn', type: 'triangle', name: 'Triangle' },
        { tool: '#ellipse-btn', type: 'ellipse', name: 'Ellipse' }
      ];

      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      for (const shape of shapesToTest) {
        console.log(`  Testing ${shape.name}...`);

        // Draw the shape
        await page.click(shape.tool);
        await page.waitForTimeout(100);

        const startX = canvasBounds.x + 300;
        const startY = canvasBounds.y + 200;
        const endX = canvasBounds.x + 500;
        const endY = canvasBounds.y + 400;

        await page.mouse.move(startX, startY);
        await page.waitForTimeout(50);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.waitForTimeout(50);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Switch to select tool
        await page.click('#select-btn');
        await page.waitForTimeout(100);

        // Click on the shape to select it
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        await page.mouse.click(centerX, centerY);
        await page.waitForTimeout(500);

        // Get the selection box element
        const selectionBox = page.locator('#selection-box');
        await expect(selectionBox).toBeVisible();

        // Get the bounding box of the selection UI
        const selectionBounds = await selectionBox.boundingBox();

        // The selection box should be aligned with the drawn shape
        // Allow for 5px tolerance due to border width and rounding
        const tolerance = 5;

        expect(Math.abs(selectionBounds.x - startX)).toBeLessThan(tolerance);
        expect(Math.abs(selectionBounds.y - startY)).toBeLessThan(tolerance);
        expect(Math.abs((selectionBounds.x + selectionBounds.width) - endX)).toBeLessThan(tolerance);
        expect(Math.abs((selectionBounds.y + selectionBounds.height) - endY)).toBeLessThan(tolerance);

        console.log(`  ✅ ${shape.name} transform box aligned correctly`);
      }

      console.log('✅ All transform boxes aligned correctly');

      await cleanupDocument(doc);
    });
  });

  test.describe('Clear Canvas', () => {
    test('should clear all shapes from canvas', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing clear canvas...');

      // Draw multiple shapes
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      // Draw rectangle
      await page.click('#rectangle-btn');
      await page.mouse.move(canvasBounds.x + 50, canvasBounds.y + 50);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 100, canvasBounds.y + 100);
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Draw triangle
      await page.click('#triangle-btn');
      await page.mouse.move(canvasBounds.x + 150, canvasBounds.y + 150);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Draw ellipse
      await page.click('#ellipse-btn');
      await page.mouse.move(canvasBounds.x + 250, canvasBounds.y + 250);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 300, canvasBounds.y + 300);
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Verify shapes were created
      let shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });
      expect(shapes.length).toBeGreaterThanOrEqual(3);
      console.log(`📊 Created ${shapes.length} shapes`);

      // Mock the confirm dialog to auto-accept
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Clear the entire canvas');
        await dialog.accept();
      });

      // Click clear button
      await page.click('#clear-btn');
      await page.waitForTimeout(500);

      // Verify all shapes were deleted from database
      shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      expect(shapes.length).toBe(0);
      console.log('✅ Canvas cleared successfully');

      await cleanupDocument(doc);
    });

    test('should cancel clear canvas operation', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing clear canvas cancellation...');

      // Draw a shape
      await page.click('#rectangle-btn');
      const canvas = page.locator('#canvas');
      const canvasBounds = await canvas.boundingBox();

      await page.mouse.move(canvasBounds.x + 100, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 200);
      await page.mouse.up();
      await page.waitForTimeout(500);

      // Get initial shape count
      const initialShapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });
      const initialCount = initialShapes.length;

      // Mock the confirm dialog to dismiss
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });

      // Click clear button but cancel
      await page.click('#clear-btn');
      await page.waitForTimeout(500);

      // Verify shapes were NOT deleted
      const shapes = await prisma.shape.findMany({
        where: { documentId: doc.id }
      });

      expect(shapes.length).toBe(initialCount);
      console.log('✅ Clear canvas cancelled successfully');

      await cleanupDocument(doc);
    });
  });

  test.describe('Visual Feedback', () => {
    test('should show status message', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing status display...');

      // Check status element exists and shows "Ready"
      const status = page.locator('#status');
      await expect(status).toBeVisible();
      await expect(status).toContainText('Ready');

      console.log('✅ Status message displayed');

      await cleanupDocument(doc);
    });

    test('should show outline panel', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing outline panel...');

      // Verify outline panel exists
      await expect(page.locator('#outline-panel')).toBeVisible();
      await expect(page.locator('#outline-tab')).toBeVisible();
      await expect(page.locator('#history-tab')).toBeVisible();

      // Outline tab should be active by default
      await expect(page.locator('#outline-tab')).toHaveClass(/active/);

      console.log('✅ Outline panel displayed');

      await cleanupDocument(doc);
    });

    test('should switch between outline and history tabs', async ({ page }) => {
      const doc = await setupTestDocument(page);

      console.log('🎨 Testing tab switching...');

      // Click history tab
      await page.click('#history-tab');
      await expect(page.locator('#history-tab')).toHaveClass(/active/);
      await expect(page.locator('#outline-tab')).not.toHaveClass(/active/);

      // Click outline tab
      await page.click('#outline-tab');
      await expect(page.locator('#outline-tab')).toHaveClass(/active/);
      await expect(page.locator('#history-tab')).not.toHaveClass(/active/);

      console.log('✅ Tab switching works correctly');

      await cleanupDocument(doc);
    });
  });
});
