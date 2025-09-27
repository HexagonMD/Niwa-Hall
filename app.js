let clickedLatLng = null;
let selectedPlace = null;
let autocomplete;
let editingPinId = null; // 編集中のピンのIDを保持
let currentEditingPhotos = []; // 編集中の写真リスト
let collaborationEnabled = false; // 協働機能の状態

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
      addIdeaCard(
        data.title,
        data.description,
        data.type,
        data.day,
        true,
        data.startTime,
        data.duration,
        data.endTime,
        data.id
      );
      console.log("✅ 受信アイデアを画面に追加完了");
    });

    window.webRTCManager.on("markerReceived", (data) => {
      console.log("📍 マーカー受信:", data);

      // マーカーを追加
      addMarker(data, true, true);

      const fallbackIdea = {
        id: data.id,
        title: data.title || data.name || "共有されたスポット",
        description: data.address || `座標: ${data.lat}, ${data.lng}`,
        type: "sightseeing",
        day: "0",
      };

      const existingIdea = appState.ideas.find((idea) => idea.id === data.id);
      const isNewIdea = !existingIdea;

      if (existingIdea) {
        const mergedIdea = {
          ...existingIdea,
          title: fallbackIdea.title || existingIdea.title,
          description: existingIdea.description || fallbackIdea.description,
        };

        addIdeaCard(
          mergedIdea.title,
          mergedIdea.description,
          mergedIdea.type,
          mergedIdea.day,
          true,
          mergedIdea.startTime,
          mergedIdea.duration,
          mergedIdea.endTime,
          mergedIdea.id,
          mergedIdea.photos || []
        );
      } else {
        addIdeaCard(
          fallbackIdea.title,
          fallbackIdea.description,
          fallbackIdea.type,
          fallbackIdea.day,
          true,
          undefined,
          undefined,
          undefined,
          fallbackIdea.id
        );
      }

      if (isNewIdea) {
        showNotification("新しいスポットが共有されました", "success");
      }
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
      window.collaborationEnabled = true;
      appState.roomId = roomId;
      console.log("🎯 ルーム参加完了、協働機能有効化:", { roomId, collaborationEnabled });
      updateUserList();
      showNotification("協働機能が有効になりました！", "success");
    });

    window.webRTCManager.on("roomLeft", () => {
      collaborationEnabled = false;
      window.collaborationEnabled = false;
      appState.roomId = null;
      updateUserList();
    });
  } catch (error) {
    console.error("❌ WebRTC初期化エラー:", error);
    showNotification("WebRTC初期化に失敗しました: " + error.message, "error");
  }
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
    window.collaborationEnabled = false;
    showNotification("協働セッションから退出しました", "info");
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
      addIdeaCard(
        idea.title,
        idea.description,
        idea.type,
        idea.day,
        true,
        idea.startTime,
        idea.duration,
        idea.endTime,
        idea.id
      );
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
function addIdeaCard(
  title,
  description,
  type,
  day,
  fromRemote = false,
  startTime,
  duration,
  endTime,
  existingId,
  photos = []
) {
  console.log("🎯 addIdeaCard呼び出し:", {
    title,
    description,
    type,
    day,
    fromRemote,
    startTime,
    duration,
    endTime,
    existingId,
    photos,
  });

  const ideaData = {
    title,
    description,
    type,
    day,
    id: existingId || Date.now(),
    startTime,
    duration,
    endTime,
    photos,
  };
  const existingIndex = appState.ideas.findIndex((idea) => idea.id === ideaData.id);
  if (existingIndex >= 0) {
    appState.ideas[existingIndex] = ideaData;
  } else {
    appState.ideas.push(ideaData);
  }

  const card = typeof window.renderIdeaCard === "function" ? window.renderIdeaCard(ideaData) : null;
  if (!card) {
    console.warn("⚠️ アイデアカードの描画に失敗しました");
  }

  // WebRTC同期の詳細チェック
  console.log("🔍 WebRTC同期チェック開始");
  console.log("- fromRemote:", fromRemote);
  console.log("- collaborationEnabled:", collaborationEnabled);
  console.log("- window.webRTCManager:", !!window.webRTCManager);

  if (!fromRemote && collaborationEnabled && window.webRTCManager) {
    const notification = showNotification("アイデアを保存中...", "info", 10000);
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
      notification.textContent = "同期完了！";
      notification.className = "notification success";
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 300);
      }, 1500);
    } catch (error) {
      console.error("❌ WebRTC送信エラー:", error);
      notification.textContent = "同期失敗...";
      notification.className = "notification error";
    }
  } else {
    console.log("❌ WebRTC送信スキップ理由:", {
      fromRemote: fromRemote,
      collaborationEnabled: collaborationEnabled,
      webRTCManagerExists: !!window.webRTCManager,
      condition: `!${fromRemote} && ${collaborationEnabled} && ${!!window.webRTCManager}`,
    });
  }

  // フローチャートを更新
  if (typeof updateFlowchart === "function") {
    updateFlowchart();
  }
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
  const photos = currentEditingPhotos; // グローバルの一時配列から取得

  if (editingPinId) {
    // --- 編集モード ---
    const pinIndex = appState.pins.findIndex((p) => p.id === editingPinId);
    if (pinIndex > -1) {
      appState.pins[pinIndex].title = title;
    }

    const ideaIndex = appState.ideas.findIndex((i) => i.id === editingPinId);
    if (ideaIndex > -1) {
      appState.ideas[ideaIndex] = {
        ...appState.ideas[ideaIndex],
        title,
        description,
        type: pinType,
        day,
        startTime,
        duration,
        endTime,
        photos, // 更新された写真リスト
      };
    }

    renderAllMarkers();
    const updatedIdea = appState.ideas[ideaIndex];
    renderIdeaCard(updatedIdea);

    if (collaborationEnabled && window.webRTCManager) {
      if (updatedIdea) {
        window.webRTCManager.sendIdea(updatedIdea);
      }
      if (pinIndex > -1 && appState.pins[pinIndex]) {
        window.webRTCManager.sendMarker(appState.pins[pinIndex]);
      }
    }

    showNotification(`「${title}」を更新しました`, "success");
  } else {
    // This block might be deprecated now, but we'll leave it for now.
    const newId = Date.now();
    addIdeaCard(
      title,
      description,
      pinType,
      day,
      false,
      startTime,
      duration,
      endTime,
      newId,
      photos
    );

    if (clickedLatLng) {
      const data = { id: newId, title: title, lat: clickedLatLng.lat, lng: clickedLatLng.lng };
      addMarker(data, true);
      clickedLatLng = null;
    } else if (selectedPlace && selectedPlace.geometry) {
      const data = {
        id: newId,
        title: selectedPlace.name,
        lat: selectedPlace.geometry.location.lat(),
        lng: selectedPlace.geometry.location.lng(),
      };
      addMarker(data, true);
    }
    showNotification(`「${title}」を追加しました`, "success");
  }

  updateFlowchart();
  closeModal();
});

function renderPhotoPreviews() {
  const previewContainer = document.getElementById("photoPreviews");
  previewContainer.innerHTML = "";
  currentEditingPhotos.forEach((photoSrc) => {
    const img = document.createElement("img");
    img.src = photoSrc;

    img.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (confirm("この写真を削除しますか？")) {
        const index = currentEditingPhotos.indexOf(photoSrc);
        if (index > -1) {
          currentEditingPhotos.splice(index, 1);
        }
        renderPhotoPreviews(); // プレビューを再描画
      }
    });

    previewContainer.appendChild(img);
  });
}

// 写真プレビューの処理
document.getElementById("itemPhotos").addEventListener("change", function (event) {
  const files = event.target.files;
  let filesToProcess = files.length;

  if (filesToProcess === 0) return;

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      filesToProcess--;
      continue;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      currentEditingPhotos.push(e.target.result);
      filesToProcess--;
      if (filesToProcess === 0) {
        renderPhotoPreviews();
      }
    };
    reader.readAsDataURL(file);
  }
});

function openEditModalForPin(pinData) {
  editingPinId = pinData.id;
  const idea = appState.ideas.find((i) => i.id === pinData.id);

  // フォームの値を設定
  document.getElementById("itemTitle").value = pinData.title || "";
  if (idea) {
    document.getElementById("itemDescription").value = idea.description || "";
    document.getElementById("itemUrl").value = idea.url || "";
    document.getElementById("itemStartTime").value = idea.startTime || "";
    document.getElementById("itemDuration").value = idea.duration || "";
    document.getElementById("itemEndTime").value = idea.endTime || "";
    document.querySelector(
      `input[name="pinType"][value="${idea.type || "sightseeing"}"]`
    ).checked = true;
    document.getElementById("itemDay").value = idea.day || "0";

    // 写真データを一時配列にコピー
    currentEditingPhotos = idea.photos ? [...idea.photos] : [];
  } else {
    // ideaがない場合（ピンのみの場合）
    currentEditingPhotos = [];
  }

  // 写真プレビューをレンダリング
  renderPhotoPreviews();

  openModal();
}

function createPinAndIdeaFromPlace(place) {
  const newId = Date.now();

  // Pinデータを作成
  const pinData = {
    id: newId,
    title: place.name,
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
  };

  // 対応するIdeaデータを最小限で作成
  const ideaData = {
    id: newId,
    title: place.name,
    description: "",
    type: "sightseeing", // デフォルトのタイプ
    day: "0", // デフォルトは未定
  };

  // appStateに追加
  appState.pins.push(pinData);
  appState.ideas.push(ideaData);

  // 地図にマーカーを追加（WebRTC送信も含む）
  addMarker(pinData, true, false); // fromRemote=false でWebRTC送信を有効化

  // アイデアボードにカードを追加（WebRTC送信も含む）
  addIdeaCard(
    ideaData.title,
    ideaData.description,
    ideaData.type,
    ideaData.day,
    false, // fromRemote=false
    undefined, // startTime
    undefined, // duration
    undefined, // endTime
    ideaData.id
  );

  showNotification(
    `「${place.name}」をマップとアイデアに追加しました。クリックして詳細を編集できます。`,
    "success",
    5000
  );
}
window.createPinAndIdeaFromPlace = createPinAndIdeaFromPlace;

function deletePinAndIdea(pinData) {
  // appState.pinsから削除
  const pinIndex = appState.pins.findIndex((p) => p.id === pinData.id);
  if (pinIndex > -1) {
    appState.pins.splice(pinIndex, 1);
  }

  // appState.ideasから削除
  const ideaIndex = appState.ideas.findIndex((i) => i.id === pinData.id);
  if (ideaIndex > -1) {
    appState.ideas.splice(ideaIndex, 1);
  }

  // UIを更新
  renderAllMarkers(); // マップを更新
  removeIdeaCard(pinData.id); // アイデアカードを削除

  showNotification(`「${pinData.title}」を削除しました`, "success");
}
window.deletePinAndIdea = deletePinAndIdea;

function createPinAndIdeaFromLatLng(latLng) {
  const newId = Date.now();
  const title = "新しい場所";

  const pinData = {
    id: newId,
    title: title,
    lat: latLng.lat(),
    lng: latLng.lng(),
  };

  const ideaData = {
    id: newId,
    title: title,
    description: "",
    type: "sightseeing",
    day: "0",
    photos: [],
  };

  appState.pins.push(pinData);
  appState.ideas.push(ideaData);

  addMarker(pinData, false, false); // fromRemote=false でWebRTC送信を有効化
  addIdeaCard(
    ideaData.title,
    ideaData.description,
    ideaData.type,
    ideaData.day,
    false, // fromRemote=false
    undefined, // startTime
    undefined, // duration
    undefined, // endTime
    ideaData.id,
    ideaData.photos
  );

  // すぐに編集モーダルを開く
  openEditModalForPin(pinData);
}
window.createPinAndIdeaFromLatLng = createPinAndIdeaFromLatLng;

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

console.log("🗺️ 旅行プランナーを初期化しています...");
console.log("Discord Activity として動作可能です");
