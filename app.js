// アプリの状態管理
let appState = {
  currentView: "idea",
  pins: [],
  ideas: [],
  timeline: [],
  users: [
    { id: 1, name: "User1", color: "#3498db", x: 0, y: 0 },
    { id: 2, name: "User2", color: "#e74c3c", x: 0, y: 0 },
    { id: 3, name: "User3", color: "#27ae60", x: 0, y: 0 },
  ],
};

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
}

// モーダルの開閉
function openModal() {
  document.getElementById("modal").classList.add("active");
}
function closeModal() {
  document.getElementById("modal").classList.remove("active");
  document.getElementById("addForm").reset();
}

// フォーム送信処理
document.getElementById("addForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const title = document.getElementById("itemTitle").value;
  const description = document.getElementById("itemDescription").value;
  const url = document.getElementById("itemUrl").value;
  const pinType = document.querySelector('input[name="pinType"]:checked').value;
  const day = document.getElementById("itemDay").value;

  // 新しいアイデアカードを追加
  addIdeaCard(title, description, pinType, day);

  // 通知を表示
  showNotification(`「${title}」を追加しました`, "success");

  closeModal();
});

// アイデアカードの追加
function addIdeaCard(title, description, type, day) {
  const ideaBoard = document.getElementById("ideaBoard");
  const card = document.createElement("div");
  card.className = "idea-card";

  const typeEmoji = { food: "🍜", sightseeing: "🏔️", hotel: "🏨", transport: "🚗" };
  const typeLabel = { food: "グルメ", sightseeing: "観光", hotel: "宿泊", transport: "交通" };

  card.innerHTML = `
        <h3>${typeEmoji[type]} ${title}</h3>
        <p>${description}</p>
        <div class="idea-tags">
            <span class="tag">${typeLabel[type]}</span>
            ${day !== "0" ? `<span class="tag">${day}日目</span>` : ""}
        </div>
    `;

  ideaBoard.appendChild(card);
}

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
  map.addListener("click", (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const data = { title: "新しいピン", lat, lng };
    addMarker(data, true);
  });
}

function addMarker(pinData, center = false) {
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
  appState.pins.push(pinData);
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
});

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
    addIdeaCard(idea.title, idea.description, idea.type, idea.day);
  });
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";
  appState.timeline.forEach((item) => {
    addTimelineItem(item);
  });
}

function addTimelineItem(item) {
  const timeline = document.getElementById("timeline");
  const timelineItem = document.createElement("div");
  timelineItem.className = "timeline-item";
  timelineItem.draggable = true;
  timelineItem.innerHTML = `\n                <div class="time-display">${item.time}</div>\n                <div class="timeline-content">\n                    <div class="timeline-title">${item.title}</div>\n                    <div class="timeline-duration">所要時間: ${item.duration}</div>\n                </div>\n            `;
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
