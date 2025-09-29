// ドラッグ&ドロップの実装
let draggedElement = null;

document.addEventListener("DOMContentLoaded", function () {
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

document.addEventListener("DOMContentLoaded", () => {
  function showNotification(message, type = "info", duration = 3000) {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, duration);

    return notification;
  }

  function openModal() {
    const modal = document.getElementById("modal");
    if (modal) {
      modal.classList.add("active");
    }
  }

  function closeModal() {
    const modal = document.getElementById("modal");
    if (modal) {
      modal.classList.remove("active");
    }
    const addForm = document.getElementById("addForm");
    if (addForm) {
      addForm.reset();
    }
    const locationInput = document.getElementById("itemLocation");
    if (locationInput) {
      locationInput.value = "";
    }
    if (typeof window.selectedPlace !== "undefined") {
      window.selectedPlace = null;
    }
    if (typeof window.editingPinId !== "undefined") {
      window.editingPinId = null; // 編集状態をリセット
    }
    if (typeof window.currentEditingPhotos !== "undefined") {
      window.currentEditingPhotos = []; // 編集中の写真リストをリセット
    }
  }

  function switchView(viewName) {
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.remove("active");
    });
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.add("active");
    }

    document.querySelectorAll(".nav-button").forEach((btn) => {
      btn.classList.remove("active");
    });
    const activeButton = document.querySelector(`[data-view="${viewName}"]`);
    if (activeButton) {
      activeButton.classList.add("active");
    }

    if (window.appState) {
      window.appState.currentView = viewName;
    }

    if (viewName === "map" && typeof window.initMap === "function") {
      window.initMap();
    }

    if (viewName === "flowchart" && typeof window.updateFlowchart === "function") {
      window.updateFlowchart();
    }
  }

  function updateUserList() {
    if (!window.webRTCManager || !window.webRTCManager.users) {
      return;
    }

    const users = window.webRTCManager.users;
    const userCount = Array.isArray(users) ? users.length : Object.keys(users).length;
    const userCountElement = document.getElementById("userCount");
    const statusIndicator = document.getElementById("statusIndicator");
    const collaborationBtn = document.getElementById("collaborationBtn");
    const leaveBtn = document.getElementById("leaveBtn");

    if (userCountElement) {
      userCountElement.textContent = `${userCount}人がオンライン`;
    }

    if (statusIndicator) {
      statusIndicator.style.background = window.collaborationEnabled ? "#27ae60" : "#e74c3c";
    }

    if (collaborationBtn && leaveBtn) {
      if (window.collaborationEnabled && window.appState?.roomId) {
        collaborationBtn.style.display = "none";
        leaveBtn.style.display = "inline-block";
      } else {
        collaborationBtn.style.display = "inline-block";
        leaveBtn.style.display = "none";
      }
    }

    console.log(`現在の参加者数: ${userCount}人`);
  }

  function renderIdeaCard(ideaData) {
    const ideaBoard = document.getElementById("ideaBoard");
    if (!ideaBoard) {
      console.error("❌ ideaBoard要素が見つかりません");
      return null;
    }

    const typeEmoji = { food: "🍜", sightseeing: "🏔️", hotel: "🏨", transport: "🚗" };
    const typeLabel = { food: "グルメ", sightseeing: "観光", hotel: "宿泊", transport: "交通" };

    let card = ideaBoard.querySelector(`[data-idea-id="${ideaData.id}"]`);
    const isNew = !card;

    if (!card) {
      card = document.createElement("div");
      card.className = "idea-card";
      card.dataset.ideaId = ideaData.id;
    }

    let timeInfoHTML = "";
    if (ideaData.startTime || ideaData.duration || ideaData.endTime) {
      timeInfoHTML = `
            <div class="idea-time-info">
              ${ideaData.startTime ? `<span>開始: ${ideaData.startTime}</span>` : ""}
              ${ideaData.duration ? `<span>所要: ${ideaData.duration}</span>` : ""}
              ${ideaData.endTime ? `<span>終了: ${ideaData.endTime}</span>` : ""}
            </div>
          `;
    }

    let photoHTML = "";
    if (ideaData.photos && ideaData.photos.length > 0) {
      photoHTML = `<div class="idea-photos">`;
      ideaData.photos.forEach((photoSrc) => {
        photoHTML += `<img src="${photoSrc}" alt="idea photo">`;
      });
      photoHTML += `</div>`;
    }

    card.innerHTML = `
          <h3>${typeEmoji[ideaData.type] || "🗓️"} ${ideaData.title}</h3>
          <p>${ideaData.description}</p>
          ${photoHTML}
          ${timeInfoHTML}
          <div class="idea-tags">
            <span class="tag">${typeLabel[ideaData.type] || "その他"}</span>
            ${
              ideaData.day && ideaData.day !== "0"
                ? `<span class="tag">${ideaData.day}日目</span>`
                : ""
            }
          </div>
        `;
    if (isNew) {
      ideaBoard.appendChild(card);
      console.log("✅ アイデアカードを画面に追加しました");
    } else {
      console.log("🔁 アイデアカードを更新しました");
    }
    return card;
  }

  function removeIdeaCard(ideaId) {
    const card = document.querySelector(`[data-idea-id="${ideaId}"]`);
    if (card) {
      card.parentElement.removeChild(card);
      console.log(`✅ アイデアカード(id: ${ideaId})を削除しました`);
    }
  }

  window.showNotification = showNotification;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.switchView = switchView;
  window.updateUserList = updateUserList;
  window.renderIdeaCard = renderIdeaCard;
  window.removeIdeaCard = removeIdeaCard; // 公開

  window.UI = {
    showNotification,
    openModal,
    closeModal,
    switchView,
    updateUserList,
    renderIdeaCard,
    removeIdeaCard,
  };
});
