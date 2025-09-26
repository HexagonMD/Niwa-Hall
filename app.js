let clickedLatLng = null;
let selectedPlace = null;
let autocomplete;
// アプリの状態管理
let appState = {
  currentView: "idea",
  pins: [],
  ideas: [],
  timeline: [],
  users: [],
  isHost: false,
  roomId: null,
};

// WebRTC Collaboration
let collaborationEnabled = false;
let currentUser = {
  id: "user_" + Date.now(),
  name: "ユーザー" + Math.floor(Math.random() * 100),
  color: "#" + Math.floor(Math.random() * 16777215).toString(16),
};

// WebRTC Manager初期化
async function initWebRTC() {
  try {
    console.log("🔄 WebRTC初期化開始...");

    // WebRTCManagerインスタンス作成
    if (!window.webRTCManager) {
      if (typeof WebRTCManager === "undefined") {
        console.error("❌ WebRTCManagerクラスが見つかりません");
        showNotification("WebRTCManagerの読み込みに失敗しました", "error");
        return;
      }
      window.webRTCManager = new WebRTCManager();
    }

    // 初期化
    await window.webRTCManager.init();
    window.webRTCManager.isInitialized = true;

    console.log("✅ WebRTC初期化完了");
    showNotification("協働機能が利用可能になりました", "success");

    // WebRTCイベントリスナー
    window.webRTCManager.on("ideaReceived", (data) => {
      console.log("🎉 アイデア受信イベント発火:", data);
      console.log("📥 受信したデータ:", JSON.stringify(data, null, 2));
      addIdeaCard(data.title, data.description, data.type, data.day, true, data.startTime, data.duration, data.endTime);
      console.log("✅ 受信アイデアを画面に追加完了");
    });

    window.webRTCManager.on("markerReceived", (data) => {
      console.log("📍 マーカー受信:", data);
      addMapMarker(data.lat, data.lng, data.title, true);
    });

    window.webRTCManager.on("userJoined", (user) => {
      showNotification(`${user.name}さんが参加しました`, "success");
      updateUserList();
    });

    window.webRTCManager.on("userLeft", (userId) => {
      showNotification("ユーザーが退室しました", "info");
      updateUserList();
    });

    window.webRTCManager.on("roomJoined", (roomId) => {
      collaborationEnabled = true;
      appState.roomId = roomId;
      console.log("🎯 ルーム参加完了、協働機能有効化:", { roomId, collaborationEnabled });
      updateUserList();
      showNotification("協働機能が有効になりました！", "success");
    });

    window.webRTCManager.on("roomLeft", () => {
      collaborationEnabled = false;
      appState.roomId = null;
      updateUserList();
    });
  } catch (error) {
    console.error("❌ WebRTC初期化エラー:", error);
    showNotification("WebRTC初期化に失敗しました: " + error.message, "error");
  }
}

// WebRTC協調機能
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === "success" ? "#4CAF50" : type === "error" ? "#f44336" : "#2196F3"};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 協働セッションを開始
function startCollaboration() {
  console.log("🎯 協働開始ボタンがクリックされました");
  console.log("WebRTCManager存在:", !!window.webRTCManager);
  console.log("初期化状態:", window.webRTCManager?.isInitialized);
  console.log("接続状態:", window.webRTCManager?.isConnected);

  if (window.webRTCManager && window.webRTCManager.isInitialized) {
    const roomId = prompt("ルームIDを入力してください（新しいルームの場合は空白）:");
    if (roomId !== null) {
      const finalRoomId = roomId.trim() || "room_" + Date.now();
      console.log("🚪 ルームに参加します:", finalRoomId);
      window.webRTCManager.joinRoom(finalRoomId);
    }
  } else {
    console.log("❌ WebRTC未初期化、再初期化を試行");
    showNotification("WebRTC機能の初期化中です。しばらく待ってから再試行してください。", "error");

    // 強制的に初期化を再試行
    initWebRTC()
      .then(() => {
        console.log("✅ 再初期化完了");
        showNotification("初期化完了！もう一度お試しください。", "success");
      })
      .catch((error) => {
        console.error("❌ 再初期化失敗:", error);
        showNotification("初期化に失敗しました: " + error.message, "error");
      });
  }
}

// 協働セッションから退出
function leaveCollaboration() {
  if (window.webRTCManager && appState.roomId) {
    window.webRTCManager.leaveRoom();
    appState.roomId = null;
    collaborationEnabled = false;
    showNotification("協働セッションから退出しました", "info");
  }
}

// デバッグ: 協働状態確認
function debugCollaboration() {
  console.log("🔍 協働状態デバッグ:");
  console.log("collaborationEnabled:", collaborationEnabled);
  console.log("appState.roomId:", appState.roomId);
  console.log("webRTCManager存在:", !!window.webRTCManager);
  if (window.webRTCManager) {
    console.log("WebRTCManager詳細:", {
      initialized: window.webRTCManager.isInitialized,
      connected: window.webRTCManager.isConnected,
      roomId: window.webRTCManager.roomId,
      peers: window.webRTCManager.peerConnections?.size,
      dataChannels: window.webRTCManager.dataChannels?.size,
    });

    // WebRTCManagerの詳細デバッグ
    window.webRTCManager.debugConnections();
  }
}

// WebRTC接続強制リセット（デバッグ用）
function resetWebRTCConnection(userId) {
  if (window.webRTCManager && userId) {
    window.webRTCManager.forceResetConnection(userId);
  } else {
    console.log("❌ WebRTCManagerまたはuserIdが無効");
  }
}

// データチャンネル強制作成（デバッグ用）
function createDataChannel(userId) {
  if (window.webRTCManager && userId) {
    window.webRTCManager.forceCreateDataChannel(userId);
  } else {
    console.log("❌ WebRTCManagerまたはuserIdが無効");
  }
}

// テスト用: 強制的にアイデアを送信
function testSendIdea() {
  const testIdea = {
    title: "テストアイデア",
    description: "これは同期テストです",
    type: "food",
    day: "1",
    id: Date.now(),
  };

  console.log("🧪 テストアイデア送信:", testIdea);

  if (window.webRTCManager && window.webRTCManager.sendIdea) {
    window.webRTCManager.sendIdea(testIdea);
    console.log("✅ 送信完了");
  } else {
    console.log("❌ WebRTCManager.sendIdea が利用できません");
  }
}

// テスト用: 協働機能を強制有効化
function forceEnableCollaboration() {
  collaborationEnabled = true;
  console.log("🔥 協働機能を強制有効化しました");
  console.log("現在の状態:", {
    collaborationEnabled,
    webRTCManager: !!window.webRTCManager,
    roomId: appState.roomId,
  });
}

// グローバルからアクセス可能にする
window.debugCollaboration = debugCollaboration;
window.testSendIdea = testSendIdea;
window.forceEnableCollaboration = forceEnableCollaboration;

function updateUserList() {
  // ユーザーリスト更新処理
  if (window.webRTCManager && window.webRTCManager.users) {
    // usersが配列の場合は length、オブジェクトの場合は Object.keys().length を使用
    const userCount = Array.isArray(window.webRTCManager.users)
      ? window.webRTCManager.users.length
      : Object.keys(window.webRTCManager.users).length;
    const userCountElement = document.getElementById("userCount");
    const statusIndicator = document.getElementById("statusIndicator");
    const collaborationBtn = document.getElementById("collaborationBtn");
    const leaveBtn = document.getElementById("leaveBtn");

    if (userCountElement) {
      userCountElement.textContent = `${userCount}人がオンライン`;
    }

    if (statusIndicator) {
      statusIndicator.style.background = collaborationEnabled ? "#27ae60" : "#e74c3c";
    }

    if (collaborationBtn && leaveBtn) {
      if (collaborationEnabled && appState.roomId) {
        collaborationBtn.style.display = "none";
        leaveBtn.style.display = "inline-block";
      } else {
        collaborationBtn.style.display = "inline-block";
        leaveBtn.style.display = "none";
      }
    }

    console.log(`現在の参加者数: ${userCount}人`);
  }
}

// 旅行データ同期関数（新規ユーザー入室時の既存データ表示用）
function syncTripData(tripData) {
  console.log("🔄 tripData同期開始:", tripData);

  if (!tripData) {
    console.warn("⚠️ tripDataが空です");
    return;
  }

  // 既存のアイデアを表示
  if (tripData.ideas && Array.isArray(tripData.ideas)) {
    console.log(`📝 ${tripData.ideas.length}個のアイデアを同期中...`);

    tripData.ideas.forEach((idea, index) => {
      console.log(`📝 アイデア${index + 1}を表示:`, idea);
      // fromRemote = true で追加（WebRTC送信をスキップ）
      addIdeaCard(idea.title, idea.description, idea.type, idea.day, true, idea.startTime, idea.duration, idea.endTime);
    });

    console.log("✅ 全てのアイデア同期完了");
  }

  // 必要に応じて他のデータも同期（ピン、タイムラインなど）
  if (tripData.pins) {
    console.log(`📍 ${tripData.pins.length}個のピンを同期中...`);
    // ピン同期処理は将来実装
  }

  if (tripData.timeline) {
    console.log("📅 タイムラインを同期中...");
    // タイムライン同期処理は将来実装
  }
}

// グローバルからアクセス可能にする
window.syncTripData = syncTripData;

// アイデアカードの追加（WebRTC対応版）
function addIdeaCard(title, description, type, day, fromRemote = false, startTime, duration, endTime) {
  console.log("🎯 addIdeaCard呼び出し:", { title, description, type, day, fromRemote, startTime, duration, endTime });

  const ideaBoard = document.getElementById("ideaBoard");
  if (!ideaBoard) {
    console.error("❌ ideaBoard要素が見つかりません");
    return;
  }

  const card = document.createElement("div");
  card.className = "idea-card";

  const typeEmoji = { food: "🍜", sightseeing: "🏔️", hotel: "🏨", transport: "🚗" };
  const typeLabel = { food: "グルメ", sightseeing: "観光", hotel: "宿泊", transport: "交通" };

  const ideaData = { title, description, type, day, id: Date.now(), startTime, duration, endTime };
  appState.ideas.push(ideaData);

  let timeInfoHTML = '';
  if (startTime || duration || endTime) {
    timeInfoHTML = `
      <div class="idea-time-info">
        ${startTime ? `<span>開始: ${startTime}</span>` : ''}
        ${duration ? `<span>所要: ${duration}</span>` : ''}
        ${endTime ? `<span>終了: ${endTime}</span>` : ''}
      </div>
    `;
  }

  card.innerHTML = `
        <h3>${typeEmoji[type]} ${title}</h3>
        <p>${description}</p>
        ${timeInfoHTML}
        <div class="idea-tags">
            <span class="tag">${typeLabel[type]}</span>
            ${day !== "0" ? `<span class="tag">${day}日目</span>` : ""}
        </div>
    `;

  ideaBoard.appendChild(card);
  console.log("✅ アイデアカードを画面に追加しました");

  // WebRTC同期の詳細チェック
  console.log("🔍 WebRTC同期チェック開始");
  console.log("- fromRemote:", fromRemote);
  console.log("- collaborationEnabled:", collaborationEnabled);
  console.log("- window.webRTCManager:", !!window.webRTCManager);

  if (!fromRemote && collaborationEnabled && window.webRTCManager) {
    console.log("📤 WebRTC送信開始:", ideaData);
    console.log("WebRTCManager詳細状態:", {
      initialized: window.webRTCManager.isInitialized,
      connected: window.webRTCManager.isConnected,
      roomId: window.webRTCManager.roomId,
      dataChannels: window.webRTCManager.dataChannels?.size,
      sendIdeaExists: typeof window.webRTCManager.sendIdea === "function",
    });

    try {
      window.webRTCManager.sendIdea(ideaData);
      console.log("✅ WebRTC送信完了");
    } catch (error) {
      console.error("❌ WebRTC送信エラー:", error);
    }
  } else {
    console.log("❌ WebRTC送信スキップ理由:", {
      fromRemote: fromRemote,
      collaborationEnabled: collaborationEnabled,
      webRTCManagerExists: !!window.webRTCManager,
      condition: `!${fromRemote} && ${collaborationEnabled} && ${!!window.webRTCManager}`,
    });
  }
}

// ビュー切り替え
function switchView(viewName) {
  // ビューの切り替え
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("active");
  });
  document.getElementById(`${viewName}-view`).classList.add("active");

  // ナビゲーションボタンのアクティブ状態を更新
  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-view="${viewName}"]`).classList.add("active");

  appState.currentView = viewName;

  // マップビューの場合、マップを初期化
  if (viewName === "map") {
    initMap();
  }

  // フローチャートビューの場合、フローチャートを更新
  if (viewName === "flowchart") {
    updateFlowchart();
  }
}

// モーダルの開閉
function openModal() {
  document.getElementById("modal").classList.add("active");
}
function closeModal() {
  document.getElementById("modal").classList.remove("active");
  document.getElementById("addForm").reset();
  document.getElementById("itemLocation").value = "";
  selectedPlace = null;
}

// フォーム送信処理
document.getElementById("addForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const title = document.getElementById("itemTitle").value;
  const description = document.getElementById("itemDescription").value;
  const url = document.getElementById("itemUrl").value;
  const startTime = document.getElementById("itemStartTime").value;
  const duration = document.getElementById("itemDuration").value;
  const endTime = document.getElementById("itemEndTime").value;
  const pinType = document.querySelector('input[name="pinType"]:checked').value;
  const day = document.getElementById("itemDay").value;

  // 新しいアイデアカードを追加
  addIdeaCard(title, description, pinType, day, false, startTime, duration, endTime);

  // もし地図クリックからモーダルが開かれた場合、ピンを追加
  if (clickedLatLng) {
    const data = { title: title, lat: clickedLatLng.lat, lng: clickedLatLng.lng };
    addMarker(data, true);
    clickedLatLng = null; //リセット
  } else if (selectedPlace && selectedPlace.geometry) {
    // もし場所検索から場所が選択された場合、ピンを追加
    const data = {
      title: selectedPlace.name,
      lat: selectedPlace.geometry.location.lat(),
      lng: selectedPlace.geometry.location.lng(),
    };
    addMarker(data, true);
  }

  // 通知を表示
  showNotification(`「${title}」を追加しました`, "success");

  updateFlowchart(); // フローチャートを更新
  closeModal();
});

// 重複している関数を削除（WebRTC対応版が上で定義されている）

// URLからのインポート処理
function importFromURL() {
  const url = document.getElementById("urlInput").value;

  if (!url) {
    showNotification("URLを入力してください", "info");
    return;
  }
  try {
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      const place = { name: "インポート場所", lat, lng, address: "" };
      if (map) {
        addMarker(place, true);
      } else {
        appState.pins.push(place);
      }
      showNotification("座標からピンを追加しました", "success");
      document.getElementById("urlInput").value = "";
      return;
    }

    if (url.includes("maps.app.goo.gl")) {
      fetch(url, { method: "GET", mode: "cors" })
        .then((r) => r.url)
        .then((finalUrl) => {
          const m = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            const place = { name: "インポート場所", lat, lng, address: "" };
            if (map) addMarker(place, true);
            else appState.pins.push(place);
            showNotification("短縮URLからピンを追加しました", "success");
            document.getElementById("urlInput").value = "";
          } else {
            showNotification("短縮URLの解析に失敗しました", "info");
          }
        })
        .catch(() => showNotification("短縮URLの解析に失敗しました（CORS制限）", "info"));
      return;
    }

    if (map && (url.includes("google.com/maps") || url.includes("maps.google"))) {
      const placesService = new google.maps.places.PlacesService(map);
      const qMatch = url.match(/[?&]q=([^&]+)/);
      const placeQuery = qMatch ? decodeURIComponent(qMatch[1]) : null;

      const request = placeQuery
        ? { query: placeQuery, fields: ["name", "geometry", "formatted_address"] }
        : { query: url, fields: ["name", "geometry", "formatted_address"] };

      placesService.findPlaceFromQuery(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
          const r = results[0];
          const place = {
            name: r.name,
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
            address: r.formatted_address,
          };
          addMarker(place, true);
          showNotification("Placesから場所をインポートしました", "success");
          document.getElementById("urlInput").value = "";
        } else {
          showNotification("Places検索で場所が見つかりませんでした", "info");
        }
      });
      return;
    }

    showNotification("有効なGoogle Maps URLを入力してください", "info");
  } catch (err) {
    console.error(err);
    showNotification("URLの解析中にエラーが発生しました", "info");
  }
}

// --- Google Maps 実装 ---
let map; // google.maps.Map
let mapMarkers = [];

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Google Mapsの読み込みに失敗しました"));
    document.head.appendChild(script);
  });
}

// Google Maps 認証失敗時のグローバルコールバック
window.gm_authFailure = function () {
  console.error(
    "Google Maps authentication failed (gm_authFailure) - ApiNotActivatedMapError or invalid API key"
  );
  const mapDiv = document.getElementById("map");
  if (mapDiv) {
    mapDiv.innerHTML = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff0f0;">
                <div style="text-align:center;color:#e74c3c;">
                    <p style="font-size:18px;margin-bottom:8px;">Google Maps の認証に失敗しました</p>
                    <p style="color:#7f8c8d;font-size:13px;">ApiNotActivatedMapError または API キーの問題の可能性があります。READMEのトラブルシュートを確認してください。</p>
                </div>
            </div>
        `;
  }
  try {
    showNotification("Google Maps の認証に失敗しました（ApiNotActivatedMapError）", "error");
  } catch (e) {}
};

async function initMap() {
  const mapDiv = document.getElementById("map");
  if (map) return;

  const hash = new URLSearchParams(window.location.hash.replace("#", ""));
  let apiKey = hash.get("key");
  if (!apiKey) apiKey = window.sessionStorage.getItem("GMAP_API_KEY");

  if (!apiKey) {
    apiKey = prompt("Google Maps APIキーを入力してください（ローカルでの利用は制限に注意）");
    if (!apiKey) {
      mapDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;"><div style="text-align:center;color:#7f8c8d;">Google Maps APIキーが必要です</div></div>`;
      return;
    }
    window.sessionStorage.setItem("GMAP_API_KEY", apiKey);
  }

  try {
    await loadGoogleMaps(apiKey);
  } catch (err) {
    mapDiv.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;"><div style="text-align:center;color:#e74c3c;">地図の読み込みに失敗しました: ${err.message}</div></div>`;
    return;
  }

  map = new google.maps.Map(mapDiv, { center: { lat: 35.681236, lng: 139.767125 }, zoom: 12 });
  appState.pins.forEach((p) => addMarker(p));
  map.addListener("dblclick", (e) => {
    clickedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    openModal();
  });

  // 場所検索オートコンプリートの初期化
  const locationInput = document.getElementById("itemLocation");
  autocomplete = new google.maps.places.Autocomplete(locationInput, {
    fields: ["name", "geometry", "website"],
  });

  autocomplete.addListener("place_changed", () => {
    selectedPlace = autocomplete.getPlace();
    if (selectedPlace) {
      // 場所の情報をフォームに自動入力
      document.getElementById("itemTitle").value = selectedPlace.name || "";
      document.getElementById("itemUrl").value = selectedPlace.website || "";
    }
  });
}

function addMarker(pinData, center = false, fromRemote = false) {
  if (!map) return;
  const position = { lat: Number(pinData.lat), lng: Number(pinData.lng) };
  const marker = new google.maps.Marker({
    position,
    map,
    title: pinData.title || pinData.name || "場所",
  });
  const info = new google.maps.InfoWindow({
    content: `<div style="min-width:150px"><strong>${pinData.title || pinData.name}</strong><div>${
      pinData.address || ""
    }</div></div>`,
  });
  marker.addListener("click", () => info.open(map, marker));
  mapMarkers.push(marker);

  const markerData = {
    lat: Number(pinData.lat),
    lng: Number(pinData.lng),
    title: pinData.title || pinData.name || "場所",
    id: pinData.id || Date.now(),
  };
  appState.pins.push(markerData);

  // WebRTC同期（リモートからの変更でなければ送信）
  if (!fromRemote && collaborationEnabled && window.webRTCManager) {
    window.webRTCManager.sendMarker(markerData);
  }

  if (center) map.panTo(position);
}

function centerMap() {
  showNotification("現在地を中心に表示しました", "info");
}

// ドラッグ&ドロップの実装
let draggedElement = null;

document.addEventListener("DOMContentLoaded", function () {
  const timelineItems = document.querySelectorAll(".timeline-item");
  timelineItems.forEach((item) => {
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragend", handleDragEnd);
  });
  const ideaCards = document.querySelectorAll(".idea-card");
  ideaCards.forEach((card) => {
    card.draggable = true;
    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragover", handleDragOver);
    card.addEventListener("drop", handleDrop);
    card.addEventListener("dragend", handleDragEnd);
  });
});

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}
function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const afterElement = getDragAfterElement(e.currentTarget.parentElement, e.clientY);
  if (afterElement == null) e.currentTarget.parentElement.appendChild(draggedElement);
  else e.currentTarget.parentElement.insertBefore(draggedElement, afterElement);
  return false;
}
function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  if (this.classList.contains("timeline-item")) updateTimelineTime();
  return false;
}
function handleDragEnd(e) {
  this.classList.remove("dragging");
  draggedElement = null;
}
function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".timeline-item:not(.dragging), .idea-card:not(.dragging)"),
  ];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
      else return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

// タイムラインの時間を自動調整
function updateTimelineTime() {
  const timelineItems = document.querySelectorAll(".timeline-item");
  let currentTime = new Date();
  currentTime.setHours(9, 0, 0, 0);
  timelineItems.forEach((item, index) => {
    const timeDisplay = item.querySelector(".time-display");
    const durationText = item.querySelector(".timeline-duration").textContent;
    const hours = currentTime.getHours().toString().padStart(2, "0");
    const minutes = currentTime.getMinutes().toString().padStart(2, "0");
    timeDisplay.textContent = `${hours}:${minutes}`;
    const durationMatch = durationText.match(/(\d+)時間(?:(\d+)分)?/);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1] || 0);
      const minutes = parseInt(durationMatch[2] || 0);
      currentTime.setHours(currentTime.getHours() + hours);
      currentTime.setMinutes(currentTime.getMinutes() + minutes);
    } else {
      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }
  });
  showNotification("スケジュールの時間を自動調整しました", "success");
}

// 通知の表示
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// リアルタイム共同編集のシミュレーション
function simulateCollaboration() {
  setInterval(() => {
    appState.users.forEach((user) => {
      if (user.id !== 1) {
        user.x = Math.random() * window.innerWidth;
        user.y = Math.random() * window.innerHeight;
        updateUserCursor(user);
      }
    });
  }, 2000);
}

function updateUserCursor(user) {
  let cursor = document.getElementById(`cursor-${user.id}`);
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = `cursor-${user.id}`;
    cursor.className = "user-cursor";
    cursor.style.background = user.color;
    cursor.setAttribute("data-name", user.name);
    document.body.appendChild(cursor);
  }
  cursor.style.left = `${user.x}px`;
  cursor.style.top = `${user.y}px`;
}

class CollaborationManager {
  constructor() {
    this.ws = null;
    this.userId = Math.random().toString(36).substr(2, 9);
    this.initConnection();
  }
  initConnection() {
    console.log("Discord Activity 接続をシミュレート中...");
    document.addEventListener("mousemove", (e) => {
      this.broadcastCursorPosition(e.clientX, e.clientY);
    });
    this.observeDataChanges();
  }
  broadcastCursorPosition(x, y) {
    const data = { type: "cursor", userId: this.userId, x: x, y: y };
  }
  broadcastDataChange(changeType, data) {
    const message = {
      type: "dataChange",
      changeType: changeType,
      data: data,
      timestamp: Date.now(),
      userId: this.userId,
    };
  }
  observeDataChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          this.broadcastDataChange("add", { element: mutation.addedNodes[0].outerHTML });
        }
      });
    });
    observer.observe(document.getElementById("ideaBoard"), { childList: true, subtree: true });
  }
}

// 詳細な場所情報を追加するための拡張モーダル
function createDetailedPinModal() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "detailedPinModal";
  modal.innerHTML = `...`;
  document.body.appendChild(modal);
}

// タブ切り替え機能
document.addEventListener("DOMContentLoaded", function () {
  const dayTabs = document.querySelectorAll(".day-tab");
  dayTabs.forEach((tab) => {
    tab.addEventListener("click", function () {
      dayTabs.forEach((t) => t.classList.remove("active"));
      this.classList.add("active");
      const day = this.textContent;
      filterPinsByDay(day);
      showNotification(`${day}の予定を表示中`, "info");
    });
  });
  simulateCollaboration();
  new CollaborationManager();

  // WebRTC初期化
  setTimeout(() => {
    initWebRTC();
    showNotification("協働機能を初期化中...", "info");
  }, 1000);

  // マップとオートコンプリートを初期化
  initMap();

  // 時間の自動計算
  const startTimeInput = document.getElementById("itemStartTime");
  const durationInput = document.getElementById("itemDuration");
  const endTimeInput = document.getElementById("itemEndTime");

  startTimeInput.addEventListener("blur", autoCalculateTime);
  durationInput.addEventListener("blur", autoCalculateTime);
  endTimeInput.addEventListener("blur", autoCalculateTime);
});

function autoCalculateTime() {
  const startTimeInput = document.getElementById("itemStartTime");
  const durationInput = document.getElementById("itemDuration");
  const endTimeInput = document.getElementById("itemEndTime");

  const startTime = startTimeInput.value;
  const duration = durationInput.value;
  const endTime = endTimeInput.value;

  if (startTime && duration && !endTime) {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const durationMinutes = parseDurationToMinutes(duration);
    if (isNaN(start) || isNaN(durationMinutes)) return;
    start.setMinutes(start.getMinutes() + durationMinutes);
    endTimeInput.value = start.toTimeString().slice(0, 5);
  } else if (startTime && !duration && endTime) {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    if (isNaN(start) || isNaN(end)) return;
    let diffMinutes = (end - start) / (1000 * 60);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // 日付をまたぐ場合
    durationInput.value = formatMinutesToDuration(diffMinutes);
  } else if (!startTime && duration && endTime) {
    const end = new Date(`1970-01-01T${endTime}:00`);
    const durationMinutes = parseDurationToMinutes(duration);
    if (isNaN(end) || isNaN(durationMinutes)) return;
    end.setMinutes(end.getMinutes() - durationMinutes);
    startTimeInput.value = end.toTimeString().slice(0, 5);
  }
}

function parseDurationToMinutes(durationStr) {
  let totalMinutes = 0;
  const hourMatch = durationStr.match(/(\d+)時間/);
  const minMatch = durationStr.match(/(\d+)分/);
  const hMatch = durationStr.match(/(\d+)h/);
  const mMatch = durationStr.match(/(\d+)m/);

  if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMinutes += parseInt(minMatch[1]);
  if (hMatch) totalMinutes += parseInt(hMatch[1]) * 60;
  if (mMatch) totalMinutes += parseInt(mMatch[1]);
  
  // 数字のみの場合、分として解釈
  if (!hourMatch && !minMatch && !hMatch && !mMatch && !isNaN(parseInt(durationStr))) {
    totalMinutes = parseInt(durationStr);
  }

  return totalMinutes;
}

function formatMinutesToDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  let result = "";
  if (h > 0) result += `${h}時間`;
  if (m > 0) result += `${m}分`;
  return result || "0分";
}

function filterPinsByDay(day) {
  console.log(`Filtering pins for: ${day}`);
}

class GoogleMapsParser {
  constructor(url) {
    this.url = url;
  }
  async parse() {
    return {
      name: "サンプル場所",
      address: "北海道札幌市中央区",
      lat: 43.0621,
      lng: 141.3544,
      photos: ["https://example.com/photo.jpg"],
      rating: 4.5,
      placeId: "ChIJCxl5fsFrGGAR",
    };
  }
}

function exportTripPlan() {
  const tripData = {
    title: "北海道旅行プラン",
    created: new Date().toISOString(),
    ideas: appState.ideas,
    pins: appState.pins,
    timeline: appState.timeline,
  };
  const dataStr = JSON.stringify(tripData, null, 2);
  const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
  const exportFileDefaultName = `trip_plan_${Date.now()}.json`;
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute("download", exportFileDefaultName);
  linkElement.click();
}

function importTripPlan(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const tripData = JSON.parse(e.target.result);
      appState.ideas = tripData.ideas || [];
      appState.pins = tripData.pins || [];
      appState.timeline = tripData.timeline || [];
      refreshUI();
      showNotification("プランをインポートしました", "success");
    } catch (error) {
      showNotification("インポートに失敗しました", "error");
    }
  };
  reader.readAsText(file);
}

function refreshUI() {
  const ideaBoard = document.getElementById("ideaBoard");
  ideaBoard.innerHTML = "";
  appState.ideas.forEach((idea) => {
    addIdeaCard(idea.title, idea.description, idea.type, idea.day, false, idea.startTime, idea.duration, idea.endTime);
  });
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";
  appState.timeline.forEach((item) => {
    addTimelineItem(item);
  });
}

function updateFlowchart() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = ""; // タイムラインをクリア

  const timedIdeas = appState.ideas
    .filter(idea => idea.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  timedIdeas.forEach(idea => {
    addTimelineItem(idea);
  });
}

function addTimelineItem(idea) {
  const timeline = document.getElementById("timeline");
  const timelineItem = document.createElement("div");
  timelineItem.className = "timeline-item";
  timelineItem.draggable = true;

  timelineItem.innerHTML = `
    <div class="time-display">${idea.startTime || "未定"}</div>
    <div class="timeline-content">
      <div class="timeline-title">${idea.title}</div>
      <div class="timeline-duration">所要時間: ${idea.duration || "未定"}</div>
    </div>
  `;

  timelineItem.addEventListener("dragstart", handleDragStart);
  timelineItem.addEventListener("dragover", handleDragOver);
  timelineItem.addEventListener("drop", handleDrop);
  timelineItem.addEventListener("dragend", handleDragEnd);
  timeline.appendChild(timelineItem);
}

// キーボードショートカット
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    exportTripPlan();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "n") {
    e.preventDefault();
    openModal();
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    switch (e.key) {
      case "1":
        switchView("idea");
        break;
      case "2":
        switchView("map");
        break;
      case "3":
        switchView("flowchart");
        break;
    }
  }
});

console.log("🗺️ 旅行プランナーを初期化しています...");
console.log("Discord Activity として動作可能です");
