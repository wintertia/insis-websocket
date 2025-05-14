<template>
  <div class="auth-container">
    <h2>Login</h2>
    <input v-model="username" placeholder="Username" />
    <input v-model="password" type="password" placeholder="Password" />
    <button @click="login">Login</button>
    <p>
      Don't have an account?
      <button @click="$emit('show-register')">Register</button>
    </p>
    <p v-if="error" class="error-message">{{ error }}</p>
  </div>
</template>

<script>
export default {
  name: "LoginView",
  data() {
    return {
      username: "",
      password: "",
      error: "",
    };
  },
  methods: {
    async login() {
      this.error = "";
      if (!this.username || !this.password) {
        this.error = "Username and password are required.";
        return;
      }
      try {
        const response = await fetch("http://localhost:3000/login", {
          // Assuming server is on port 3000
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: this.username,
            password: this.password,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          this.$emit("login-success", data.token);
        } else {
          const errorText = await response.text();
          this.error = `Login failed: ${errorText}`;
        }
      } catch (err) {
        console.error("Login error:", err);
        this.error = "An error occurred during login.";
      }
    },
  },
};
</script>

<style scoped>
.auth-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  max-width: 300px;
  margin: 50px auto;
  border: 1px solid #ccc;
  border-radius: 8px;
}
input {
  margin-bottom: 10px;
  padding: 8px;
  width: 100%;
  box-sizing: border-box;
}
button {
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.error-message {
  color: red;
  margin-top: 10px;
}
p button {
  background: none;
  border: none;
  color: blue;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  width: auto;
}
</style>
