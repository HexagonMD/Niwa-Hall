const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.static(path.join(__dirname)));

// ルーム管理
const rooms = new Map();

class Room {
  constructor(id) {
    this.id = id;
    this.users = new Map(); // userId -> { socketId, name, cursor }
    this.tripData = {
      ideas: [],
      pins: [],
      timeline: [],
    };
  }

  addUser(socketId, userId, name) {
    this.users.set(userId, {
      socketId,
      name,
      cursor: { x: 0, y: 0 },
      lastSeen: Date.now(),
    });
  }

  removeUser(userId) {
    this.users.delete(userId);
  }

  getUserList() {
    return Array.from(this.users.entries()).map(([id, user]) => ({
      id,
      name: user.name,
      cursor: user.cursor,
      lastSeen: user.lastSeen,
    }));
  }

  updateTripData(data) {
    this.tripData = { ...this.tripData, ...data };
  }
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom = null;
  let currentUserId = null;

  // ルーム参加
  socket.on("join-room", (data) => {
    const { roomId, userId, userName } = data;

    if (currentRoom) {
      socket.leave(currentRoom);
    }

    currentRoom = roomId;
    currentUserId = userId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Room(roomId));
    }

    const room = rooms.get(roomId);
    room.addUser(socket.id, userId, userName);

    socket.join(roomId);

    // 既存ユーザーに新規参加を通知
    socket.to(roomId).emit("user-joined", {
      userId,
      userName,
      users: room.getUserList(),
    });

    // 新規ユーザーに現在の状態を送信
    socket.emit("room-state", {
      users: room.getUserList(),
      tripData: room.tripData,
    });

    console.log(`User ${userName} (${userId}) joined room ${roomId}`);
  });

  // ルーム状態要求
  socket.on("get-room-state", (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);

    if (room) {
      socket.emit("room-state", {
        users: room.getUserList(),
        tripData: room.tripData,
      });
      console.log(`Room state sent to ${currentUserId} for room ${roomId}`);
    }
  });

  // WebRTC シグナリング: オファー送信
  socket.on("webrtc-offer", (data) => {
    const { targetUserId, offer } = data;
    socket.to(currentRoom).emit("webrtc-offer", {
      fromUserId: currentUserId,
      targetUserId,
      offer,
    });
  });

  // WebRTC シグナリング: アンサー送信
  socket.on("webrtc-answer", (data) => {
    const { targetUserId, answer } = data;
    socket.to(currentRoom).emit("webrtc-answer", {
      fromUserId: currentUserId,
      targetUserId,
      answer,
    });
  });

  // WebRTC シグナリング: ICE候補送信
  socket.on("webrtc-ice-candidate", (data) => {
    const { targetUserId, candidate } = data;
    socket.to(currentRoom).emit("webrtc-ice-candidate", {
      fromUserId: currentUserId,
      targetUserId,
      candidate,
    });
  });

  // カーソル位置更新
  socket.on("cursor-update", (data) => {
    if (currentRoom && currentUserId) {
      const room = rooms.get(currentRoom);
      const user = room.users.get(currentUserId);
      if (user) {
        user.cursor = data;
        user.lastSeen = Date.now();

        socket.to(currentRoom).emit("cursor-update", {
          userId: currentUserId,
          cursor: data,
        });
      }
    }
  });

  // 旅行計画データ更新
  socket.on("trip-data-update", (data) => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.updateTripData(data);

        socket.to(currentRoom).emit("trip-data-update", {
          fromUserId: currentUserId,
          data,
        });
      }
    }
  });

  // 接続切断処理
  socket.on("disconnect", () => {
    if (currentRoom && currentUserId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.removeUser(currentUserId);

        socket.to(currentRoom).emit("user-left", {
          userId: currentUserId,
          users: room.getUserList(),
        });

        // ルームが空になったら削除
        if (room.users.size === 0) {
          rooms.delete(currentRoom);
          console.log(`Room ${currentRoom} deleted (empty)`);
        }
      }
    }

    console.log(`User disconnected: ${socket.id}`);
  });
});

// HTTP ルート
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Travel Planner WebRTC Server running on port ${PORT}`);
  console.log(`📍 Open http://localhost:${PORT} to start planning!`);
});
