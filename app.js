/**
 * 부동산 매물 정리 앱
 * - Firebase Firestore 연동
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
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
const btnAddEl = document.getElementById("btnAdd");

// ===== 렌더링 =====
const COLUMN_COUNT = 10; // 삼각형 + 9개 카테고리

function ensureUrlProtocol(url) {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

function renderAddressCell(text, link, textField, linkField) {
  const t = escapeHtml(text || "");
  const l = (link || "").trim();
  const href = l ? ensureUrlProtocol(l) : "";
  const displayContent = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="address-link">${t || "(주소)"}</a>`
    : `<span class="address-text">${t || ""}</span>`;
  return `
    <span class="address-display">
      ${displayContent}
      <button type="button" class="btn-edit-address" aria-label="편집"></button>
    </span>
    <span class="address-edit" style="display:none">
      <input type="text" data-field="${textField}" placeholder="주소" value="${t}">
      <input type="text" data-field="${linkField}" placeholder="링크 URL" value="${escapeHtml(l)}" class="input-link">
    </span>
  `;
}

function renderProperty(property) {
  const fragment = document.createDocumentFragment();

  const tr = document.createElement("tr");
  tr.className = "row-main";
  tr.dataset.id = property.id;

  tr.innerHTML = `
    <td class="td-expand">
      <button type="button" class="btn-expand" data-id="${property.id}" aria-label="펼치기"></button>
    </td>
    <td><input type="text" value="${escapeHtml(property.부동산)}" data-field="부동산" placeholder="부동산명"></td>
    <td class="address-cell">${renderAddressCell(property.부동산주소, property.부동산주소링크, "부동산주소", "부동산주소링크")}</td>
    <td class="address-cell">${renderAddressCell(property.집주소, property.집주소링크, "집주소", "집주소링크")}</td>
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
  `;

  const trExpand = document.createElement("tr");
  trExpand.className = "row-expand";
  trExpand.dataset.id = property.id;
  trExpand.innerHTML = `
    <td colspan="${COLUMN_COUNT}" class="td-expand-content">
      <div class="expand-content">
        <p class="expand-placeholder">체크리스트 항목은 요청 시 추가됩니다.</p>
      </div>
    </td>
  `;

  fragment.appendChild(tr);
  fragment.appendChild(trExpand);

  return fragment;
}

function escapeHtml(text) {
  if (text == null || text === "") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderAll(properties) {
  propertyListEl.innerHTML = "";
  properties.forEach((p) => {
    const fragment = renderProperty(p);
    propertyListEl.appendChild(fragment);
  });
  attachEventListeners();
}

// ===== Firestore 연동 =====
function syncFieldToFirestore(id, field, value) {
  updateDoc(doc(db, PROPERTIES_COLLECTION, id), { [field]: value }).catch(
    (err) => console.error("Firestore 업데이트 실패:", err)
  );
}

// ===== 이벤트 =====
function attachEventListeners() {
  // 삼각형 버튼 클릭 → 행 밑 칸 펼치기/접기
  document.querySelectorAll(".btn-expand").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const expandRow = document.querySelector(`.row-expand[data-id="${id}"]`);

      expandRow.classList.toggle("is-open");
      btn.classList.toggle("is-open");
    });
  });

  // 주소 셀: 편집 버튼 클릭 → 편집 모드
  propertyListEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-edit-address")) return;
    const cell = e.target.closest(".address-cell");
    if (!cell) return;
    cell.querySelector(".address-display").style.display = "none";
    cell.querySelector(".address-edit").style.display = "flex";
    cell.querySelector(".address-edit input").focus();
  });

  // 주소 셀: focusout 시 (셀 밖으로 포커스 이동) 저장 후 표시 모드로
  propertyListEl.addEventListener("focusout", (e) => {
    const editWrap = e.target.closest(".address-edit");
    if (!editWrap) return;
    if (editWrap.contains(e.relatedTarget)) return; // 셀 내 다른 input으로 이동 시 무시

    const cell = editWrap.closest(".address-cell");
    const row = cell?.closest(".row-main");
    if (!row || !cell) return;

    const id = row.dataset.id;
    const textInput = editWrap.querySelector('input[data-field="부동산주소"], input[data-field="집주소"]');
    const linkInput = editWrap.querySelector(".input-link");
    const textField = textInput?.dataset.field;
    const linkField = linkInput?.dataset.field;

    if (textField && linkField) {
      syncFieldToFirestore(id, textField, textInput.value);
      syncFieldToFirestore(id, linkField, linkInput.value.trim());
    }

    editWrap.style.display = "none";
    cell.querySelector(".address-display").style.display = "";
  }, true);

  // 입력값 변경 시 Firestore에 반영
  propertyListEl.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.dataset.field) return;
    const row = el.closest(".row-main");
    if (!row) return;

    const id = row.dataset.id;
    const field = el.dataset.field;
    const value = el.type === "checkbox" ? el.checked : el.value;

    syncFieldToFirestore(id, field, value);
  });

  propertyListEl.addEventListener("blur", (e) => {
    const el = e.target;
    if (!el.dataset.field || el.tagName !== "INPUT") return;
    if (el.type === "checkbox") return; // checkbox는 change로 처리
    if (el.closest(".address-edit")) return; // 주소 셀은 focusout에서 처리

    const row = el.closest(".row-main");
    if (!row) return;

    const id = row.dataset.id;
    const field = el.dataset.field;
    const value = el.value;

    syncFieldToFirestore(id, field, value);
  });

  // 매물 추가
  if (btnAddEl) {
    btnAddEl.onclick = async () => {
      try {
        await addDoc(collection(db, PROPERTIES_COLLECTION), {
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
        });
      } catch (err) {
        console.error("매물 추가 실패:", err);
      }
    };
  }
}

// ===== Firestore 실시간 리스너 =====
onSnapshot(collection(db, PROPERTIES_COLLECTION), (snapshot) => {
  const properties = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  renderAll(properties);
});
