/**
 * 부동산 매물 정리 앱
 * - Firebase Firestore 연동
 * - 일반 모드 / 수정 모드
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// ===== Firebase 설정 =====
const firebaseConfig = {
  apiKey: "AIzaSyBbAIbD3TTQ-TpVUHf4OvmnSCQDSDQQRnE",
  authDomain: "house-3ec03.firebaseapp.com",
  projectId: "house-3ec03",
  storageBucket: "house-3ec03.firebasestorage.app",
  messagingSenderId: "27547441666",
  appId: "1:27547441666:web:501fee485f6c8bc51ee51b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const PROPERTIES_COLLECTION = "properties";

// ===== DOM 요소 =====
const propertyListEl = document.getElementById("propertyList");
const propertyCardsEl = document.getElementById("propertyCards");
const btnAddEl = document.getElementById("btnAdd");

// ===== 수정 모드 상태 =====
const editingRowIds = new Set();
const expandedRowIds = new Set();
let currentProperties = [];

// ===== 렌더링 =====
const COLUMN_COUNT = 11;

// 체크리스트 항목 정의
const CHECKLIST_ITEMS = [
  { key: "집층수", label: "집 층수", type: "select", options: ["", "반지하", "n층", "옥탑"] },
  { key: "보안시설", label: "보안시설", type: "select", options: ["", "도어락", "공동현관", "없음"] },
  { key: "반려동물", label: "반려동물 불가", type: "checkbox" },
  { key: "수도확인수도", label: "수도확인-수도", type: "checkbox" },
  { key: "수도확인하수도", label: "수도확인-하수도", type: "checkbox" },
  { key: "전기스위치", label: "전기 - 스위치", type: "checkbox" },
  { key: "전기화장실콘센트", label: "전기 - 화장실 콘센트", type: "checkbox" },
  { key: "전기콘센트개수", label: "전기 - 콘센트 개수", type: "checkbox" },
  { key: "가스가스레인지", label: "가스 - 가스레인지/인덕션", type: "checkbox" },
  { key: "가스난방", label: "가스 - 개별난방/중앙난방", type: "checkbox" },
  { key: "관리비포함", label: "관리비 - 포함 항목 작성", type: "checkbox" },
];

function ensureUrlProtocol(url) {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

function renderAddressView(text, link) {
  const t = escapeHtml(text || "");
  const l = (link || "").trim();
  const href = l ? ensureUrlProtocol(l) : "";
  if (href) {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="address-link">${t || "(주소)"}</a>`;
  }
  return `<span class="address-text">${t || "-"}</span>`;
}

function getChecklistValue(property, key) {
  const c = property.체크리스트 || {};
  return c[key] ?? "";
}

function getChecklistBool(property, key) {
  const c = property.체크리스트 || {};
  return !!c[key];
}

function get특이사항List(property) {
  const c = property.체크리스트 || {};
  const arr = c.특이사항;
  return Array.isArray(arr) ? [...arr] : [];
}

function renderChecklist(property) {
  const c = property.체크리스트 || {};
  let html = `<div class="checklist" data-id="${property.id}">`;

  CHECKLIST_ITEMS.forEach((item) => {
    const val = getChecklistValue(property, item.key);
    const checked = getChecklistBool(property, item.key);
    if (item.type === "select") {
      const opts = item.options
        .map((o) => `<option value="${escapeHtml(o)}" ${val === o ? "selected" : ""}>${o ? o : "선택"}</option>`)
        .join("");
      html += `
        <div class="checklist-row">
          <label class="checklist-label">${item.label}</label>
          <select class="checklist-input checklist-select" data-checklist="${item.key}">${opts}</select>
        </div>`;
    } else if (item.type === "checkbox") {
      html += `
        <div class="checklist-row">
          <label class="checklist-label">${item.label}</label>
          <input type="checkbox" class="checklist-input checklist-checkbox" data-checklist="${item.key}" ${checked ? "checked" : ""}>
        </div>`;
    }
  });

  const 특이사항List = get특이사항List(property);
  html += `
    <div class="checklist-row checklist-row-special">
      <label class="checklist-label">특이사항</label>
      <div class="checklist-special-list">
        ${특이사항List.map((t, i) => `<div class="checklist-special-item"><input type="text" data-checklist="특이사항" data-index="${i}" value="${escapeHtml(t)}"><button type="button" class="btn-remove-special" data-index="${i}">삭제</button></div>`).join("")}
        <button type="button" class="btn-add-special">+ 추가</button>
      </div>
    </div>`;

  html += "</div>";
  return html;
}

function renderAddressEdit(text, link, textField, linkField) {
  const t = escapeHtml(text || "");
  const l = escapeHtml((link || "").trim());
  return `
    <span class="address-edit-inline">
      <input type="text" data-field="${textField}" placeholder="주소" value="${t}">
      <input type="text" data-field="${linkField}" placeholder="링크 URL" value="${l}" class="input-link">
    </span>
  `;
}

function renderProperty(property, isEditMode) {
  const fragment = document.createDocumentFragment();

  const tr = document.createElement("tr");
  tr.className = "row-main";
  tr.dataset.id = property.id;
  if (isEditMode) tr.classList.add("row-edit-mode");

  if (isEditMode) {
    tr.innerHTML = `
      <td class="td-drag">
        <span class="drag-handle" data-id="${property.id}" draggable="true" title="꾹 눌러 순서 변경">⋮⋮</span>
        <button type="button" class="btn-expand" data-id="${property.id}" aria-label="펼치기"></button>
      </td>
      <td><input type="text" value="${escapeHtml(property.부동산)}" data-field="부동산" placeholder="부동산명"></td>
      <td class="address-cell">${renderAddressEdit(property.부동산주소, property.부동산주소링크, "부동산주소", "부동산주소링크")}</td>
      <td class="address-cell">${renderAddressEdit(property.집주소, property.집주소링크, "집주소", "집주소링크")}</td>
      <td><input type="text" value="${escapeHtml(property.약속날짜시간)}" data-field="약속날짜시간" placeholder="월/일 시:분"></td>
      <td>
        <select data-field="약속장소">
          <option value="">선택</option>
          <option value="부동산" ${property.약속장소 === "부동산" ? "selected" : ""}>부동산</option>
          <option value="집" ${property.약속장소 === "집" ? "selected" : ""}>집</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(property.보증금)}" data-field="보증금" placeholder="만원"></td>
      <td><input type="text" value="${escapeHtml(property.월세관리비)}" data-field="월세관리비" placeholder="월세/관리비"></td>
      <td><input type="checkbox" ${property.집확인 ? "checked" : ""} data-field="집확인"></td>
      <td><input type="text" value="${escapeHtml(property.입주가능날짜)}" data-field="입주가능날짜" placeholder="월/일"></td>
      <td class="td-actions">
        <button type="button" class="btn-save" data-id="${property.id}">저장</button>
        <button type="button" class="btn-delete" data-id="${property.id}">삭제</button>
      </td>
    `;
  } else {
    tr.innerHTML = `
      <td class="td-drag">
        <span class="drag-handle" data-id="${property.id}" draggable="true" title="꾹 눌러 순서 변경">⋮⋮</span>
        <button type="button" class="btn-expand" data-id="${property.id}" aria-label="펼치기"></button>
      </td>
      <td><span class="cell-text">${escapeHtml(property.부동산) || "-"}</span></td>
      <td class="address-cell">${renderAddressView(property.부동산주소, property.부동산주소링크)}</td>
      <td class="address-cell">${renderAddressView(property.집주소, property.집주소링크)}</td>
      <td><span class="cell-text">${escapeHtml(property.약속날짜시간) || "-"}</span></td>
      <td><span class="cell-text">${escapeHtml(property.약속장소) || "-"}</span></td>
      <td><span class="cell-text">${escapeHtml(property.보증금) || "-"}</span></td>
      <td><span class="cell-text">${escapeHtml(property.월세관리비) || "-"}</span></td>
      <td><span class="cell-text">${property.집확인 ? "✓" : "-"}</span></td>
      <td><span class="cell-text">${escapeHtml(property.입주가능날짜) || "-"}</span></td>
      <td class="td-actions">
        <button type="button" class="btn-edit" data-id="${property.id}">수정</button>
      </td>
    `;
  }

  const trExpand = document.createElement("tr");
  trExpand.className = "row-expand";
  trExpand.dataset.id = property.id;
  trExpand.innerHTML = `
    <td colspan="${COLUMN_COUNT}" class="td-expand-content">
      <div class="expand-content">${renderChecklist(property)}</div>
    </td>
  `;

  fragment.appendChild(tr);
  fragment.appendChild(trExpand);

  return fragment;
}

function renderPropertyCard(property, isEditMode) {
  const card = document.createElement("div");
  card.className = "property-card";
  card.dataset.id = property.id;
  if (isEditMode) card.classList.add("card-edit-mode");

  const cardBodyRows = [
    { label: "부동산", key: "부동산", type: "text" },
    { label: "부동산주소", key: "부동산주소", linkKey: "부동산주소링크", type: "address" },
    { label: "집주소", key: "집주소", linkKey: "집주소링크", type: "address" },
    { label: "약속날짜/시간", key: "약속날짜시간", type: "text" },
    { label: "약속장소", key: "약속장소", type: "text" },
    { label: "보증금", key: "보증금", type: "text" },
    { label: "월세/관리비", key: "월세관리비", type: "text", bold: true },
    { label: "집확인", key: "집확인", type: "checkbox" },
    { label: "입주가능날짜", key: "입주가능날짜", type: "text" },
  ];

  let bodyHtml = "";
  cardBodyRows.forEach((row) => {
    if (row.type === "address") {
      const val = isEditMode
        ? renderAddressEdit(property[row.key], property[row.linkKey], row.key, row.linkKey)
        : renderAddressView(property[row.key], property[row.linkKey]);
      bodyHtml += `<div class="card-row"><span class="card-label">${row.label}</span><span class="card-value">${val}</span></div>`;
    } else if (row.type === "checkbox") {
      const val = isEditMode
        ? `<input type="checkbox" data-field="${row.key}" ${property[row.key] ? "checked" : ""}>`
        : (property[row.key] ? "✓" : "-");
      bodyHtml += `<div class="card-row"><span class="card-label">${row.label}</span><span class="card-value">${val}</span></div>`;
    } else if (row.key === "약속장소") {
      const val = isEditMode
        ? `<select data-field="${row.key}"><option value="">선택</option><option value="부동산" ${property[row.key] === "부동산" ? "selected" : ""}>부동산</option><option value="집" ${property[row.key] === "집" ? "selected" : ""}>집</option></select>`
        : (escapeHtml(property[row.key]) || "-");
      bodyHtml += `<div class="card-row"><span class="card-label">${row.label}</span><span class="card-value">${val}</span></div>`;
    } else {
      const val = isEditMode
        ? `<input type="text" data-field="${row.key}" value="${escapeHtml(property[row.key] || "")}" placeholder="">`
        : (escapeHtml(property[row.key]) || "-");
      const rowClass = row.bold ? "card-row card-row-bold" : "card-row";
      bodyHtml += `<div class="${rowClass}"><span class="card-label">${row.label}</span><span class="card-value">${val}</span></div>`;
    }
  });

  const actionsHtml = isEditMode
    ? `<button type="button" class="btn-save" data-id="${property.id}">저장</button><button type="button" class="btn-delete" data-id="${property.id}">삭제</button>`
    : `<button type="button" class="btn-edit" data-id="${property.id}">수정</button>`;

  card.innerHTML = `
    <div class="card-main">
      <div class="card-drag-handle" data-id="${property.id}" draggable="true" title="꾹 눌러 순서 변경">⋮⋮</div>
      <div class="card-body">${bodyHtml}</div>
      <div class="card-footer">
        <button type="button" class="btn-expand btn-expand-card" data-id="${property.id}" aria-label="펼치기"></button>
        <div class="card-footer-actions">${actionsHtml}</div>
      </div>
    </div>
    <div class="card-expand" data-id="${property.id}">
      <div class="expand-content">${renderChecklist(property)}</div>
    </div>
  `;

  return card;
}

function escapeHtml(text) {
  if (text == null || text === "") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderAll(properties) {
  currentProperties = properties;
  propertyListEl.innerHTML = "";
  if (propertyCardsEl) propertyCardsEl.innerHTML = "";
  properties.forEach((p) => {
    const isEditMode = editingRowIds.has(p.id);
    const fragment = renderProperty(p, isEditMode);
    propertyListEl.appendChild(fragment);
    if (propertyCardsEl) {
      const card = renderPropertyCard(p, isEditMode);
      propertyCardsEl.appendChild(card);
    }
  });
  attachEventListeners();
}

// ===== Firestore 연동 =====
function syncFieldToFirestore(id, field, value) {
  updateDoc(doc(db, PROPERTIES_COLLECTION, id), { [field]: value }).catch(
    (err) => console.error("Firestore 업데이트 실패:", err)
  );
}

function syncChecklistToFirestore(id, key, value) {
  updateDoc(doc(db, PROPERTIES_COLLECTION, id), {
    [`체크리스트.${key}`]: value,
  }).catch((err) => console.error("체크리스트 업데이트 실패:", err));
}

function sync특이사항ToFirestore(id, arr) {
  updateDoc(doc(db, PROPERTIES_COLLECTION, id), {
    "체크리스트.특이사항": arr,
  }).catch((err) => console.error("특이사항 업데이트 실패:", err));
}

// ===== 이벤트 =====
let draggedId = null;

function attachEventListeners() {
  // 드래그 앤 드롭 (순서 변경)
  document.querySelectorAll(".drag-handle, .card-drag-handle").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      draggedId = e.target.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
      e.target.closest(".row-main, .property-card")?.classList.add("dragging");
    });
    handle.addEventListener("dragend", (e) => {
      e.target.closest(".row-main, .property-card")?.classList.remove("dragging");
      draggedId = null;
    });
  });

  document.querySelectorAll(".row-main, .property-card").forEach((el) => {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedId && el.dataset.id !== draggedId) {
        el.classList.add("drag-over");
      }
    });
    el.addEventListener("dragleave", (e) => {
      el.classList.remove("drag-over");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const toId = el.dataset.id;
      if (draggedId && toId && draggedId !== toId) {
        reorderProperties(draggedId, toId);
      }
    });
  });

  // 삼각형 버튼 클릭 → 행/카드 밑 칸 펼치기/접기
  document.querySelectorAll(".btn-expand").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const expandRow = document.querySelector(`.row-expand[data-id="${id}"]`);
      const expandCard = document.querySelector(`.card-expand[data-id="${id}"]`);

      if (expandRow) expandRow.classList.toggle("is-open");
      if (expandCard) expandCard.classList.toggle("is-open");
      btn.classList.toggle("is-open");

      if (expandRow?.classList.contains("is-open") || expandCard?.classList.contains("is-open")) {
        expandedRowIds.add(id);
      } else {
        expandedRowIds.delete(id);
      }
    });
  });

  // 펼침 상태 복원
  expandedRowIds.forEach((id) => {
    const expandRow = document.querySelector(`.row-expand[data-id="${id}"]`);
    const expandCard = document.querySelector(`.card-expand[data-id="${id}"]`);
    const btn = document.querySelector(`.btn-expand[data-id="${id}"]`);
    if (expandRow) expandRow.classList.add("is-open");
    if (expandCard) expandCard.classList.add("is-open");
    if (btn) btn.classList.add("is-open");
  });

  // 수정 버튼 클릭 → 수정 모드 진입
  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-edit")) return;
    const id = e.target.dataset.id;
    if (!id) return;
    editingRowIds.add(id);
    renderAll(currentProperties);
  });

  // 저장 버튼 클릭 → 수정 모드 종료
  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-save")) return;
    const id = e.target.dataset.id;
    if (!id) return;

    const row = e.target.closest(".row-main");
    const card = e.target.closest(".property-card");
    const container = row || card;
    if (container) {
      const updates = {};
      container.querySelectorAll("[data-field]").forEach((el) => {
        const field = el.dataset.field;
        if (!field) return;
        updates[field] = el.type === "checkbox" ? el.checked : el.value;
      });
      if (Object.keys(updates).length > 0) {
        updateDoc(doc(db, PROPERTIES_COLLECTION, id), updates).catch((err) =>
          console.error("Firestore 업데이트 실패:", err)
        );
        currentProperties = currentProperties.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        );
      }
    }

    editingRowIds.delete(id);
    renderAll(currentProperties);
  });

  // 삭제 버튼 클릭
  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-delete")) return;
    const id = e.target.dataset.id;
    if (!id) return;
    if (!confirm("이 매물을 삭제하시겠습니까?")) return;

    editingRowIds.delete(id);
    deleteDoc(doc(db, PROPERTIES_COLLECTION, id)).catch((err) =>
      console.error("매물 삭제 실패:", err)
    );
  });

  // 수정 모드: 입력값 변경 시 Firestore에 반영
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.dataset.field) return;
    const row = el.closest(".row-main");
    const card = el.closest(".property-card");
    const container = row || card;
    if (!container || (!container.classList.contains("row-edit-mode") && !container.classList.contains("card-edit-mode"))) return;

    const id = container.dataset.id;
    const field = el.dataset.field;
    const value = el.type === "checkbox" ? el.checked : el.value;

    syncFieldToFirestore(id, field, value);
  });

  document.addEventListener("blur", (e) => {
    const el = e.target;
    if (!el.dataset.field || el.tagName !== "INPUT") return;
    if (el.type === "checkbox") return;

    const row = el.closest(".row-main");
    const card = el.closest(".property-card");
    const container = row || card;
    if (!container || (!container.classList.contains("row-edit-mode") && !container.classList.contains("card-edit-mode"))) return;

    const id = container.dataset.id;
    const field = el.dataset.field;
    const value = el.value;

    syncFieldToFirestore(id, field, value);
  });

  // 체크리스트 변경 시 Firestore 반영 (select, checkbox)
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.classList.contains("checklist-input")) return;
    const checklist = el.closest(".checklist");
    if (!checklist) return;
    const id = checklist.dataset.id;
    const key = el.dataset.checklist;
    if (!id || !key || key === "특이사항") return;
    const value = el.type === "checkbox" ? el.checked : el.value;
    syncChecklistToFirestore(id, key, value);
  });

  document.addEventListener("blur", (e) => {
    const el = e.target;
    if (!el.classList.contains("checklist-input") || el.tagName !== "INPUT") return;
    if (el.type === "checkbox") return;
    const checklist = el.closest(".checklist");
    if (!checklist) return;
    const id = checklist.dataset.id;
    const key = el.dataset.checklist;
    if (!id || !key) return;

    if (key === "특이사항") {
      const index = parseInt(el.dataset.index, 10);
      const prop = currentProperties.find((p) => p.id === id);
      const arr = get특이사항List(prop || {});
      arr[index] = el.value;
      sync특이사항ToFirestore(id, arr);
    } else {
      syncChecklistToFirestore(id, key, el.value);
    }
  });

  // 특이사항 추가 버튼
  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-add-special")) return;
    const checklist = e.target.closest(".checklist");
    if (!checklist) return;
    const id = checklist.dataset.id;
    const prop = currentProperties.find((p) => p.id === id);
    const arr = get특이사항List(prop || {});
    arr.push("");
    sync특이사항ToFirestore(id, arr);
  });

  // 특이사항 삭제 버튼
  document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-remove-special")) return;
    const item = e.target.closest(".checklist-special-item");
    if (!item) return;
    const checklist = item.closest(".checklist");
    if (!checklist) return;
    const id = checklist.dataset.id;
    const index = parseInt(e.target.dataset.index, 10);
    const prop = currentProperties.find((p) => p.id === id);
    const arr = get특이사항List(prop || {}).filter((_, i) => i !== index);
    sync특이사항ToFirestore(id, arr);
  });

  // 매물 추가
  if (btnAddEl) {
    btnAddEl.onclick = async () => {
      try {
        const newOrder = currentProperties.length > 0
          ? Math.max(...currentProperties.map((p) => p.order ?? 0)) + 1
          : 0;
        const ref = await addDoc(collection(db, PROPERTIES_COLLECTION), {
          부동산: "",
          부동산주소: "",
          부동산주소링크: "",
          집주소: "",
          집주소링크: "",
          약속날짜시간: "",
          약속장소: "",
          보증금: "",
          월세관리비: "",
          집확인: false,
          입주가능날짜: "",
          체크리스트: { 특이사항: [] },
          order: newOrder,
        });
        const newProperty = {
          id: ref.id,
          부동산: "",
          부동산주소: "",
          부동산주소링크: "",
          집주소: "",
          집주소링크: "",
          약속날짜시간: "",
          약속장소: "",
          보증금: "",
          월세관리비: "",
          집확인: false,
          입주가능날짜: "",
          체크리스트: { 특이사항: [] },
          order: newOrder,
        };
        editingRowIds.add(ref.id);
        currentProperties = [...currentProperties, newProperty];
        renderAll(currentProperties);
      } catch (err) {
        console.error("매물 추가 실패:", err);
      }
    };
  }
}

// ===== 순서 변경 =====
function applyOrderAndSort(properties) {
  return properties
    .map((p, i) => ({ ...p, order: p.order ?? i }))
    .sort((a, b) => a.order - b.order);
}

function reorderProperties(fromId, toId) {
  const fromIdx = currentProperties.findIndex((p) => p.id === fromId);
  const toIdx = currentProperties.findIndex((p) => p.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  const arr = [...currentProperties];
  const [removed] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, removed);

  arr.forEach((p, i) => {
    if (p.order !== i) {
      updateDoc(doc(db, PROPERTIES_COLLECTION, p.id), { order: i }).catch((err) =>
        console.error("순서 업데이트 실패:", err)
      );
    }
  });

  currentProperties = arr.map((p, i) => ({ ...p, order: i }));
  renderAll(currentProperties);
}

// ===== Firestore 실시간 리스너 =====
onSnapshot(collection(db, PROPERTIES_COLLECTION), (snapshot) => {
  const properties = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  currentProperties = applyOrderAndSort(properties);
  renderAll(currentProperties);
});
