const jwt = require('jsonwebtoken');

// Middleware for HTTP routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware for Socket.IO connections
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Invalid or expired token'));
    }

    socket.user = {
      userId: decoded.userId,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      email: decoded.email
    };

    next();
  });
};

module.exports = {
  authenticateToken,
  authenticateSocket
};
