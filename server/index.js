require("dotenv").config(); // Load environment variables
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const readline = require("readline");
const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb"); // Add MongoClient
const bcrypt = require("bcrypt"); // Add bcrypt

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let db;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    db = client.db(); // Get database instance
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1); // Exit if DB connection fails
  }
}
connectDB();

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Register endpoint
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required");
  }

  try {
    const usersCollection = db.collection("users");
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Hash password

    await usersCollection.insertOne({ username, password: hashedPassword });
    res.status(201).send("User registered successfully");
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).send("Error registering user");
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required");
  }

  try {
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ username });

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign(
        { username: user.username, userId: user._id },
        JWT_SECRET,
        { expiresIn: "1h" }
      );
      res.json({ token });
    } else {
      res.status(401).send("Invalid credentials");
    }
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).send("Error logging in user");
  }
});

// Create HTTP server
const server = http.createServer(app);

// Middleware to authenticate WebSocket connections
const authenticateWs = (req, callback) => {
  const token = req.url.split("token=")[1];
  if (!token) {
    return callback(false, 401, "Unauthorized: No token provided");
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return callback(false, 401, "Unauthorized: Invalid token");
    }
    // You might want to fetch the user from DB here to ensure they still exist/are active
    req.user = decoded; // Attach user information to the request
    callback(true);
  });
};

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  verifyClient: (info, callback) => {
    authenticateWs(info.req, (allow, code, message) => {
      if (!allow) {
        console.log(`Connection rejected: ${message}`);
        callback(false, code, message);
      } else {
        callback(true);
      }
    });
  },
});

// Store connected clients
const clients = new Set();

// Set maximum number of clients
const MAX_CLIENTS = 5;

// Add these constants at the top with your other constants
const HEARTBEAT_INTERVAL = 15000; // Send ping every 15 seconds
const CLIENT_TIMEOUT = 60000; // Client considered dead after 60 seconds of no response

// Function to broadcast announcements to all clients
function broadcastAnnouncement(message) {
  const announcement = {
    type: "announcement",
    message: message,
    timestamp: new Date().toISOString(),
  };

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(announcement));
    }
  });

  console.log(`Announcement sent: ${message}`);
}

// Set up terminal input interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Process terminal commands
function processCommand(input) {
  const trimmedInput = input.trim();

  if (trimmedInput.startsWith("/announce ")) {
    const message = trimmedInput.substring(10);
    broadcastAnnouncement(message);
  } else if (trimmedInput === "/clients") {
    console.log(`Number of connected clients: ${clients.size}`);
  } else if (trimmedInput === "/help") {
    console.log("Available commands:");
    console.log("/announce <message> - Send announcement to all clients");
    console.log("/clients - Show number of connected clients");
    console.log("/help - Show available commands");
    console.log("/health - Check connection health");
  } else if (trimmedInput === "/health") {
    let healthy = 0;
    let stale = 0;
    const now = Date.now();

    clients.forEach((client) => {
      // Consider a client stale if:
      // 1. isAlive flag is false, OR
      // 2. No pong received for a significant time
      if (client.isAlive && now - client.lastPongTime < CLIENT_TIMEOUT / 2) {
        healthy++;
      } else {
        stale++;
      }
    });

    console.log(
      `Connection health: ${healthy} healthy, ${stale} stale connections`
    );
  } else if (trimmedInput) {
    console.log("Unknown command. Type /help for available commands");
  }
}

// Start listening for terminal input
console.log("Server terminal ready. Type /help for available commands.");
rl.on("line", processCommand);

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  // req is available here thanks to verifyClient
  // Check if client limit has been reached
  if (clients.size >= MAX_CLIENTS) {
    console.log("Connection rejected: Maximum client limit reached");
    ws.send(
      JSON.stringify({
        type: "system",
        message:
          "Connection rejected: Server has reached maximum capacity of 10 users",
        timestamp: new Date().toISOString(),
      })
    );

    // Close the connection
    ws.close();
    return;
  }

  console.log(`Client connected: ${req.user.username}`);
  clients.add(ws);

  // Initial setup when client connects
  ws.isAlive = true;
  ws.lastPongTime = Date.now();

  // Handle pong responses from client
  ws.on("pong", () => {
    ws.isAlive = true;
    ws.lastPongTime = Date.now();
  });

  // Send welcome message to the new client
  ws.send(
    JSON.stringify({
      type: "system",
      message: "Welcome to the chat!",
      timestamp: new Date().toISOString(),
    })
  );

  // Broadcast to all clients that a new user joined
  clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "system",
          message: "A new user has joined the chat",
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Handle messages from clients
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      // Handle ping messages
      if (parsedMessage.type === "ping") {
        // Reply with pong message and "Pong!" text
        ws.send(
          JSON.stringify({
            type: "pong",
            message: "Pong!",
            timestamp: parsedMessage.timestamp,
          })
        );
        return;
      }

      console.log(
        `Received from ${req.user.username}: ${parsedMessage.message}`
      );

      // Broadcast message to all connected clients
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "chat",
              username: req.user.username, // Use authenticated username
              message: parsedMessage.message,
              timestamp: new Date().toISOString(),
            })
          );
        }
      });
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log(`Client disconnected: ${req.user.username}`);
    clients.delete(ws);

    // Inform others that a user left
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "system",
            message: "A user has left the chat",
            timestamp: new Date().toISOString(),
          })
        );
      }
    });
  });
});

// Create the heartbeat interval
const heartbeatInterval = setInterval(() => {
  const now = Date.now();

  wss.clients.forEach((ws) => {
    // Check if time since last pong exceeds timeout
    if (ws.lastPongTime && now - ws.lastPongTime > CLIENT_TIMEOUT) {
      console.log("Client timed out after inactivity");
      ws.isAlive = false; // Mark as not alive before terminating
      return ws.terminate();
    }

    // Mark as not alive before sending ping
    // This way clients will show as stale if they don't respond
    ws.isAlive = false;

    // Send ping (using WebSocket protocol ping frame)
    try {
      ws.ping();
    } catch (e) {
      console.error("Error sending ping:", e);
      ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL);

// Stop the interval when server closes
wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

// Define the port
const PORT = process.env.PORT || 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
