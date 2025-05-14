const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const readline = require('readline'); // Add readline for terminal input

const app = express();
app.use(cors());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// Set maximum number of clients
const MAX_CLIENTS = 5;

// Function to broadcast announcements to all clients
function broadcastAnnouncement(message) {
  const announcement = {
    type: 'announcement',
    message: message,
    timestamp: new Date().toISOString()
  };
  
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(announcement));
    }
  });
  
  console.log(`Announcement sent: ${message}`);
}

// Set up terminal input interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Process terminal commands
function processCommand(input) {
  const trimmedInput = input.trim();
  
  if (trimmedInput.startsWith('/announce ')) {
    const message = trimmedInput.substring(10);
    broadcastAnnouncement(message);
  } else if (trimmedInput === '/clients') {
    console.log(`Number of connected clients: ${clients.size}`);
  } else if (trimmedInput === '/help') {
    console.log('Available commands:');
    console.log('/announce <message> - Send announcement to all clients');
    console.log('/clients - Show number of connected clients');
    console.log('/help - Show available commands');
  } else if (trimmedInput) {
    console.log('Unknown command. Type /help for available commands');
  }
}

// Start listening for terminal input
console.log('Server terminal ready. Type /help for available commands.');
rl.on('line', processCommand);

// Handle WebSocket connections
wss.on('connection', (ws) => {
  // Check if client limit has been reached
  if (clients.size >= MAX_CLIENTS) {
    console.log('Connection rejected: Maximum client limit reached');
    ws.send(JSON.stringify({
      type: 'system',
      message: 'Connection rejected: Server has reached maximum capacity of 10 users',
      timestamp: new Date().toISOString()
    }));
    
    // Close the connection
    ws.close();
    return;
  }
  
  console.log('Client connected');
  clients.add(ws);
  
  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Welcome to the chat!',
    timestamp: new Date().toISOString()
  }));

  // Broadcast to all clients that a new user joined
  clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'system',
        message: 'A new user has joined the chat',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log(`Received: ${parsedMessage.message}`);

      // Broadcast message to all connected clients
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'chat',
            username: parsedMessage.username,
            message: parsedMessage.message,
            timestamp: new Date().toISOString()
          }));
        }
      });
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    
    // Inform others that a user left
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'system',
          message: 'A user has left the chat',
          timestamp: new Date().toISOString()
        }));
      }
    });
  });
});

// Define the port
const PORT = process.env.PORT || 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});