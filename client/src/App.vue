<template>
  <div class="chat-container">
    <header class="header">
      <h1>Simple WebSocket Chat</h1>
    </header>
    
    <div class="chat-box" ref="chatBox">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.type]">
        <span v-if="msg.type === 'chat'" class="username">{{ msg.username }}:</span>
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
        {{ connected ? 'Send' : 'Connect' }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      websocket: null,
      connected: false,
      username: '',
      message: '',
      messages: []
    }
  },
  methods: {
    connect() {
      if (!this.username.trim()) {
        alert('Please enter a username');
        return;
      }

      this.websocket = new WebSocket('ws://localhost:3000');

      this.websocket.onopen = () => {
        console.log('Connected to the server');
        this.connected = true;
      };

      this.websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'announcement') {
          this.displayAnnouncement(data.message);
        } else {
          this.messages.push(data);
          this.$nextTick(() => {
            this.scrollToBottom();
          });
        }
      };

      this.websocket.onclose = () => {
        console.log('Disconnected from the server');
        this.connected = false;
        this.messages.push({
          type: 'system',
          message: 'Disconnected from server. Please refresh to reconnect.',
          timestamp: new Date().toISOString()
        });
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.messages.push({
          type: 'system',
          message: 'Error connecting to server.',
          timestamp: new Date().toISOString()
        });
      };
    },
    
    sendMessage() {
      if (!this.message.trim() || !this.connected) return;
      
      const messageObj = {
        username: this.username,
        message: this.message
      };
      
      this.websocket.send(JSON.stringify(messageObj));
      this.message = '';
    },
    
    scrollToBottom() {
      const chatBox = this.$refs.chatBox;
      chatBox.scrollTop = chatBox.scrollHeight;
    },
    
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    },

    displayAnnouncement(message) {
      const announcementElement = document.createElement('div');
      announcementElement.classList.add('announcement');
      announcementElement.textContent = `📢 ANNOUNCEMENT: ${message}`;
      this.$refs.chatBox.appendChild(announcementElement);
    }
  },
  
  beforeUnmount() {
    if (this.websocket) {
      this.websocket.close();
    }
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: Arial, sans-serif;
}

.chat-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  text-align: center;
  padding: 10px;
  background-color: #4CAF50;
  color: white;
  border-radius: 5px 5px 0 0;
}

.chat-box {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  margin-top: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.message {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 5px;
  max-width: 85%;
  word-wrap: break-word;
}

.chat {
  background-color: #E3F2FD;
  align-self: flex-start;
}

.system {
  background-color: #FFF9C4;
  color: #333;
  margin: 10px auto;
  text-align: center;
  font-style: italic;
}

.username {
  font-weight: bold;
  margin-right: 5px;
  color: #1976D2;
}

.timestamp {
  font-size: 0.7em;
  color: #757575;
  margin-left: 10px;
}

.input-area {
  display: flex;
  gap: 10px;
  padding: 10px;
  background-color: #f1f1f1;
  border-radius: 0 0 5px 5px;
}

.username-input {
  width: 150px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
}

.message-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  outline: none;
}

.send-button {
  padding: 0 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
}

.send-button:hover {
  background-color: #45a049;
}

.send-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.announcement {
  background-color: #FFEB3B;
  color: #333;
  padding: 10px;
  margin: 10px auto;
  text-align: center;
  font-weight: bold;
  border-radius: 5px;
}
</style>