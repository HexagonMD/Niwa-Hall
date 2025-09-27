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
