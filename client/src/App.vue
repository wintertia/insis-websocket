<template>
  <div id="app-container">
    <LoginView
      v-if="currentView === 'login'"
      @show-register="currentView = 'register'"
      @login-success="handleLoginSuccess"
    />
    <RegisterView
      v-else-if="currentView === 'register'"
      @show-login="currentView = 'login'"
    />
    <div
      v-else-if="currentView === 'chat' && isAuthenticated"
      class="chat-container"
    >
      <header class="header">
        <h1>Simple WebSocket Chat</h1>
        <div class="user-info">
          <span>Logged in as: {{ username }}</span>
          <button @click="logout" class="logout-button">Logout</button>
        </div>
        <div v-if="connected" class="connection-status">
          <button @click="sendPing" class="ping-button">Ping Server</button>
          <span v-if="latency !== null" class="latency">
            Last ping: {{ latency }}ms
          </span>
        </div>
      </header>

      <div class="chat-box" ref="chatBox">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="['message', msg.type]"
        >
          <span v-if="msg.type === 'chat'" class="username"
            >{{ msg.username }}:</span
          >
          <span class="content">{{ msg.message }}</span>
          <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
        </div>
      </div>

      <div class="input-area">
        <input
          v-model="username"
          placeholder="Your name"
          class="username-input"
          :disabled="connected"
        />
        <input
          v-model="message"
          placeholder="Type a message..."
          class="message-input"
          @keyup.enter="sendMessage"
          :disabled="!connected || !username"
        />
        <button
          @click="connected ? sendMessage() : connect()"
          :disabled="!username && !connected"
          class="send-button"
        >
          {{ connected ? "Send" : "Connect" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import LoginView from "./components/Login.vue";
import RegisterView from "./components/Register.vue";

export default {
  name: "App",
  components: {
    LoginView,
    RegisterView,
  },
  data() {
    return {
      websocket: null,
      connected: false,
      username: "", // Will be set from token or login
      message: "",
      messages: [],
      pingTime: null,
      latency: null,
      heartbeatInterval: null,
      lastServerResponse: Date.now(),
      connectionHealthy: true,
      isAuthenticated: false,
      token: localStorage.getItem("authToken") || null,
      currentView: "login", // can be 'login', 'register', or 'chat'
    };
  },
  created() {
    if (this.token) {
      // Optionally, verify token with server here or decode to get username
      // For simplicity, we'll assume token is valid if it exists
      try {
        const decodedToken = JSON.parse(atob(this.token.split(".")[1])); // Basic JWT decode
        this.username = decodedToken.username;
        this.isAuthenticated = true;
        this.currentView = "chat";
        this.connect(); // Auto-connect if token exists
      } catch (e) {
        console.error("Error decoding token:", e);
        localStorage.removeItem("authToken");
        this.token = null;
        this.currentView = "login";
      }
    } else {
      this.currentView = "login";
    }
  },
  methods: {
    handleLoginSuccess(authToken) {
      this.token = authToken;
      localStorage.setItem("authToken", authToken);
      try {
        const decodedToken = JSON.parse(atob(this.token.split(".")[1]));
        this.username = decodedToken.username;
        this.isAuthenticated = true;
        this.currentView = "chat";
        this.connect();
      } catch (e) {
        console.error("Error decoding token after login:", e);
        this.logout(); // Clear invalid token state
      }
    },
    logout() {
      if (this.websocket) {
        this.websocket.close();
      }
      this.token = null;
      localStorage.removeItem("authToken");
      this.isAuthenticated = false;
      this.connected = false;
      this.username = "";
      this.messages = [];
      this.currentView = "login";
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    },
    sendPing() {
      if (!this.connected || !this.websocket) {
        this.messages.push({
          type: "system",
          message: "Not connected to server",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      this.pingTime = Date.now();

      this.websocket.send(
        JSON.stringify({
          type: "ping",
          timestamp: this.pingTime,
        })
      );

      this.messages.push({
        type: "system",
        message: "Pinging server...",
        timestamp: new Date().toISOString(),
      });
    },

    connect() {
      // if (!this.username.trim()) {
      //   alert('Please enter a username');
      //   return;
      // }
      if (!this.token) {
        this.messages.push({
          type: "system",
          message: "Authentication token not found. Please login.",
          timestamp: new Date().toISOString(),
        });
        this.currentView = "login";
        return;
      }

      // Append token to WebSocket URL
      this.websocket = new WebSocket(`ws://localhost:3000?token=${this.token}`);

      this.websocket.onopen = () => {
        console.log("Connected to the server");
        this.connected = true;
        this.startHeartbeatCheck();
      };

      this.websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        this.lastServerResponse = Date.now();
        this.connectionHealthy = true;

        if (
          data.type === "system" &&
          data.message &&
          data.message.toLowerCase().includes("unauthorized")
        ) {
          this.messages.push({
            type: "system",
            message: `Auth Error: ${data.message}. Logging out.`,
            timestamp: new Date().toISOString(),
          });
          this.logout();
          return;
        }

        if (data.type === "pong" && this.pingTime) {
          const latency = Date.now() - data.timestamp;
          this.latency = latency;

          this.messages.push({
            type: "system",
            message: `${data.message} (${latency}ms)`,
            timestamp: new Date().toISOString(),
          });

          this.pingTime = null;
          return;
        }

        if (data.type === "announcement") {
          this.displayAnnouncement(data.message);
        } else {
          this.messages.push(data);

          if (
            data.type === "system" &&
            data.message.includes(
              "Connection rejected: Server has reached maximum capacity"
            )
          ) {
            this.connected = false;
          }

          this.$nextTick(() => {
            this.scrollToBottom();
          });
        }
      };

      this.websocket.onclose = () => {
        console.log("Disconnected from the server");
        this.connected = false;
        // Avoid pushing disconnect message if it was a logout action
        if (this.currentView === "chat") {
          this.messages.push({
            type: "system",
            message:
              "Disconnected from server. Attempting to reconnect or login again.",
            timestamp: new Date().toISOString(),
          });
        }
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        // Optionally, try to reconnect or force logout if token becomes invalid
        // For now, we'll just show disconnected and user can try to login again if needed
      };

      this.websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.messages.push({
          type: "system",
          message: "Error connecting to server.",
          timestamp: new Date().toISOString(),
        });
      };
    },

    sendMessage() {
      if (!this.message.trim() || !this.connected) return;

      const messageObj = {
        // username: this.username, // Username is now derived from token on server-side
        message: this.message,
      };

      this.websocket.send(JSON.stringify(messageObj));
      this.message = "";
    },

    scrollToBottom() {
      const chatBox = this.$refs.chatBox;
      chatBox.scrollTop = chatBox.scrollHeight;
    },

    formatTime(timestamp) {
      if (!timestamp) return "";
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    },

    displayAnnouncement(message) {
      const announcementElement = document.createElement("div");
      announcementElement.classList.add("announcement");
      announcementElement.textContent = `📢 ANNOUNCEMENT: ${message}`;
      this.$refs.chatBox.appendChild(announcementElement);
    },

    startHeartbeatCheck() {
      this.heartbeatInterval = setInterval(() => {
        const now = Date.now();
        if (now - this.lastServerResponse > 45000) {
          if (this.connectionHealthy) {
            this.connectionHealthy = false;
            console.log(
              "Connection appears to be dead, attempting to reconnect"
            );
            this.messages.push({
              type: "system",
              message: "Connection to server lost. Attempting to reconnect...",
              timestamp: new Date().toISOString(),
            });

            if (this.websocket) {
              this.websocket.close();
              setTimeout(() => this.connect(), 2000);
            }
          }
        }
      }, 30000);
    },

    stopHeartbeatCheck() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    },
  },

  beforeUnmount() {
    if (this.websocket) {
      this.websocket.close();
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  },
};
</script>

<style>
/* Add some basic styling for the app container and auth views */
#app-container {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 0px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 800px; /* Or your preferred max width */
  width: 100%;
  margin: 0 auto;
  border: 1px solid #ccc;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  overflow: hidden; /* Prevents chat box from making page scroll */
}

.header {
  background-color: #f0f0f0;
  padding: 15px;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: 1.5em;
}

.user-info {
  display: flex;
  align-items: center;
}

.user-info span {
  margin-right: 10px;
}

.logout-button {
  padding: 5px 10px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.logout-button:hover {
  background-color: #c0392b;
}

.connection-status {
  display: flex;
  align-items: center;
}

.ping-button {
  margin-right: 10px;
  padding: 5px 10px;
}

.latency {
  font-size: 0.9em;
  color: #555;
}

.chat-box {
  flex-grow: 1;
  padding: 15px;
  overflow-y: auto;
  background-color: #fff;
  border-bottom: 1px solid #ddd;
}

.message {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 15px;
  max-width: 70%;
  word-wrap: break-word;
}

.message.chat {
  background-color: #3498db;
  color: white;
  align-self: flex-start; /* Default to other users */
  margin-left: 0; /* Default to other users */
  margin-right: auto; /* Default to other users */
}

.message.chat .username {
  font-weight: bold;
  margin-right: 5px;
}

.message.system {
  background-color: #ecf0f1;
  color: #7f8c8d;
  font-style: italic;
  text-align: center;
  align-self: center;
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
}

.message.announcement {
  background-color: #f1c40f;
  color: #333;
  font-weight: bold;
  text-align: center;
  padding: 10px;
  border-radius: 0; /* Full width style */
  margin: 10px 0;
}

.content {
  display: block;
}

.timestamp {
  font-size: 0.75em;
  color: #eee; /* Lighter for chat, adjust if needed */
  display: block;
  text-align: right;
  margin-top: 3px;
}

.message.system .timestamp {
  color: #95a5a6;
}

.input-area {
  display: flex;
  padding: 15px;
  background-color: #f9f9f9;
}

.username-input {
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-right: 10px;
  width: 150px; /* Adjust as needed */
}

.message-input {
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-right: 10px;
}

.send-button {
  padding: 10px 15px;
  background-color: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.send-button:disabled {
  background-color: #bdc3c7;
}

.send-button:hover:not(:disabled) {
  background-color: #27ae60;
}

/* Styles from Login.vue and Register.vue can be global or scoped. */
/* If they were scoped, you might need to adjust or make some global. */
/* For simplicity, ensure their styles don't clash or make them global if needed. */
</style>
