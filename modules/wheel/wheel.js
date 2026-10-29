  // Чисто for fun: колесо фортуны на вкладке "Сессии" (для выбранной сессии). Категории
  // "random" разыгрываются честным случайным выбором среди участников сессии
  // (специально не завязаны на статистику, чтобы никого не обижать), а
  // "best"/"worst" всегда указывают на реального лидера/последнего по
  // рейтингу этой сессии — players уже отсортирован по рейтингу (см. build.mjs).
  var WHEEL_CATEGORIES = [
    { text: "Кто покупает всем пивасик?", type: "random" },
    { text: "Кого баним на следующую сессию?", type: "random" },
    { text: "Титул: Отец-Доминатор", type: "random" },
    { text: "Лучше бы остался дома <3", type: "random" },
    { text: "Тащер вечера", type: "best" },
    { text: "Посмотрю пару стримов и в следующий раз всех нагну", type: "worst" },
  ];
  var WHEEL_COLORS = ["#6ea8ff", "#3ecf6e", "#e0c34c", "#e0923e", "#e0625c", "#9b6bff", "#4cd2e0", "#e05c9e"];
  var WHEEL_GRAY = "#454a56";
  var wheelState = { rotation: 0, spinning: false, lastCategoryIndex: -1, segments: [] };

  function wheelShortName(name) {
    return name.length > 12 ? name.slice(0, 11) + "…" : name;
  }

  function renderWheelSection() {
    var el = document.getElementById("wheelSection");
    var session = currentSession();
    var hasSession = session && session.players.length > 0;
    if (!hasSession) {
      el.innerHTML = "";
      el.dataset.built = "";
      return;
    }
    if (el.dataset.built !== session.id) {
      buildWheel(el, session.players);
      el.dataset.built = session.id;
    }
    el.style.display = state.tab === "lastSession" ? "" : "none";
  }

  // conic-gradient со всеми секторами в цвете, или, если передан winnerIndex,
  // все, кроме его сектора, перекрашены в серый (см. п.2 правки — победитель
  // остаётся выделенным цветом, остальные гаснут).
  function wheelBackground(winnerIndex) {
    return "conic-gradient(" + wheelState.segments.map(function (s, i) {
      var color = winnerIndex == null || i === winnerIndex ? s.color : WHEEL_GRAY;
      return color + " " + s.from + "deg " + s.to + "deg";
    }).join(", ") + ")";
  }

  function buildWheel(el, players) {
    var n = players.length;
    var seg = 360 / n;

    wheelState.segments = players.map(function (p, i) {
      return { color: WHEEL_COLORS[i % WHEEL_COLORS.length], from: i * seg, to: (i + 1) * seg };
    });

    // Подпись читается вдоль своего радиуса, от центра к краю: pivot стоит в
    // центре колеса, а rotate(ci - 90) разворачивает локальную ось "вправо"
    // (куда растёт текст) точно в сторону сектора ci.
    var labelsHtml = players.map(function (p, i) {
      var ci = i * seg + seg / 2;
      return '<div class="wheel-seg-label" style="transform: rotate(' + (ci - 90) + 'deg);">' +
        "<span>" + escapeHtml(wheelShortName(p.name)) + "</span></div>";
    }).join("");

    el.innerHTML =
      '<div class="wheel-section">' +
        '<div class="wheel-category" id="wheelCategory">Крути колесо!</div>' +
        '<div class="wheel-stage">' +
          '<div class="wheel-pointer">▼</div>' +
          '<div class="wheel-dial" id="wheelDial" style="background: ' + wheelBackground(null) + ';">' + labelsHtml + "</div>" +
        "</div>" +
        '<button type="button" class="wheel-spin-btn" id="wheelSpinBtn">🎡 Крутить колесо</button>' +
        '<div class="wheel-result" id="wheelResult"></div>' +
      "</div>";

    wheelState.rotation = 0;
    wheelState.spinning = false;
    wheelState.lastCategoryIndex = -1;
    document.getElementById("wheelSpinBtn").addEventListener("click", spinWheel);
  }

  // Пока крутится колесо, список сессий недоступен (иначе выбор молча откатывался бы).
  function setSessionSelectLocked(locked) {
    var sel = document.getElementById("sessionSelect");
    if (sel) sel.disabled = locked;
  }

  function spinWheel() {
    var session = currentSession();
    if (wheelState.spinning || !session) return;
    var players = session.players;
    var n = players.length;
    var seg = 360 / n;

    // Та же категория два раза подряд не выпадает — исключаем прошлый индекс
    // из пула перед случайным выбором.
    var categoryPool = WHEEL_CATEGORIES.map(function (c, i) { return i; })
      .filter(function (i) { return i !== wheelState.lastCategoryIndex; });
    var categoryIndex = categoryPool[Math.floor(Math.random() * categoryPool.length)];
    wheelState.lastCategoryIndex = categoryIndex;
    var category = WHEEL_CATEGORIES[categoryIndex];

    var winnerIndex;
    if (category.type === "best") {
      winnerIndex = 0;
    } else if (category.type === "worst") {
      winnerIndex = n - 1;
    } else {
      winnerIndex = Math.floor(Math.random() * n);
    }
    var winner = players[winnerIndex];

    var ci = winnerIndex * seg + seg / 2;
    var curMod = wheelState.rotation % 360;
    var targetMod = (360 - ci) % 360;
    var delta = (targetMod - curMod + 360) % 360;
    var extraSpins = 5;
    wheelState.rotation += extraSpins * 360 + delta;

    wheelState.spinning = true;
    setSessionSelectLocked(true); // менять сессию во время вращения нельзя
    document.getElementById("wheelCategory").textContent = category.text;
    document.getElementById("wheelResult").textContent = "";
    document.getElementById("wheelSpinBtn").disabled = true;
    document.getElementById("wheelDial").style.background = wheelBackground(null);
    document.getElementById("wheelDial").style.transform = "rotate(" + wheelState.rotation + "deg)";

    setTimeout(function () {
      wheelState.spinning = false;
      setSessionSelectLocked(false);
      document.getElementById("wheelSpinBtn").disabled = false;
      document.getElementById("wheelDial").style.background = wheelBackground(winnerIndex);
      document.getElementById("wheelResult").innerHTML =
        escapeHtml(category.text) + ": <strong>" + escapeHtml(winner.name) + "</strong>";
    }, 5000);
  }
