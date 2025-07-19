import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
});

// Store online users
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // User joins with their user ID
  socket.on("join", (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      console.log(`User ${socket.userId} disconnected`);
    }
  });

  // Handle typing events for messaging
  socket.on("typing", (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userTyping", {
        userId: data.userId,
        username: data.username,
      });
    }
  });

  // Handle stop typing events
  socket.on("stopTyping", (data) => {
    const receiverSocketId = onlineUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userStopTyping", {
        userId: data.userId,
      });
    }
  });
});

// Helper function to get receiver's socket ID
export const getReceiverSocketId = (userId) => {
  return onlineUsers.get(userId);
};

// Helper function to emit notifications
export const emitNotification = (userId, notification) => {
  const socketId = onlineUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("notification", notification);
  }
};

// Helper function to emit new message
export const emitNewMessage = (userId, message) => {
  const socketId = onlineUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("newMessage", message);
  }
};

// Helper function to emit message status update
export const emitMessageStatusUpdate = (userId, messageId, status) => {
  const socketId = onlineUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("messageStatusUpdate", { messageId, status });
  }
};

export { app, server, io };
