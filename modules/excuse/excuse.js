  // Чисто for fun: "Оправдалка" на вкладке "Сессии" — облако мемных
  // отмазок игроков CS2; кнопка по очереди зажигает 3–5 случайных (с ✅, как в
  // меме), без привязки к конкретному игроку. Облако — 3D-сфера: теги
  // лежат на сфере (спираль Фибоначчи), сама она медленно вращается и
  // крутится перетаскиванием; ближние теги крупнее и ярче дальних.
  var EXCUSES = [
    "Не регает", "Первая разминочная", "Тайминг ебучий", "Инпут лаг",
    "Кто добавил невидимую текстуру?", "Вторая разминочная", "Лагает",
    "Начали за T", "Не повезло", "0 помощи", "-98хп", "Бомбу слили",
    "Достал нож не в тайминг", "Неудобно сидеть", "На карту отвлекся",
    "Команда бомжей", "Мышка отвалилась", "Пинг 200", "Фризы",
    "Тиммейты не кидают смоки", "Сбился прицел", "Скин не тот", "Тильт",
    "Солнце в глаза",
  ];
  var EXCUSE_STEP_MS = 700;
  var EXCUSE_AUTO_SPEED = 0.006; // рад/кадр (при 60 fps)
  var EXCUSE_DRAG_SPEED = 0.008; // рад на пиксель перетаскивания
  var excuseState = { running: false, raf: 0, last: 0, ax: 0.35, ay: 0, vx: 0, vy: 0, dragging: false, base: [] };

  // Равномерно раскладывает n точек по единичной сфере (спираль Фибоначчи).
  function fibonacciSphere(n) {
    var golden = Math.PI * (3 - Math.sqrt(5));
    var pts = [];
    for (var i = 0; i < n; i++) {
      var y = 1 - 2 * (i + 0.5) / n;
      var r = Math.sqrt(1 - y * y);
      pts.push([Math.cos(i * golden) * r, y, Math.sin(i * golden) * r]);
    }
    return pts;
  }

  function tickExcuseSphere(ts) {
    var cloud = document.getElementById("excuseCloud");
    if (!cloud) { excuseState.raf = 0; return; } // блок перестроен/убран — цикл заканчиваем
    excuseState.raf = requestAnimationFrame(tickExcuseSphere);

    var w = cloud.clientWidth, h = cloud.clientHeight;
    var dt = Math.min(ts - excuseState.last, 50) / 16.67;
    excuseState.last = ts;
    if (!w || !h) return; // вкладка скрыта (display: none)

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!excuseState.dragging) {
      excuseState.ay += ((reduceMotion ? 0 : EXCUSE_AUTO_SPEED) + excuseState.vy) * dt;
      excuseState.ax += excuseState.vx * dt;
      var decay = Math.pow(0.95, dt);
      excuseState.vx *= decay;
      excuseState.vy *= decay;
    }

    var radius = Math.min(w * 0.26, h * 0.42);
    var sinY = Math.sin(excuseState.ay), cosY = Math.cos(excuseState.ay);
    var sinX = Math.sin(excuseState.ax), cosX = Math.cos(excuseState.ax);
    var tags = cloud.querySelectorAll(".excuse-tag");
    for (var i = 0; i < tags.length; i++) {
      var b = excuseState.base[i];
      var x1 = b[0] * cosY + b[2] * sinY;
      var z1 = -b[0] * sinY + b[2] * cosY;
      var y2 = b[1] * cosX - z1 * sinX;
      var z2 = b[1] * sinX + z1 * cosX;
      var depth = (z2 + 1) / 2; // 0 — дальняя точка сферы, 1 — ближняя
      var lit = tags[i].classList.contains("on");
      var scale = 0.65 + 0.55 * depth;
      var opacity = 0.25 + 0.75 * depth;
      if (lit) { scale = Math.max(scale, 0.9); opacity = Math.max(opacity, 0.95); }
      tags[i].style.transform = "translate(-50%, -50%) translate(" + (x1 * radius).toFixed(1) + "px, " +
        (y2 * radius).toFixed(1) + "px) scale(" + scale.toFixed(3) + ")";
      tags[i].style.opacity = opacity.toFixed(2);
      tags[i].style.zIndex = Math.round(depth * 100) + (lit ? 200 : 0);
    }
  }

  function bindExcuseDrag(cloud) {
    var lastX = 0, lastY = 0;
    cloud.addEventListener("pointerdown", function (e) {
      excuseState.dragging = true;
      excuseState.vx = 0;
      excuseState.vy = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      cloud.classList.add("dragging");
      cloud.setPointerCapture(e.pointerId);
    });
    cloud.addEventListener("pointermove", function (e) {
      if (!excuseState.dragging) return;
      var dx = (e.clientX - lastX) * EXCUSE_DRAG_SPEED;
      var dy = (e.clientY - lastY) * EXCUSE_DRAG_SPEED;
      lastX = e.clientX;
      lastY = e.clientY;
      excuseState.ay += dx;
      excuseState.ax += dy;
      excuseState.vy = dx; // последняя дельта — инерция после отпускания
      excuseState.vx = dy;
    });
    function stop() {
      excuseState.dragging = false;
      cloud.classList.remove("dragging");
    }
    cloud.addEventListener("pointerup", stop);
    cloud.addEventListener("pointercancel", stop);
  }

  function renderExcuseSection() {
    var el = document.getElementById("excuseSection");
    if (el.dataset.built !== "1") {
      buildExcuses(el);
      el.dataset.built = "1";
    }
    el.style.display = state.tab === "lastSession" ? "" : "none";
  }

  function buildExcuses(el) {
    var tagsHtml = EXCUSES.map(function (text) {
      return '<span class="excuse-tag">' + escapeHtml(text) + "</span>";
    }).join("");

    el.innerHTML =
      '<div class="excuse-section">' +
        '<div class="excuse-title">Оправдалка</div>' +
        '<div class="excuse-controls">' +
          '<button type="button" class="wheel-spin-btn" id="excuseBtn">Найти оправдание</button>' +
        "</div>" +
        '<div class="excuse-cloud" id="excuseCloud">' + tagsHtml + "</div>" +
        '<div class="excuse-result" id="excuseResult"></div>' +
      "</div>";

    excuseState.running = false;
    excuseState.dragging = false;
    excuseState.vx = 0;
    excuseState.vy = 0;
    excuseState.base = fibonacciSphere(EXCUSES.length);
    document.getElementById("excuseBtn").addEventListener("click", runExcuses);
    bindExcuseDrag(document.getElementById("excuseCloud"));
    cancelAnimationFrame(excuseState.raf);
    excuseState.last = performance.now();
    excuseState.raf = requestAnimationFrame(tickExcuseSphere);
  }

  function runExcuses() {
    if (excuseState.running) return;
    excuseState.running = true;
    var btn = document.getElementById("excuseBtn");
    var resultEl = document.getElementById("excuseResult");
    var tags = document.querySelectorAll("#excuseCloud .excuse-tag");

    btn.disabled = true;
    tags.forEach(function (t) { t.classList.remove("on"); });
    resultEl.innerHTML = "";

    var count = 3 + Math.floor(Math.random() * 3); // 3..5
    var order = EXCUSES.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { // Фишер–Йейтс
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var picked = order.slice(0, count);
    var shown = [];

    var timer = setInterval(function () {
      var idx = picked[shown.length];
      tags[idx].classList.add("on");
      shown.push(EXCUSES[idx]);
      resultEl.innerHTML = shown.map(function (t) { return escapeHtml(t) + " ✅"; }).join(" ");
      if (shown.length === count) {
        clearInterval(timer);
        excuseState.running = false;
        btn.disabled = false;
      }
    }, EXCUSE_STEP_MS);
  }

