let clickedLatLng = null;
let selectedPlace = null;
let autocomplete;
let editingPinId = null; // 編集中のピンのIDを保持
let currentEditingPhotos = []; // 編集中の写真リスト
let collaborationEnabled = false; // 協働機能の状態

// アプリの状態管理
let appState = {
  currentView: "idea",
  days: [{ id: 1, name: "1日目" }],
  pins: [],
  ideas: [],
  timeline: [],
  users: [],
  isHost: false,
  roomId: null,
  bookmark: {
    title: "旅行のしおり",
    coverImage: null,
  },
};

const BOOKMARK_BACKGROUND_COLORS = new Set([
  "#ffffff",
  "#f8fafc",
  "#fef3c7",
  "#e0f2fe",
  "#dcfce7",
  "#f5f3ff",
]);

function setEditingPinId(value) {
  editingPinId = value;
  if (typeof window !== "undefined") {
    window.__editingPinId = value;
    window.editingPinId = value;
  }
  return editingPinId;
}

function getEditingPinId() {
  if (typeof window !== "undefined") {
    if (typeof window.__editingPinId !== "undefined") {
      return window.__editingPinId;
    }
    if (typeof window.editingPinId !== "undefined") {
      return window.editingPinId;
    }
  }
  return editingPinId;
}

if (typeof window !== "undefined") {
  window.__editingPinId = editingPinId;
  window.editingPinId = editingPinId;
  window.setEditingPinId = setEditingPinId;
  window.getEditingPinId = getEditingPinId;
}

function resolveBookmarkBackgroundColor(candidate) {
  if (typeof candidate !== "string") {
    return "#ffffff";
  }

  const trimmed = candidate.trim().toLowerCase();
  return BOOKMARK_BACKGROUND_COLORS.has(trimmed) ? trimmed : "#ffffff";
}

// --- State Management and Synchronization ---

/**
 * Renders the entire UI based on the current appState.
 */
function renderUIFromState() {
  console.log("🔄 Rendering UI from state...");
  renderDayTabs();
  updateDayOptions();

  const ideaBoard = document.getElementById("ideaBoard");
  if (ideaBoard) {
    ideaBoard.innerHTML = "";
    appState.ideas.forEach(idea => {
      if (typeof window.renderIdeaCard === "function") {
        window.renderIdeaCard(idea);
      }
    });
  }

  if (typeof window.renderAllMarkers === "function") {
    renderAllMarkers(appState.pins);
  }
  if (typeof window.updateFlowchart === "function") {
    updateFlowchart();
  }
  if (typeof window.updateBookmark === "function") {
    updateBookmark();
  }
  if (typeof window.updateIdeaBoardEmptyState === "function") {
    updateIdeaBoardEmptyState();
  }
  console.log("✅ UI Rendering complete.");
}

/**
 * Updates the appState and triggers UI rendering and synchronization.
 * @param {function | object} updater - A function that receives the current state and returns the new state, or a new state object.
 * @param {boolean} [fromRemote=false] - Flag to indicate if the update is from a remote client.
 */
function updateStateAndSync(updater, fromRemote = false) {
  console.log(`🔄 Updating state. Remote: ${fromRemote}`);
  const oldState = appState;
  const newState = typeof updater === 'function' ? updater(oldState) : updater;

  appState = newState;

  renderUIFromState();

  if (!fromRemote && collaborationEnabled && window.webRTCManager) {
    console.log("📤 Broadcasting new app state...");
    window.webRTCManager.sendAppState(appState);
  }
}


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

    // --- WebRTCイベントリスナー ---

    // 他のクライアントから新しいappStateを受信
    window.webRTCManager.on("appStateReceived", (newState) => {
      console.log("📥 New app state received from remote");
      updateStateAndSync(newState, true); // fromRemote = true
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
      
      // Update state without broadcasting
      updateStateAndSync(currentState => ({ ...currentState, roomId }), true);

      console.log("🎯 ルーム参加完了、協働機能有効化:", { roomId, collaborationEnabled });
      updateUserList();
      showNotification("協働機能が有効になりました！", "success");
    });

    window.webRTCManager.on("roomLeft", () => {
      collaborationEnabled = false;
      window.collaborationEnabled = false;
      
      // Update state without broadcasting
      updateStateAndSync(currentState => ({ ...currentState, roomId: null }), true);

      updateUserList();
    });
  }
  catch (error) {
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
    // The roomLeft event will handle state updates
    showNotification("協働セッションから退出しました", "info");
  }
}


// アイデアカードの追加（WebRTC対応版）

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appendTextWithLineBreaks(element, text) {
  const fragments = String(text).split(/\r?\n/);
  fragments.forEach((fragment, index) => {
    element.appendChild(document.createTextNode(fragment));
    if (index < fragments.length - 1) {
      element.appendChild(document.createElement("br"));
    }
  });
}

function updateBookmark() {
  const pagesContainer = document.getElementById("bookmarkPages");
  if (!pagesContainer) {
    return;
  }

  if (!appState.bookmark) {
    appState.bookmark = { title: "", coverImage: null, backgroundColor: "#ffffff" };
  }

  const bookmarkState = appState.bookmark;
  const resolvedColor = resolveBookmarkBackgroundColor(bookmarkState.backgroundColor);
  if (bookmarkState.backgroundColor !== resolvedColor) {
    bookmarkState.backgroundColor = resolvedColor;
  }

  let pageBackground = resolvedColor;
  const title = (bookmarkState.title || "").trim() || "Trip Bookmark";

  const titleInput = document.getElementById("bookmarkTitleInput");
  if (titleInput && titleInput.value !== bookmarkState.title) {
    titleInput.value = bookmarkState.title;
  }

  const backgroundSelect = document.getElementById("bookmarkBackgroundSelect");
  if (backgroundSelect) {
    const options = Array.from(backgroundSelect.options || []);
    const optionValues = options
      .map((option) => (typeof option.value === "string" ? option.value.trim().toLowerCase() : ""))
      .filter(Boolean);
    const fallbackColor = optionValues.length > 0 ? resolveBookmarkBackgroundColor(optionValues[0]) : "#ffffff";
    const selectableColor = optionValues.includes(pageBackground) ? pageBackground : fallbackColor;

    if (backgroundSelect.value !== selectableColor) {
      backgroundSelect.value = selectableColor;
    }

    if (bookmarkState.backgroundColor !== selectableColor) {
      bookmarkState.backgroundColor = selectableColor;
    }

    pageBackground = selectableColor;
  }

  const coverPreview = document.getElementById("bookmarkCoverPreview");
  if (coverPreview) {
    coverPreview.innerHTML = "";
    if (bookmarkState.coverImage) {
      const img = document.createElement("img");
      img.src = bookmarkState.coverImage;
      img.alt = "Cover preview";
      coverPreview.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "bookmark-cover-placeholder";
      placeholder.textContent = "No cover image";
      coverPreview.appendChild(placeholder);
    }
  }

  pagesContainer.innerHTML = "";

  const coverPage = document.createElement("div");
  coverPage.className = "bookmark-page bookmark-cover-page";
  coverPage.style.setProperty("--bookmark-page-bg", pageBackground);
  coverPage.style.backgroundColor = pageBackground;
  const coverInner = document.createElement("div");
  coverInner.className = "bookmark-cover-inner";

  const coverTitle = document.createElement("div");
  coverTitle.className = "bookmark-cover-title";
  coverTitle.textContent = title;
  coverInner.appendChild(coverTitle);

  if (bookmarkState.coverImage) {
    const coverImage = document.createElement("div");
    coverImage.className = "bookmark-cover-image";
    const img = document.createElement("img");
    img.src = bookmarkState.coverImage;
    img.alt = `${title} cover`;
    coverImage.appendChild(img);
    coverInner.appendChild(coverImage);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "bookmark-cover-placeholder";
    placeholder.textContent = "Add a cover image";
    coverInner.appendChild(placeholder);
  }

  coverPage.appendChild(coverInner);
  pagesContainer.appendChild(coverPage);

  const ideasByDay = new Map();

  appState.ideas.forEach((idea) => {
    if (!idea || !idea.day || idea.day === "0") {
      return;
    }
    if (!ideasByDay.has(idea.day)) {
      ideasByDay.set(idea.day, []);
    }
    ideasByDay.get(idea.day).push(idea);
  });

  const dayKeys = Array.from(ideasByDay.keys()).sort((a, b) => Number(a) - Number(b));

  if (dayKeys.length === 0) {
    const emptyPage = document.createElement("div");
    emptyPage.className = "bookmark-page bookmark-empty-page";
    emptyPage.style.setProperty("--bookmark-page-bg", pageBackground);
    emptyPage.style.backgroundColor = pageBackground;
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "bookmark-empty";
    emptyMessage.textContent = "登録されている場所がありません";
    emptyPage.appendChild(emptyMessage);
    pagesContainer.appendChild(emptyPage);
  } else {
    const typeLabels = {
      food: "Food",
      sightseeing: "Sightseeing",
      hotel: "Stay",
      transport: "Transport",
      default: "Other",
    };

    dayKeys.forEach((dayKey) => {
      const ideas = ideasByDay
        .get(dayKey)
        .slice()
        .sort((a, b) => {
          const aTime = a.startTime || "";
          const bTime = b.startTime || "";
          if (aTime && bTime) return aTime.localeCompare(bTime);
          if (aTime) return -1;
          if (bTime) return 1;
          return (a.title || "").localeCompare(b.title || "");
        });

      const page = document.createElement("div");
      page.className = "bookmark-page bookmark-day-page";
      page.style.setProperty("--bookmark-page-bg", pageBackground);
      page.style.backgroundColor = pageBackground;

      const header = document.createElement("div");
      header.className = "bookmark-day-header";

      const label = document.createElement("div");
      label.className = "bookmark-day-label";
      label.textContent = `Day ${dayKey}`;
      header.appendChild(label);

      const summary = document.createElement("div");
      summary.className = "bookmark-day-summary";
      summary.textContent = `${ideas.length} spot${ideas.length === 1 ? "" : "s"}`;
      header.appendChild(summary);

      page.appendChild(header);

      const timeline = document.createElement("div");
      timeline.className = "bookmark-timeline";

      if (ideas.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "bookmark-empty";
        emptyMessage.textContent = "No spots scheduled for this day.";
        timeline.appendChild(emptyMessage);
      } else {
        ideas.forEach((idea) => {
          const item = document.createElement("div");
          item.className = "bookmark-timeline-item";

          const timeColumn = document.createElement("div");
          timeColumn.className = "bookmark-item-time";

          const startSpan = document.createElement("span");
          startSpan.className = "bookmark-time-start";
          startSpan.textContent = idea.startTime || "--:--";
          timeColumn.appendChild(startSpan);

          if (idea.endTime) {
            const endSpan = document.createElement("span");
            endSpan.className = "bookmark-time-end";
            endSpan.textContent = idea.endTime;
            timeColumn.appendChild(endSpan);
          }

          const body = document.createElement("div");
          body.className = "bookmark-item-body";

          const titleEl = document.createElement("h4");
          titleEl.className = "bookmark-item-title";
          titleEl.textContent = idea.title || "Untitled spot";
          body.appendChild(titleEl);

          if (idea.description) {
            const desc = document.createElement("p");
            desc.className = "bookmark-item-desc";
            appendTextWithLineBreaks(desc, idea.description);
            body.appendChild(desc);
          }

          const metaParts = [];
          const labelText = typeLabels[idea.type] || typeLabels.default;
          if (labelText) {
            metaParts.push(labelText);
          }
          if (idea.duration) {
            metaParts.push(idea.duration);
          }
          if (metaParts.length) {
            const meta = document.createElement("div");
            meta.className = "bookmark-item-meta";
            metaParts.forEach((part) => {
              const span = document.createElement("span");
              span.textContent = part;
              meta.appendChild(span);
            });
            body.appendChild(meta);
          }

          if (idea.photos && idea.photos.length) {
            const photoWrapper = document.createElement("div");
            photoWrapper.className = "bookmark-item-photo";
            const img = document.createElement("img");
            img.src = idea.photos[0];
            img.alt = `${idea.title || "Spot"} photo`;
            photoWrapper.appendChild(img);
            body.appendChild(photoWrapper);
          }

          item.appendChild(timeColumn);
          item.appendChild(body);
          timeline.appendChild(item);
        });
      }

      page.appendChild(timeline);
      pagesContainer.appendChild(page);
    });
  }
}


window.updateBookmark = updateBookmark;

function exportBookmarkToPDF() {
  if (typeof updateBookmark === "function") {
    updateBookmark();
  }

  const pagesContainer = document.getElementById("bookmarkPages");
  if (!pagesContainer) {
    if (typeof showNotification === "function") {
      showNotification("栞のページが見つかりません", "error");
    }
    return;
  }

  const printableRoot = pagesContainer.cloneNode(true);
  const backgroundColor = resolveBookmarkBackgroundColor(appState.bookmark?.backgroundColor);
  printableRoot.querySelectorAll(".bookmark-page").forEach((page) => {
    page.style.setProperty("--bookmark-page-bg", backgroundColor);
    page.style.backgroundColor = backgroundColor;
  });
  const title = (appState.bookmark?.title || "").trim() || "Trip Bookmark";
  const sanitizedTitle = escapeHtml(title);
  const sanitizedBackground = escapeHtml(backgroundColor);

  const printWindow = window.open("", "bookmark-print");
  if (!printWindow) {
    if (typeof showNotification === "function") {
      showNotification("ポップアップがブロックされました。ブラウザの設定を確認してください。", "error");
    }
    return;
  }

  const styles = [
    '* { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; }',
    `html { --bookmark-page-bg: ${sanitizedBackground}; }`,
    `body { background: ${sanitizedBackground}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #2c3e50; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
    '.bookmark-pages { display: flex; flex-direction: column; gap: 16px; padding: 12mm 0; align-items: center; }',
    '.bookmark-page { width: 210mm; min-height: calc(297mm - 30mm); background: var(--bookmark-page-bg, #ffffff); border: 1px solid #e5e7eb; border-radius: 12px; padding: 15mm 18mm; display: flex; flex-direction: column; gap: 24px; box-shadow: none; page-break-after: always; }',
    '.bookmark-page:last-child { page-break-after: auto; }',
    '.bookmark-cover-page { align-items: center; justify-content: center; text-align: center; }',
    '.bookmark-cover-inner { display: flex; flex-direction: column; gap: 24px; width: 100%; align-items: center; }',
    '.bookmark-cover-title { font-size: 32px; font-weight: 600; letter-spacing: 2px; }',
    '.bookmark-cover-image { width: 100%; max-width: 520px; border-radius: 12px; overflow: hidden; }',
    '.bookmark-cover-image img { width: 100%; height: auto; display: block; }',
    '.bookmark-cover-placeholder { width: 100%; max-width: 520px; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; background: #f8fafc; }',
    '.bookmark-day-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #ecf0f1; padding-bottom: 12px; }',
    '.bookmark-day-label { font-size: 22px; font-weight: 600; }',
    '.bookmark-day-summary { font-size: 14px; color: #7f8c8d; }',
    '.bookmark-timeline { display: flex; flex-direction: column; gap: 18px; position: relative; margin-top: 12px; }',
    '.bookmark-timeline::before { content: ""; position: absolute; top: 0; bottom: 0; left: 14px; width: 2px; background: linear-gradient(180deg, #3498db 0%, rgba(52, 152, 219, 0.1) 100%); }',
    '.bookmark-timeline-item { display: flex; gap: 24px; position: relative; padding-left: 36px; }',
    '.bookmark-timeline-item::before { content: ""; position: absolute; left: 7px; top: 8px; width: 14px; height: 14px; background: #3498db; border-radius: 50%; box-shadow: 0 0 0 4px rgba(52, 152, 219, 0.15); }',
    '.bookmark-item-time { min-width: 80px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #7f8c8d; }',
    '.bookmark-time-start { font-weight: 600; color: #2c3e50; }',
    '.bookmark-item-body { background: #f8fafc; border-radius: 10px; padding: 16px 20px; flex: 1; display: flex; flex-direction: column; gap: 10px; border: 1px solid rgba(52, 152, 219, 0.18); }',
    '.bookmark-item-title { font-size: 18px; font-weight: 600; }',
    '.bookmark-item-desc { font-size: 14px; line-height: 1.5; color: #576574; }',
    '.bookmark-item-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; }',
    '.bookmark-item-meta span { background: rgba(52, 152, 219, 0.12); color: #1d6fa5; padding: 4px 10px; border-radius: 999px; }',
    '.bookmark-item-photo { border-radius: 8px; overflow: hidden; margin-top: 6px; }',
    '.bookmark-item-photo img { width: 100%; height: 160px; object-fit: cover; display: block; }',
    '.bookmark-empty { border: 2px dashed #d1d9e6; border-radius: 8px; padding: 40px 20px; text-align: center; color: #95a5a6; font-size: 16px; }',
    '@media print { body { margin: 0; } }',
    '@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
    '@page { size: A4; margin: 0; }'
  ].join('');

  const doc = printWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + sanitizedTitle + '</title><style>' + styles + '</style></head><body style="--bookmark-page-bg: ' + sanitizedBackground + '; background-color: ' + sanitizedBackground + ';">');
  doc.write('<div class="bookmark-pages" style="--bookmark-page-bg: ' + sanitizedBackground + '; background-color: ' + sanitizedBackground + ';">' + printableRoot.innerHTML + '</div>');
  doc.write('<script>window.addEventListener("load", function(){ window.focus(); window.print(); }); window.addEventListener("afterprint", function(){ window.close(); });</script>');
  doc.write('</body></html>');
  doc.close();

  try {
    printWindow.document.documentElement.style.setProperty("--bookmark-page-bg", backgroundColor);
    if (printWindow.document.body) {
      printWindow.document.body.style.backgroundColor = backgroundColor;
    }
  } catch (error) {
    console.warn('Failed to apply print background color:', error);
  }

  printWindow.document.title = ' ';
  if (printWindow.history && typeof printWindow.history.replaceState === "function") {
    try {
      printWindow.history.replaceState({}, '', ' ');
    } catch (error) {
      console.warn('Failed to adjust print window history:', error);
    }
  }

  if (typeof showNotification === "function") {
    showNotification("PDF出力用のプレビューを開きました", "info", 5000);
  }
}

window.exportBookmarkToPDF = exportBookmarkToPDF;



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

  const currentEditingId = getEditingPinId();

  if (currentEditingId) {
    // --- 編集モード ---
    updateStateAndSync(currentState => {
      const newState = JSON.parse(JSON.stringify(currentState));
      
      const pinIndex = newState.pins.findIndex((p) => p.id === currentEditingId);
      if (pinIndex > -1) {
        newState.pins[pinIndex].title = title;
      }

      const ideaIndex = newState.ideas.findIndex((i) => i.id === currentEditingId);
      if (ideaIndex > -1) {
        newState.ideas[ideaIndex] = {
          ...newState.ideas[ideaIndex],
          title,
          description,
          url,
          type: pinType,
          day,
          startTime,
          duration,
          endTime,
          photos,
        };
      }
      return newState;
    });

    showNotification(`「${title}」を更新しました`, "success");
  } else {
    // This block is for creating a new item, but it's triggered from other functions
    // that should be refactored. For now, we leave a warning.
    console.warn("Form submitted without an editing ID. This flow may be deprecated.");
  }

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

const deleteItemBtn = document.getElementById("deleteItemBtn");
if (deleteItemBtn) {
  deleteItemBtn.addEventListener("click", handleDeleteCurrentIdea);
}

function handleDeleteCurrentIdea() {
  const currentEditingId = getEditingPinId();
  if (!currentEditingId) {
    if (typeof showNotification === "function") {
      showNotification("\u524a\u9664\u3067\u304d\u308b\u30b9\u30dd\u30c3\u30c8\u304c\u3042\u308a\u307e\u305b\u3093", "warning");
    }
    return;
  }

  const pin = appState.pins.find((p) => p.id === currentEditingId);
  const idea = appState.ideas.find((i) => i.id === currentEditingId);
  const title = (idea && idea.title) || (pin && pin.title) || "\u30b9\u30dd\u30c3\u30c8";
  const confirmationMessage = "\u300c" + title + "\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f";

  if (!confirm(confirmationMessage)) {
    return;
  }

  const pinData = pin || { id: currentEditingId, title };
  deletePinAndIdea(pinData);
  closeModal();
}

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
  setEditingPinId(pinData.id);
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
    document.getElementById("itemDay").value = idea.day || "1";

    // 写真データを一時配列にコピー
    currentEditingPhotos = idea.photos ? [...idea.photos] : [];
  }

  // 写真プレビューをレンダリング
  renderPhotoPreviews();

  openModal();
}

function openEditModalForIdea(ideaId) {
  const idea = appState.ideas.find((i) => i.id === ideaId);
  if (!idea) {
    console.warn(`Idea not found for id: ${ideaId}`);
    return;
  }

  const pin = appState.pins.find((p) => p.id === ideaId);
  const pinData = pin
    ? { ...pin, title: idea.title || pin.title }
    : { id: idea.id, title: idea.title || "" };

  if (typeof window.selectedPlace !== "undefined") {
    window.selectedPlace = null;
  }

  openEditModalForPin(pinData);
}

function createPinAndIdeaFromPlace(place) {
  const newId = Date.now();

  updateStateAndSync(currentState => {
    const newState = JSON.parse(JSON.stringify(currentState));

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
      description: place.formatted_address || "",
      type: "sightseeing", // デフォルトのタイプ
      day: "1", // デフォルトは1日目
      photos: (place.photos || []).map(p => p.getUrl({ maxWidth: 800, maxHeight: 800 })),
      url: place.website || "",
    };

    newState.pins.push(pinData);
    newState.ideas.push(ideaData);
    
    return newState;
  });

  if (typeof openEditModalForPin === "function") {
    // We need to find the pinData in the new state, but the ID is sufficient
    openEditModalForPin({ id: newId, title: place.name });
  }

  showNotification(
    `「${place.name}」をマップとアイデアに追加しました。クリックして詳細を編集できます。`,
    "success",
    5000
  );
}
window.createPinAndIdeaFromPlace = createPinAndIdeaFromPlace;

function deletePinAndIdea(pinData) {
  updateStateAndSync(currentState => {
    const newState = JSON.parse(JSON.stringify(currentState));
    
    // appState.pinsから削除
    const pinIndex = newState.pins.findIndex((p) => p.id === pinData.id);
    if (pinIndex > -1) {
      newState.pins.splice(pinIndex, 1);
    }

    // appState.ideasから削除
    const ideaIndex = newState.ideas.findIndex((i) => i.id === pinData.id);
    if (ideaIndex > -1) {
      newState.ideas.splice(ideaIndex, 1);
    }

    return newState;
  });

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
    day: "1",
    photos: [],
  };

  updateStateAndSync(currentState => {
    const newState = JSON.parse(JSON.stringify(currentState));
    newState.pins.push(pinData);
    newState.ideas.push(ideaData);
    return newState;
  });

  // すぐに編集モーダルを開く
  openEditModalForPin(pinData);
}
window.createPinAndIdeaFromLatLng = createPinAndIdeaFromLatLng;
window.openEditModalForIdea = openEditModalForIdea;

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

function updateDayOptions() {
  const daySelect = document.getElementById("itemDay");
  if (!daySelect) return;

  const selectedValue = daySelect.value;

  Array.from(daySelect.options).forEach(option => {
    if (option.value !== "0") {
      option.remove();
    }
  });

  appState.days.forEach(day => {
    const option = document.createElement("option");
    option.value = day.id;
    option.textContent = day.name;
    daySelect.appendChild(option);
  });

  if (Array.from(daySelect.options).some(opt => opt.value === selectedValue)) {
    daySelect.value = selectedValue;
  } else {
    daySelect.value = "0";
  }
}

function renderDayTabs() {
  const dayTabsContainer = document.querySelector(".day-tabs");
  if (!dayTabsContainer) return;

  // 動的に生成されたタブのみをクリア（staticクラスを持つものは除く）
  dayTabsContainer.querySelectorAll(".day-tab:not(.static)").forEach(tab => tab.remove());

  const addDayBtn = document.getElementById("addDayBtn");

  // appState.daysからタブを生成
  appState.days.forEach(day => {
    const tab = document.createElement("button");
    tab.className = "day-tab";
    tab.textContent = day.name;
    tab.dataset.dayId = day.id;

    // 削除ボタンを追加
    const deleteBtn = document.createElement("span");
    deleteBtn.className = "delete-day-btn";
    deleteBtn.textContent = "×";
    deleteBtn.dataset.dayId = day.id;
    tab.appendChild(deleteBtn);

    dayTabsContainer.insertBefore(tab, addDayBtn);
  });
}

// タブ切り替え機能
document.addEventListener("DOMContentLoaded", function () {
  const dayTabsContainer = document.querySelector(".day-tabs");
  dayTabsContainer.addEventListener("click", function(event) {
    const target = event.target;

    // 削除ボタンのクリック
    if (target.classList.contains("delete-day-btn")) {
      event.stopPropagation(); // タブ自体のクリックイベントを発火させない
      const dayIdToDelete = parseInt(target.dataset.dayId, 10);
      const dayName = appState.days.find(d => d.id === dayIdToDelete)?.name || "この日";
      if (confirm(`${dayName}を削除しますか？ 関連する予定は「未定」に移動します。`)) {
        
        updateStateAndSync(currentState => {
          const newState = JSON.parse(JSON.stringify(currentState));
          // 該当する日のアイデアを「未定」に移動
          newState.ideas.forEach(idea => {
            if (idea.day == dayIdToDelete) {
              idea.day = "0";
            }
          });
          // appState.daysから削除
          newState.days = newState.days.filter(day => day.id !== dayIdToDelete);
          return newState;
        });

        // UIを更新
        filterPinsByDay("未定"); // 未定タブをアクティブにする
        document.querySelector(".day-tab.static[data-day-id=\"0\"]")?.classList.add("active");

        showNotification("日程を削除しました", "success");
      }
      return;
    }

    // 日程タブのクリック
    if (target.classList.contains("day-tab") && !target.classList.contains("day-tab-add")) {
      dayTabsContainer.querySelectorAll(".day-tab").forEach(t => t.classList.remove("active"));
      target.classList.add("active");
      const day = target.textContent;
      filterPinsByDay(day);
      showNotification(`${day}の予定を表示中`, "info");
    }

    // 日程追加ボタンのクリック
    if (target.id === "addDayBtn") {
      updateStateAndSync(currentState => {
        const newState = JSON.parse(JSON.stringify(currentState));
        const nextDayNum = newState.days.length > 0 ? Math.max(...newState.days.map(d => d.id)) + 1 : 1;
        const newDay = { id: nextDayNum, name: `${nextDayNum}日目` };
        newState.days.push(newDay);
        return newState;
      });
      // The UI will be updated by renderUIFromState, so no need to call showNotification here
      // as the visual change is the notification.
    }
  });

  renderDayTabs(); // 初期タブを描画
  updateDayOptions(); // 初期オプションを描画

  const bookmarkTitleInput = document.getElementById("bookmarkTitleInput");
  const bookmarkCoverInput = document.getElementById("bookmarkCoverInput");
  const bookmarkCoverClearBtn = document.getElementById("bookmarkCoverClearBtn");
  const bookmarkExportBtn = document.getElementById("bookmarkExportBtn");
  const bookmarkBackgroundSelect = document.getElementById("bookmarkBackgroundSelect");

  if (bookmarkTitleInput) {
    bookmarkTitleInput.addEventListener("input", (event) => {
      const newTitle = event.target.value;
      updateStateAndSync(currentState => {
        const newState = JSON.parse(JSON.stringify(currentState));
        if (!newState.bookmark) newState.bookmark = {};
        newState.bookmark.title = newTitle;
        return newState;
      });
    });
  }

  if (bookmarkBackgroundSelect) {
    bookmarkBackgroundSelect.addEventListener("change", (event) => {
      const newColor = event.target.value;
      updateStateAndSync(currentState => {
        const newState = JSON.parse(JSON.stringify(currentState));
        if (!newState.bookmark) newState.bookmark = {};
        newState.bookmark.backgroundColor = newColor;
        return newState;
      });
    });
  }

  if (bookmarkCoverInput) {
    bookmarkCoverInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const newCoverImage = loadEvent.target?.result;
        if (newCoverImage) {
          updateStateAndSync(currentState => {
            const newState = JSON.parse(JSON.stringify(currentState));
            if (!newState.bookmark) newState.bookmark = {};
            newState.bookmark.coverImage = newCoverImage;
            return newState;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (bookmarkCoverClearBtn) {
    bookmarkCoverClearBtn.addEventListener("click", () => {
      if (bookmarkCoverInput) {
        bookmarkCoverInput.value = "";
      }
      updateStateAndSync(currentState => {
        const newState = JSON.parse(JSON.stringify(currentState));
        if (newState.bookmark) {
          newState.bookmark.coverImage = null;
        }
        return newState;
      });
    });
  }

  if (bookmarkExportBtn) {
    bookmarkExportBtn.addEventListener("click", () => {
      exportBookmarkToPDF();
    });
  }

  if (typeof updateBookmark === "function") {
    updateBookmark();
  }
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
  console.log(`--- Filtering for: ${day} ---`);
  const trimmedDay = day.trim();

  // Log initial state
  console.log(
    "Initial appState.ideas:",
    JSON.parse(JSON.stringify(appState.ideas))
  );
  console.log(
    "Initial appState.pins:",
    JSON.parse(JSON.stringify(appState.pins))
  );

  let ideasToShow;

  if (trimmedDay.includes("全日程")) {
    console.log("Case: 'すべて' (All)");
    ideasToShow = appState.ideas;
  } else if (trimmedDay === "未定") {
    console.log("Case: '未定' (Undecided)");
    ideasToShow = appState.ideas.filter((idea) => idea.day === "0");
  } else {
    console.log(`Case: Day number`);
    const dayNumberMatch = trimmedDay.match(/\d+/);
    if (dayNumberMatch) {
      const targetDay = dayNumberMatch[0];
      console.log(`Target day number: ${targetDay}`);
      ideasToShow = appState.ideas.filter((idea) => idea.day === targetDay);
    } else {
      console.log("Fallback: No day number found, showing nothing.");
      ideasToShow = [];
    }
  }

  console.log("ideasToShow:", JSON.parse(JSON.stringify(ideasToShow)));

  const ideaIdsToShow = new Set(ideasToShow.map((idea) => idea.id));
  const pinsToShow = appState.pins.filter((pin) => ideaIdsToShow.has(pin.id));

  console.log("ideaIdsToShow:", Array.from(ideaIdsToShow));
  console.log("pinsToShow:", JSON.parse(JSON.stringify(pinsToShow)));

  // Re-render idea cards
  const ideaBoard = document.getElementById("ideaBoard");
  if (ideaBoard) {
    console.log("Clearing ideaBoard.");
    ideaBoard.innerHTML = ""; // Clear the board
    console.log(`Rendering ${ideasToShow.length} idea cards.`);
    ideasToShow.forEach((idea) => {
      if (typeof window.renderIdeaCard === "function") {
        window.renderIdeaCard(idea);
      }
    });
  }

  // Re-render map markers
  if (typeof window.renderAllMarkers === "function") {
    console.log(`Rendering ${pinsToShow.length} map markers.`);
    window.renderAllMarkers(pinsToShow);
  }

  // Re-render flowchart/timeline
  if (typeof window.updateFlowchart === "function") {
    console.log(`Updating flowchart.`);
    window.updateFlowchart();
  }
  if (typeof window.updateIdeaBoardEmptyState === "function") {
    window.updateIdeaBoardEmptyState();
  }
  console.log("--- Filtering complete ---");
}

console.log("🗺️ 旅行プランナーを初期化しています...");
console.log("Discord Activity として動作可能です");
