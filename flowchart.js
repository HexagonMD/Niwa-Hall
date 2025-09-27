function updateFlowchart() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = ""; // タイムラインをクリア

  const timedIdeas = appState.ideas
    .filter((idea) => idea.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  timedIdeas.forEach((idea) => {
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
