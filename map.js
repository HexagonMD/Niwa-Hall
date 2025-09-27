let map; // google.maps.Map
let mapMarkers = [];
let photoInfoWindow = null;
let slideshowInterval = null;
let isInfoWindowPinned = false;
let pinnedMarker = null;

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
  photoInfoWindow = new google.maps.InfoWindow();
  photoInfoWindow.addListener("closeclick", () => {
    hidePhotoPreview();
  });

  map.addListener("dblclick", (e) => {
    if (typeof createPinAndIdeaFromLatLng === "function") {
      createPinAndIdeaFromLatLng(e.latLng);
    }
  });

  appState.pins.forEach((p) => addMarker(p));

  // 場所検索オートコンプリートの初期化
  const locationInput = document.getElementById("itemLocation");
  if (locationInput) {
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

  // マップビューの検索バーの初期化
  const mapSearchInput = document.getElementById("mapSearchInput");
  const mapAutocomplete = new google.maps.places.Autocomplete(mapSearchInput, {
    fields: ["name", "geometry"],
  });

  mapAutocomplete.addListener("place_changed", () => {
    const place = mapAutocomplete.getPlace();
    if (place.geometry) {
      if (typeof createPinAndIdeaFromPlace === "function") {
        createPinAndIdeaFromPlace(place);
      }
      mapSearchInput.value = ""; // 入力欄をクリア
    } else {
      showNotification("有効な場所が選択されませんでした", "error");
    }
  });
}

function createMarker(pinData) {
  const position = { lat: Number(pinData.lat), lng: Number(pinData.lng) };
  const marker = new google.maps.Marker({
    position,
    map,
    title: pinData.title || pinData.name || "場所",
  });

  marker.addListener("dblclick", () => {
    if (typeof openEditModalForPin === "function") {
      openEditModalForPin(pinData);
    }
  });

  marker.addListener("mouseover", () => {
    if (!isInfoWindowPinned) {
      showPhotoPreview(pinData, marker);
    }
  });

  marker.addListener("click", () => {
    if (isInfoWindowPinned && pinnedMarker === marker) {
      hidePhotoPreview();
    } else {
      showPhotoPreview(pinData, marker, true); // true to pin
    }
  });

  marker.addListener("mouseout", () => {
    if (!isInfoWindowPinned) {
      hidePhotoPreview();
    }
  });

  marker.addListener("rightclick", (e) => {
    if (confirm("このピンを消去しますか？")) {
      if (typeof deletePinAndIdea === "function") {
        deletePinAndIdea(pinData);
      }
    }
  });

  return marker;
}

function addMarker(pinData, center = false, fromRemote = false) {
  if (!map) return;

  const marker = createMarker(pinData);
  mapMarkers.push(marker);

  const markerData = {
    lat: Number(pinData.lat),
    lng: Number(pinData.lng),
    title: pinData.title || pinData.name || "場所",
    id: pinData.id || Date.now(),
  };

  // appStateにピンが存在しない場合のみ追加
  if (!appState.pins.find((p) => p.id === markerData.id)) {
    appState.pins.push(markerData);
  }

  // WebRTC同期（リモートからの変更でなければ送信）
  if (!fromRemote && window.collaborationEnabled && window.webRTCManager) {
    window.webRTCManager.sendMarker(markerData);
  }

  if (center) map.panTo(marker.getPosition());
}

function renderAllMarkers() {
  // 全てのマーカーをクリア
  mapMarkers.forEach((marker) => marker.setMap(null));
  mapMarkers = [];

  // appState.pinsからマーカーを再描画
  appState.pins.forEach((pin) => {
    const marker = createMarker(pin);
    mapMarkers.push(marker);
  });
}

function showPhotoPreview(pinData, marker, pin = false) {
  hidePhotoPreview(); // 既存のプレビューを閉じる

  if (pin) {
    isInfoWindowPinned = true;
    pinnedMarker = marker;
  }

  const idea = appState.ideas.find((i) => i.id === pinData.id);
  if (!idea || !idea.photos || idea.photos.length === 0) {
    photoInfoWindow.setContent(
      `<div style="min-width:150px"><strong>${
        pinData.title || pinData.name
      }</strong><br>写真はありません</div>`
    );
    photoInfoWindow.open(map, marker);
    return;
  }

  let currentIndex = 0;
  const contentDiv = document.createElement("div");
  contentDiv.style.width = "200px";
  contentDiv.style.height = "200px";
  contentDiv.innerHTML = `<img src="${idea.photos[currentIndex]}" style="width:100%;height:100%;object-fit:cover;">`;
  photoInfoWindow.setContent(contentDiv);
  photoInfoWindow.open(map, marker);

  if (idea.photos.length > 1) {
    slideshowInterval = setInterval(() => {
      currentIndex = (currentIndex + 1) % idea.photos.length;
      contentDiv.innerHTML = `<img src="${idea.photos[currentIndex]}" style="width:100%;height:100%;object-fit:cover;">`;
    }, 2000);
  }
}

function hidePhotoPreview() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
  if (photoInfoWindow) {
    photoInfoWindow.close();
  }
  isInfoWindowPinned = false;
  pinnedMarker = null;
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
