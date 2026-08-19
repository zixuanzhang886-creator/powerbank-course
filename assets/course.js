(function () {
  const COURSE_KEY = "powerbank-course-progress-v1";
  const NOTE_KEY = "powerbank-course-notes-v1";

  function safeRead(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* The course still works when storage is unavailable. */
    }
  }

  function lessonIndex() {
    return Number(document.body.dataset.lessonIndex || 0);
  }

  function updateProgressUI() {
    const progress = safeRead(COURSE_KEY, {});
    const done = Object.values(progress).filter(Boolean).length;
    document.querySelectorAll("[data-progress-text]").forEach((el) => {
      el.textContent = `${done}/10 课已完成`;
    });
    document.querySelectorAll("[data-progress-bar]").forEach((el) => {
      el.style.width = `${done * 10}%`;
    });
    document.querySelectorAll("[data-lesson-card]").forEach((card) => {
      const index = card.dataset.lessonCard;
      card.classList.toggle("is-done", Boolean(progress[index]));
      const status = card.querySelector("[data-card-status]");
      if (status) status.textContent = progress[index] ? "已完成 ✓" : "待学习";
    });
    const button = document.querySelector("[data-complete-lesson]");
    const index = lessonIndex();
    if (button && index) {
      const completed = Boolean(progress[index]);
      button.classList.toggle("is-complete", completed);
      button.textContent = completed ? "已完成本课 ✓（点击可撤销）" : "标记本课为已完成";
    }
  }

  window.checkQuiz = function (button, quizId) {
    const quiz = document.getElementById(quizId);
    if (!quiz) return;
    const selected = quiz.querySelector("input[type='radio']:checked");
    const correct = document.getElementById(`${quizId}-correct`);
    const wrong = document.getElementById(`${quizId}-wrong`);
    if (!selected) {
      if (wrong) {
        wrong.hidden = false;
        wrong.classList.add("show");
        wrong.textContent = "先选一个答案，再看看你的判断。";
      }
      if (correct) {
        correct.hidden = true;
        correct.classList.remove("show");
      }
      return;
    }
    const isCorrect = selected.value === "correct";
    if (correct) {
      correct.hidden = !isCorrect;
      correct.classList.toggle("show", isCorrect);
    }
    if (wrong) {
      wrong.hidden = isCorrect;
      wrong.classList.toggle("show", !isCorrect);
    }
    quiz.classList.toggle("answered-correct", isCorrect);
    quiz.classList.toggle("answered-wrong", !isCorrect);
    button.textContent = isCorrect ? "答对了 ✓" : "再想一想";
  };

  window.toggleHint = function (button) {
    const hint = button.nextElementSibling;
    if (!hint) return;
    hint.hidden = !hint.hidden;
    button.textContent = hint.hidden ? "查看提示" : "收起提示";
  };

  function initExerciseToggle() {
    const checkbox = document.getElementById("code-toggle");
    const section = document.getElementById("code-exercise");
    if (!checkbox || !section) return;
    const apply = () => document.body.classList.toggle("course-show-exercises", checkbox.checked);
    checkbox.addEventListener("change", apply);
    apply();
  }

  function initCompleteButton() {
    const button = document.querySelector("[data-complete-lesson]");
    const index = lessonIndex();
    if (!button || !index) return;
    button.addEventListener("click", () => {
      const progress = safeRead(COURSE_KEY, {});
      progress[index] = !progress[index];
      safeWrite(COURSE_KEY, progress);
      updateProgressUI();
    });
  }

  function buildSelectionTools() {
    const toolbar = document.createElement("div");
    toolbar.className = "selection-toolbar";
    toolbar.hidden = true;
    toolbar.innerHTML = [
      '<button type="button" data-selection-action="ask">问 AI</button>',
      '<button type="button" data-selection-action="modify">帮我改写</button>',
      '<button type="button" data-selection-action="note">做笔记</button>'
    ].join("");

    const dialog = document.createElement("div");
    dialog.className = "selection-dialog";
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="selection-dialog-card" role="dialog" aria-modal="true" aria-label="学习辅助">
        <button class="dialog-close" type="button" aria-label="关闭">×</button>
        <p class="eyebrow" data-dialog-kicker>学习辅助</p>
        <h3 data-dialog-title>围绕这段内容继续</h3>
        <textarea rows="10" data-dialog-text></textarea>
        <div class="dialog-actions">
          <button class="btn secondary" type="button" data-copy-prompt>复制提示词</button>
          <button class="btn" type="button" data-save-note hidden>保存笔记</button>
          <button class="btn ghost" type="button" data-cancel-note hidden>取消这条笔记</button>
        </div>
      </div>`;

    const toast = document.createElement("div");
    toast.className = "course-toast";
    toast.hidden = true;
    toast.textContent = "已复制";
    document.body.append(toolbar, dialog, toast);

    let selection = "";
    let range = null;

    function lessonKey() {
      return `${document.body.dataset.lessonIndex || "index"}:${location.pathname}`;
    }

    function hideToolbarSoon() {
      setTimeout(() => {
        if (!toolbar.matches(":hover")) toolbar.hidden = true;
      }, 120);
    }

    document.addEventListener("mouseup", (event) => {
      if (toolbar.contains(event.target) || dialog.contains(event.target)) return;
      const current = window.getSelection();
      const text = current ? current.toString().trim() : "";
      if (!text || text.length < 2) {
        hideToolbarSoon();
        return;
      }
      const anchor = current.anchorNode && current.anchorNode.parentElement;
      if (!anchor || !anchor.closest("main, .container")) return;
      selection = text;
      range = current.rangeCount ? current.getRangeAt(0).cloneRange() : null;
      const rect = range ? range.getBoundingClientRect() : { left: event.clientX, top: event.clientY, width: 0 };
      toolbar.style.left = `${Math.max(12, Math.min(window.innerWidth - 250, rect.left + rect.width / 2 - 110))}px`;
      toolbar.style.top = `${Math.max(58, rect.top - 48)}px`;
      toolbar.hidden = false;
    });

    function promptFor(action) {
      const course = document.body.dataset.courseName || "充电宝生产全链路课";
      const lesson = document.body.dataset.lessonTitle || "课程首页";
      const instruction = action === "modify"
        ? "请把这段内容改写得更准确、清楚、适合初入行的产品经理，并说明你改了什么。"
        : "请解释这段内容，指出它在充电宝产品开发中的意义，并举一个具体例子。";
      return `## 课程上下文\n课程：${course}\n课时：${lesson}\n\n## 我选中的内容\n${selection}\n\n## 我的提问\n${instruction}`;
    }

    function showDialog(action) {
      toolbar.hidden = true;
      dialog.hidden = false;
      const title = dialog.querySelector("[data-dialog-title]");
      const text = dialog.querySelector("[data-dialog-text]");
      const save = dialog.querySelector("[data-save-note]");
      const cancel = dialog.querySelector("[data-cancel-note]");
      const copy = dialog.querySelector("[data-copy-prompt]");
      const isNote = action === "note";
      title.textContent = isNote ? "给这段内容做笔记" : (action === "modify" ? "复制改写提示词" : "复制提问提示词");
      text.value = isNote ? "" : promptFor(action);
      text.placeholder = isNote ? "写下你的判断、疑问，或回厂后要验证的事……" : "";
      save.hidden = !isNote;
      cancel.hidden = !isNote;
      copy.hidden = isNote;
      text.focus();
      dialog.dataset.action = action;
    }

    toolbar.addEventListener("click", (event) => {
      const action = event.target.dataset.selectionAction;
      if (action) showDialog(action);
    });

    function closeDialog() {
      dialog.hidden = true;
    }
    dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });

    dialog.querySelector("[data-copy-prompt]").addEventListener("click", async () => {
      const value = dialog.querySelector("[data-dialog-text]").value;
      try {
        await navigator.clipboard.writeText(value);
      } catch (_) {
        const text = dialog.querySelector("[data-dialog-text]");
        text.select();
        document.execCommand("copy");
      }
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 1300);
    });

    dialog.querySelector("[data-save-note]").addEventListener("click", () => {
      if (!range) return;
      const noteText = dialog.querySelector("[data-dialog-text]").value.trim();
      if (!noteText) return;
      const notes = safeRead(NOTE_KEY, {});
      const pageNotes = notes[lessonKey()] || [];
      pageNotes.push({ quote: selection, note: noteText, id: `note-${Date.now()}` });
      notes[lessonKey()] = pageNotes;
      safeWrite(NOTE_KEY, notes);
      try {
        const mark = document.createElement("mark");
        mark.className = "course-note";
        mark.title = noteText;
        mark.dataset.noteQuote = selection;
        range.surroundContents(mark);
      } catch (_) {
        /* A complex cross-element selection is still saved and restored by text. */
      }
      closeDialog();
    });

    dialog.querySelector("[data-cancel-note]").addEventListener("click", closeDialog);

    function restoreNotes() {
      const notes = safeRead(NOTE_KEY, {});
      const pageNotes = notes[lessonKey()] || [];
      const root = document.querySelector("main") || document.querySelector(".container");
      if (!root) return;
      pageNotes.forEach((entry) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const index = node.nodeValue.indexOf(entry.quote);
          if (index < 0 || node.parentElement.closest("mark.course-note")) continue;
          const before = node.nodeValue.slice(0, index);
          const after = node.nodeValue.slice(index + entry.quote.length);
          const mark = document.createElement("mark");
          mark.className = "course-note";
          mark.title = entry.note;
          mark.textContent = entry.quote;
          node.replaceWith(document.createTextNode(before), mark, document.createTextNode(after));
          break;
        }
      });
    }

    restoreNotes();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initExerciseToggle();
    initCompleteButton();
    updateProgressUI();
    buildSelectionTools();
  });
})();
