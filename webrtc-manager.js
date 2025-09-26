// WebRTC Collaboration Manager
class WebRTCManager {
  constructor() {
    this.socket = null;
    this.peerConnections = new Map(); // userId -> RTCPeerConnection
    this.dataChannels = new Map(); // userId -> RTCDataChannel
    this.userId = this.generateUserId();
    this.userName = "";
    this.roomId = "";
    this.isConnected = false;
    this.isInitialized = false;
    this.eventListeners = new Map(); // イベントリスナー管理
    this.users = []; // 接続ユーザー管理（配列）

    // WebRTC設定（STUN + TURN）
    this.rtcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        // TURNサーバー（NAT越え用中継）
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:turn.bistri.com:80",
          credential: "homeo",
          username: "homeo",
        },
      ],
      iceCandidatePoolSize: 10, // ICE候補プール拡張
    };
  }

  // イベントエミッター機能
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  generateUserId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  async init(serverUrl = "http://localhost:3000") {
    return new Promise((resolve, reject) => {
      try {
        console.log("🔄 Socket.IO接続開始...");

        // Socket.IO接続
        this.socket = io(serverUrl);

        this.socket.on("connect", () => {
          console.log("✅ Connected to signaling server");
          this.isConnected = true;
          this.isInitialized = true;

          // WebRTCシグナリングイベントを設定
          this.setupSignalingHandlers();

          resolve();
        });

        this.socket.on("connect_error", (error) => {
          console.error("❌ Failed to connect to server:", error);
          this.isInitialized = false;
          reject(error);
        });

        this.socket.on("disconnect", () => {
          console.log("🔌 Disconnected from server");
          this.isConnected = false;
        });
      } catch (error) {
        console.error("❌ WebRTC初期化エラー:", error);
        this.isInitialized = false;
        reject(error);
      }
    });
  }

  setupSignalingHandlers() {
    // 新しいユーザーが参加
    this.socket.on("user-joined", (data) => {
      console.log(`👋 User joined: ${data.userName} (${data.userId})`);

      // 自分自身とは接続しない
      if (data.userId !== this.userId) {
        // 少し遅延してから接続を作成（競合状態を防ぐ）
        setTimeout(() => {
          this.createPeerConnection(data.userId);
        }, Math.random() * 1000); // 0-1秒のランダム遅延
      } else {
        console.log(`ℹ️ 自分自身なので接続をスキップ: ${data.userId}`);
      }

      this.updateUserList(data.users);
      this.emit("userJoined", { id: data.userId, name: data.userName });
    });

    // ユーザーが退出
    this.socket.on("user-left", (data) => {
      console.log(`👋 User left: ${data.userId}`);
      this.closePeerConnection(data.userId);
      this.updateUserList(data.users);
      this.emit("userLeft", data.userId);
    });

    // ルーム状態取得
    this.socket.on("room-state", (data) => {
      console.log("📊 Room state received:", data);
      this.updateUserList(data.users);
      this.syncTripData(data.tripData);

      // 既存ユーザーとの接続を確立（遅延付き）
      data.users.forEach((user, index) => {
        if (user.id !== this.userId) {
          // インデックスベースで遅延を分散
          setTimeout(() => {
            this.createPeerConnection(user.id);
          }, index * 500 + Math.random() * 500);
        }
      });
    });

    // WebRTCオファー受信
    this.socket.on("webrtc-offer", async (data) => {
      if (data.targetUserId === this.userId && data.fromUserId !== this.userId) {
        console.log(`📥 Offer受信: ${data.fromUserId} -> ${data.targetUserId}`);
        await this.handleOffer(data.fromUserId, data.offer);
      }
    });

    // WebRTCアンサー受信
    this.socket.on("webrtc-answer", async (data) => {
      if (data.targetUserId === this.userId && data.fromUserId !== this.userId) {
        console.log(`📥 Answer受信: ${data.fromUserId} -> ${data.targetUserId}`);
        await this.handleAnswer(data.fromUserId, data.answer);
      }
    });

    // ICE候補受信
    this.socket.on("webrtc-ice-candidate", async (data) => {
      if (data.targetUserId === this.userId && data.fromUserId !== this.userId) {
        console.log(`📥 ICE候補受信: ${data.fromUserId} -> ${data.targetUserId}`);
        await this.handleIceCandidate(data.fromUserId, data.candidate);
      }
    });

    // カーソル更新
    this.socket.on("cursor-update", (data) => {
      this.updateRemoteCursor(data.userId, data.cursor);
    });

    // Socket.IO経由のデータ同期（WebRTC接続前のフォールバック）
    this.socket.on("idea-added", (data) => {
      this.handleRemoteIdeaAdded(data.idea, data.fromUserId);
    });

    this.socket.on("marker-added", (data) => {
      this.handleRemoteMarkerAdded(data.marker, data.fromUserId);
    });

    this.socket.on("timeline-updated", (data) => {
      this.handleRemoteTimelineUpdated(data.timeline, data.fromUserId);
    });
  }

  async joinRoom(roomId, userName = null) {
    // ユーザー名が指定されていない場合はプロンプトで取得
    if (!userName) {
      userName =
        prompt("あなたのお名前を入力してください:") ||
        `ユーザー${Math.floor(Math.random() * 1000)}`;
    }

    this.roomId = roomId;
    this.userName = userName;

    this.socket.emit("join-room", {
      roomId,
      userId: this.userId,
      userName,
    });

    // ルーム参加後、少し待ってからユーザーリストを要求
    setTimeout(() => {
      if (this.socket && this.roomId) {
        this.socket.emit("get-room-state", { roomId });
        console.log("🔄 ユーザーリスト更新を要求しました");
      }
    }, 1000);

    // ルーム参加イベントを発火
    this.emit("roomJoined", roomId);

    console.log(`🎯 Joined room: ${roomId} as ${userName}`);
  }

  leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit("leave-room", {
        roomId: this.roomId,
        userId: this.userId,
      });

      // 全ピア接続を閉じる
      this.peerConnections.forEach((peer, userId) => {
        this.closePeerConnection(userId);
      });

      this.roomId = "";
      this.emit("roomLeft");

      console.log("🚪 Left room");
    }
  }

  async createPeerConnection(remoteUserId) {
    console.log(`🔄 ピア接続作成試行: ${remoteUserId}`);

    // 自分自身への接続を防ぐ
    if (remoteUserId === this.userId) {
      console.log(`ℹ️ 自分自身への接続をスキップ: ${remoteUserId}`);
      return;
    }

    // 既存の接続をチェック
    if (this.peerConnections.has(remoteUserId)) {
      const existingPeer = this.peerConnections.get(remoteUserId);
      console.log(`⚠️ 既存接続あり ${remoteUserId}:`, {
        connectionState: existingPeer.connectionState,
        signalingState: existingPeer.signalingState,
        hasRemoteDescription: !!existingPeer.remoteDescription,
        hasLocalDescription: !!existingPeer.localDescription,
      });

      // 使用可能な接続状態の場合はスキップ
      const usableStates = ["connected", "connecting"];

      const activeSignalingStates = ["have-local-offer", "have-remote-offer", "stable"];

      if (
        usableStates.includes(existingPeer.connectionState) ||
        activeSignalingStates.includes(existingPeer.signalingState)
      ) {
        console.log(
          `ℹ️ 既存接続を確認: ${remoteUserId} (${existingPeer.connectionState}/${existingPeer.signalingState})`
        );

        // stable状態でもデータチャンネルがない場合は作成を試行
        if (existingPeer.signalingState === "stable" && !this.dataChannels.has(remoteUserId)) {
          console.log(`🔧 stable状態でデータチャンネル不在、作成を試行: ${remoteUserId}`);
          try {
            const dataChannel = existingPeer.createDataChannel("tripData", { ordered: true });
            this.setupDataChannel(dataChannel, remoteUserId);
          } catch (error) {
            console.error(`❌ データチャンネル作成失敗: ${remoteUserId}`, error);
          }
        }

        return;
      }

      // 失敗した接続はクリーンアップ
      console.log(`🧹 失敗した接続をクリーンアップ: ${remoteUserId}`);
      this.closePeerConnection(remoteUserId);
    }

    console.log(`🆕 新しいピア接続作成: ${remoteUserId}`);
    const peer = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(remoteUserId, peer);

    // データチャンネル作成 (offerする側のみ)
    const dataChannel = peer.createDataChannel("tripData", {
      ordered: true,
    });
    this.setupDataChannel(dataChannel, remoteUserId);

    // ICE候補イベント
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("webrtc-ice-candidate", {
          targetUserId: remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    // データチャンネル受信 (answerする側用)
    peer.ondatachannel = (event) => {
      console.log(`📨 データチャンネル受信 from ${remoteUserId}`);
      this.setupDataChannel(event.channel, remoteUserId);
    };

    // ICE接続状態監視
    peer.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE接続状態変更 ${remoteUserId}: ${peer.iceConnectionState}`);

      if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
        console.log(`✅ ICE接続成功: ${remoteUserId} (${peer.iceConnectionState})`);
      } else if (peer.iceConnectionState === "failed") {
        console.log(`❌ ICE接続失敗: ${remoteUserId} - TURNサーバー経由を試行中...`);
      } else if (peer.iceConnectionState === "disconnected") {
        console.log(`🔌 ICE切断: ${remoteUserId}`);
        setTimeout(() => {
          if (peer.iceConnectionState === "disconnected") {
            console.log(`🔄 ICE再接続試行: ${remoteUserId}`);
            this.restartIce(peer, remoteUserId);
          }
        }, 3000);
      }
    };

    // 接続状態監視
    peer.onconnectionstatechange = () => {
      console.log(`🔗 接続状態変更 ${remoteUserId}: ${peer.connectionState}`);

      if (peer.connectionState === "connected") {
        console.log(`✅ 接続完了: ${remoteUserId}`);

        // connected状態でもデータチャンネルがない場合は作成
        if (!this.dataChannels.has(remoteUserId)) {
          console.log(`🔧 connected状態でデータチャンネル不在、作成を試行: ${remoteUserId}`);
          try {
            const dataChannel = peer.createDataChannel("tripData", { ordered: true });
            this.setupDataChannel(dataChannel, remoteUserId);
          } catch (error) {
            console.error(`❌ データチャンネル作成失敗: ${remoteUserId}`, error);
          }
        }
      } else if (peer.connectionState === "failed") {
        console.log(`❌ 接続失敗: ${remoteUserId}`);
        this.closePeerConnection(remoteUserId);

        // 再試行回数制限付き
        const retryCount = peer._retryCount || 0;
        if (retryCount < 3) {
          console.log(`🔄 再試行 ${retryCount + 1}/3: ${remoteUserId}`);
          setTimeout(() => {
            this.createPeerConnection(remoteUserId);
          }, (retryCount + 1) * 2000);
        } else {
          console.log(`❌ 最大再試行回数に達しました: ${remoteUserId}`);
        }
      } else if (peer.connectionState === "disconnected") {
        console.log(`🔌 接続切断: ${remoteUserId}`);
        // disconnectedは一時的な可能性があるので、すぐには削除しない
        setTimeout(() => {
          if (peer.connectionState === "disconnected") {
            this.closePeerConnection(remoteUserId);
          }
        }, 5000);
      }
    };

    // 再試行カウント初期化
    peer._retryCount = this.peerConnections.get(remoteUserId)?._retryCount || 0;

    // オファー作成・送信
    try {
      console.log(`📤 Offer作成中: ${remoteUserId}`);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      this.socket.emit("webrtc-offer", {
        targetUserId: remoteUserId,
        offer: offer,
      });
      console.log(`✅ Offer送信完了: ${remoteUserId}`);
    } catch (error) {
      console.error(`❌ Offer作成失敗 ${remoteUserId}:`, error);
      // オファー作成に失敗した場合はピア接続を削除
      this.closePeerConnection(remoteUserId);
    }
  }

  setupDataChannel(dataChannel, remoteUserId) {
    console.log(`🔗 データチャンネル設定中: ${remoteUserId}`);
    this.dataChannels.set(remoteUserId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`✅ データチャンネル開通: ${remoteUserId}`);
      console.log(`📊 現在のデータチャンネル数: ${this.dataChannels.size}`);
      console.log(`🔗 全データチャンネル:`, Array.from(this.dataChannels.keys()));
    };

    dataChannel.onmessage = (event) => {
      console.log(`📨 Raw message received from ${remoteUserId}:`, event.data);
      try {
        const data = JSON.parse(event.data);
        console.log(`📦 Parsed message from ${remoteUserId}:`, data);
        this.handleWebRTCMessage(data, remoteUserId);
      } catch (error) {
        console.error("Failed to parse WebRTC message:", error, event.data);
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${remoteUserId}:`, error);
    };
  }

  async handleOffer(fromUserId, offer) {
    console.log(`📡 Offer受信 from ${fromUserId}`);

    let peer = this.peerConnections.get(fromUserId);
    if (!peer) {
      console.log(`🔗 新しいピア接続作成 for ${fromUserId}`);
      peer = new RTCPeerConnection(this.rtcConfig);
      this.peerConnections.set(fromUserId, peer);

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit("webrtc-ice-candidate", {
            targetUserId: fromUserId,
            candidate: event.candidate,
          });
        }
      };

      peer.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, fromUserId);
      };

      peer.onconnectionstatechange = () => {
        console.log(`🔄 接続状態変更 ${fromUserId}: ${peer.connectionState}`);
      };
    }

    try {
      console.log(`📡 現在の状態: ${peer.signalingState}`);

      // 既に接続が完了している場合はスキップ
      if (peer.signalingState === "stable") {
        console.log(`ℹ️ 接続済み (stable状態) - offerをスキップ: ${fromUserId}`);
        return;
      }

      // 既にremote descriptionが設定されている場合もスキップ
      if (peer.remoteDescription) {
        console.warn(`⚠️ 既にremote descriptionが設定済み、offerをスキップ: ${fromUserId}`);
        return;
      }

      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      console.log(`📤 Answer送信 to ${fromUserId}`);
      this.socket.emit("webrtc-answer", {
        targetUserId: fromUserId,
        answer: answer,
      });
    } catch (error) {
      console.error("Failed to handle offer:", error);
    }
  }

  async handleAnswer(fromUserId, answer) {
    const peer = this.peerConnections.get(fromUserId);
    if (peer) {
      try {
        console.log(`📡 Answer受信 from ${fromUserId}, 現在の状態:`, peer.signalingState);

        // 正しい状態でのみsetRemoteDescriptionを実行
        if (peer.signalingState === "have-local-offer") {
          await peer.setRemoteDescription(answer);
          console.log(`✅ Remote description設定完了 with ${fromUserId}`);
        } else if (peer.signalingState === "stable") {
          console.log(`ℹ️ 接続済み (stable状態) - answerをスキップ: ${fromUserId}`);
        } else {
          console.warn(`⚠️ 不正な状態でanswerを受信: ${peer.signalingState} from ${fromUserId}`);
        }
      } catch (error) {
        console.error(`❌ Answer処理エラー ${fromUserId}:`, error);
      }
    } else {
      console.warn(`⚠️ ピア接続が見つかりません: ${fromUserId}`);
    }
  }

  async handleIceCandidate(fromUserId, candidate) {
    const peer = this.peerConnections.get(fromUserId);
    if (peer) {
      try {
        console.log(`🧊 ICE候補受信 from ${fromUserId}, ピア状態:`, {
          signalingState: peer.signalingState,
          connectionState: peer.connectionState,
          hasRemoteDescription: !!peer.remoteDescription,
        });

        // remote descriptionが設定されていない場合はスキップ
        if (!peer.remoteDescription) {
          console.warn(`⚠️ Remote description未設定、ICE候補をスキップ: ${fromUserId}`);
          return;
        }

        // シグナリング状態が適切でない場合もスキップ
        if (peer.signalingState === "closed") {
          console.warn(`⚠️ ピア接続がクローズ済み、ICE候補をスキップ: ${fromUserId}`);
          return;
        }

        await peer.addIceCandidate(candidate);
        console.log(`✅ ICE候補追加成功: ${fromUserId}`);
      } catch (error) {
        console.error(`❌ ICE候補追加失敗 ${fromUserId}:`, error.message);
      }
    } else {
      console.warn(`⚠️ ピア接続が見つからない、ICE候補をスキップ: ${fromUserId}`);
    }
  }

  // WebRTC データチャンネル経由でメッセージ送信
  broadcastToAll(message) {
    console.log(
      "📡 ブロードキャスト開始:",
      message.type,
      "データチャンネル数:",
      this.dataChannels.size
    );

    const data = JSON.stringify(message);
    let sentCount = 0;

    this.dataChannels.forEach((channel, userId) => {
      console.log(`📤 ${userId}へ送信試行 - チャンネル状態: ${channel.readyState}`);
      if (channel.readyState === "open") {
        try {
          channel.send(data);
          sentCount++;
          console.log(`✅ ${userId}へ送信成功`);
        } catch (error) {
          console.error(`❌ ${userId}への送信失敗:`, error);
        }
      }
    });

    console.log(`📊 送信完了: ${sentCount}/${this.dataChannels.size} 接続`);

    // WebRTC送信が失敗した場合のフォールバック（Socket.IO）
    if (sentCount === 0) {
      console.log("🔄 Socket.IOフォールバック使用（WebRTC送信失敗）");
      this.sendViaSocketIO(message);
    }
  }

  sendViaSocketIO(message) {
    console.log("📡 Socket.IOでメッセージ送信:", message.type, message.data);

    switch (message.type) {
      case "cursor":
        this.socket.emit("cursor-update", message.data);
        break;
      case "idea":
        console.log("💡 Socket.IOでアイデア送信:", message.data);
        this.socket.emit("add-idea", message.data);
        break;
      case "marker":
        console.log("📍 Socket.IOでマーカー送信:", message.data);
        this.socket.emit("add-marker", message.data);
        break;
      case "timeline":
        console.log("📊 Socket.IOでタイムライン送信:", message.data);
        this.socket.emit("timeline-update", message.data);
        break;
    }
  }

  handleWebRTCMessage(message, fromUserId) {
    console.log("📨 WebRTCメッセージ受信:", message.type, message.data);

    switch (message.type) {
      case "cursor":
        this.updateRemoteCursor(fromUserId, message.data);
        break;
      case "idea":
        this.emit("ideaReceived", message.data);
        break;
      case "marker":
        this.emit("markerReceived", message.data);
        break;
      case "timeline":
        this.emit("timelineReceived", message.data);
        break;
    }
  }

  closePeerConnection(userId) {
    const peer = this.peerConnections.get(userId);
    if (peer) {
      peer.close();
      this.peerConnections.delete(userId);
    }

    const channel = this.dataChannels.get(userId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(userId);
    }
  }

  // UI更新メソッド（app.jsから呼び出される）
  updateUserList(users) {
    // ユーザー一覧を内部で管理（配列またはオブジェクト）
    this.users = users || [];

    // UIの更新イベントを発火
    if (window.updateUserList) {
      window.updateUserList();
    }
  }

  updateRemoteCursor(userId, cursor) {
    // リモートカーソル更新
    if (window.updateUserCursor) {
      window.updateUserCursor({ id: userId, ...cursor });
    }
  }

  syncTripData(tripData) {
    // 旅行データ同期
    if (window.syncTripData) {
      window.syncTripData(tripData);
    }
  }

  handleRemoteIdeaAdded(idea, fromUserId) {
    console.log("🎉 Socket.IO経由でアイデア受信:", idea, "from:", fromUserId);
    this.emit("ideaReceived", idea);
  }

  handleRemoteMarkerAdded(marker, fromUserId) {
    console.log("🎉 Socket.IO経由でマーカー受信:", marker, "from:", fromUserId);
    this.emit("markerReceived", marker);
  }

  handleRemoteTimelineUpdated(timeline, fromUserId) {
    console.log("🎉 Socket.IO経由でタイムライン受信:", timeline, "from:", fromUserId);
    this.emit("timelineReceived", timeline);
  }

  // 公開メソッド
  sendCursor(x, y) {
    this.broadcastToAll({
      type: "cursor",
      data: { x, y },
    });
  }

  sendIdea(ideaData) {
    console.log("📨 WebRTCManager.sendIdea呼び出し:", ideaData);
    console.log("📊 現在の接続状況:", {
      dataChannels: this.dataChannels.size,
      peers: this.peerConnections.size,
      roomId: this.roomId,
    });

    const message = {
      type: "idea",
      data: ideaData,
    };

    console.log("📡 ブロードキャスト実行中...");
    this.broadcastToAll(message);
  }

  sendMarker(markerData) {
    this.broadcastToAll({
      type: "marker",
      data: markerData,
    });
  }

  sendTimeline(timelineData) {
    this.broadcastToAll({
      type: "timeline",
      data: timelineData,
    });
  }

  // 接続強制リセット（デバッグ用）
  forceResetConnection(userId) {
    console.log(`🔄 強制リセット開始: ${userId}`);
    this.closePeerConnection(userId);
    setTimeout(() => {
      this.createPeerConnection(userId);
    }, 1000);
  }

  // データチャンネル強制作成（デバッグ用）
  forceCreateDataChannel(userId) {
    const peer = this.peerConnections.get(userId);
    if (peer && peer.connectionState === "connected") {
      console.log(`🔧 データチャンネル強制作成: ${userId}`);
      try {
        const dataChannel = peer.createDataChannel("tripData", { ordered: true });
        this.setupDataChannel(dataChannel, userId);
        console.log(`✅ データチャンネル作成完了: ${userId}`);
      } catch (error) {
        console.error(`❌ データチャンネル作成失敗: ${userId}`, error);
      }
    } else {
      console.log(`❌ ピア接続が無効: ${userId} (${peer ? peer.connectionState : "not found"})`);
    }
  }

  // デバッグ情報出力
  debugConnections() {
    console.log("\n=== WebRTC接続状況 ===");
    console.log(`ピア接続数: ${this.peerConnections?.size || 0}`);
    console.log(`データチャンネル数: ${this.dataChannels?.size || 0}`);

    if (this.peerConnections && this.peerConnections.size > 0) {
      for (const [userId, peer] of this.peerConnections) {
        console.log(`👤 ${userId}:`);
        console.log(`  - connectionState: ${peer.connectionState}`);
        console.log(`  - signalingState: ${peer.signalingState}`);
        console.log(`  - iceConnectionState: ${peer.iceConnectionState}`);
        console.log(`  - iceGatheringState: ${peer.iceGatheringState}`);
        console.log(`  - データチャンネル: ${this.dataChannels?.has(userId) ? "✅" : "❌"}`);

        if (this.dataChannels?.has(userId)) {
          const channel = this.dataChannels.get(userId);
          console.log(`  - チャンネル状態: ${channel.readyState}`);
        }
      }
    } else {
      console.log("📭 接続中のピアがありません");
    }
    console.log("====================\n");
  }

  // ICE再起動（接続失敗時の復旧）
  restartIce(peer, userId) {
    if (peer && peer.connectionState !== "closed") {
      console.log(`🔄 ICE再起動実行: ${userId}`);
      try {
        peer.restartIce();
      } catch (error) {
        console.error(`❌ ICE再起動失敗: ${userId}`, error);
        // ICE再起動に失敗した場合は接続をリセット
        this.closePeerConnection(userId);
        setTimeout(() => {
          console.log(`🔄 接続完全リセット: ${userId}`);
          this.createPeerConnection(userId);
        }, 2000);
      }
    }
  }
}
