const jwt = require('jsonwebtoken');

// Fastify authentication hook
async function authenticateToken(request, reply) {
  const authHeader = request.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return reply.code(401).send({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    request.user = user;
  } catch (err) {
    return reply.code(403).send({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  authenticateToken
};
