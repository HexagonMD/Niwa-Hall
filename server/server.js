const express = require("express");
const http = require("http");
const fs = require("fs");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const CLIENT_DIST_PATH = path.join(__dirname, '..', 'frontend', 'dist');
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
app.use(cors());
app.use(express.static(CLIENT_DIST_PATH));

// 繝ｫ繝ｼ繝邂｡逅・
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

  // 繝ｫ繝ｼ繝蜿ょ刈
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

    // 譌｢蟄倥Θ繝ｼ繧ｶ繝ｼ縺ｫ譁ｰ隕丞盾蜉繧帝夂衍
    socket.to(roomId).emit("user-joined", {
      userId,
      userName,
      users: room.getUserList(),
    });

    // 譁ｰ隕上Θ繝ｼ繧ｶ繝ｼ縺ｫ迴ｾ蝨ｨ縺ｮ迥ｶ諷九ｒ騾∽ｿ｡
    socket.emit("room-state", {
      users: room.getUserList(),
      tripData: room.tripData,
    });

    console.log(`User ${userName} (${userId}) joined room ${roomId}`);
  });

  // 繝ｫ繝ｼ繝迥ｶ諷玖ｦ∵ｱ・
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

  // WebRTC 繧ｷ繧ｰ繝翫Μ繝ｳ繧ｰ: 繧ｪ繝輔ぃ繝ｼ騾∽ｿ｡
  socket.on("webrtc-offer", (data) => {
    const { targetUserId, offer } = data;
    socket.to(currentRoom).emit("webrtc-offer", {
      fromUserId: currentUserId,
      targetUserId,
      offer,
    });
  });

  // WebRTC 繧ｷ繧ｰ繝翫Μ繝ｳ繧ｰ: 繧｢繝ｳ繧ｵ繝ｼ騾∽ｿ｡
  socket.on("webrtc-answer", (data) => {
    const { targetUserId, answer } = data;
    socket.to(currentRoom).emit("webrtc-answer", {
      fromUserId: currentUserId,
      targetUserId,
      answer,
    });
  });

  // WebRTC 繧ｷ繧ｰ繝翫Μ繝ｳ繧ｰ: ICE蛟呵｣憺∽ｿ｡
  socket.on("webrtc-ice-candidate", (data) => {
    const { targetUserId, candidate } = data;
    socket.to(currentRoom).emit("webrtc-ice-candidate", {
      fromUserId: currentUserId,
      targetUserId,
      candidate,
    });
  });

  // 繧ｫ繝ｼ繧ｽ繝ｫ菴咲ｽｮ譖ｴ譁ｰ
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

  // 譌・｡瑚ｨ育判繝・・繧ｿ譖ｴ譁ｰ
  socket.on("trip-data-update", (data) => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      room.updateTripData(data);

      socket.to(currentRoom).emit("trip-data-update", {
        fromUserId: currentUserId,
        data,
      });
    }
  });

  // 謗･邯壼・譁ｭ蜃ｦ逅・
  socket.on("disconnect", () => {
    if (currentRoom && currentUserId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.removeUser(currentUserId);

        socket.to(currentRoom).emit("user-left", {
          userId: currentUserId,
          users: room.getUserList(),
        });

        // 繝ｫ繝ｼ繝縺檎ｩｺ縺ｫ縺ｪ縺｣縺溘ｉ蜑企勁
        if (room.users.size === 0) {
          rooms.delete(currentRoom);
          console.log(`Room ${currentRoom} deleted (empty)`);
        }
      }
    }

    console.log(`User disconnected: ${socket.id}`);
  });
});

// HTTP 繝ｫ繝ｼ繝・
const sendClientApp = (req, res) => {
  const indexPath = path.join(CLIENT_DIST_PATH, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.status(500).send('Frontend build not found. Run npm --prefix frontend run build first.');
    return;
  }
  res.sendFile(indexPath);
};

app.get('/', sendClientApp);
app.get('/room/:roomId', sendClientApp);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`噫 Travel Planner WebRTC Server running on port ${PORT}`);
  console.log(`桃 Open http://localhost:${PORT} to start planning!`);
});



