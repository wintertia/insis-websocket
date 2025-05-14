<template>
  <div class="auth-container">
    <h2>Register</h2>
    <input v-model="username" placeholder="Username" />
    <input v-model="password" type="password" placeholder="Password" />
    <button @click="register">Register</button>
    <p>
      Already have an account?
      <button @click="$emit('show-login')">Login</button>
    </p>
    <p v-if="message" :class="isError ? 'error-message' : 'success-message'">
      {{ message }}
    </p>
  </div>
</template>

<script>
export default {
  name: "RegisterView",
  data() {
    return {
      username: "",
      password: "",
      message: "",
      isError: false,
    };
  },
  methods: {
    async register() {
      this.message = "";
      this.isError = false;
      if (!this.username || !this.password) {
        this.message = "Username and password are required.";
        this.isError = true;
        return;
      }
      try {
        const response = await fetch("http://localhost:3000/register", {
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
        const responseText = await response.text();
        if (response.ok) {
          this.message = `Registration successful: ${responseText}. You can now login.`;
          this.isError = false;
        } else {
          this.message = `Registration failed: ${responseText}`;
          this.isError = true;
        }
      } catch (err) {
        console.error("Registration error:", err);
        this.message = "An error occurred during registration.";
        this.isError = true;
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
.success-message {
  color: green;
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
