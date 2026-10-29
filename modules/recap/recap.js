  // "Итоги вечера": карточка-картинка по выбранной сессии на canvas. Данные
  // (top/rise/drop) считает scripts/lib/recap.mjs; здесь модель, рисование и
  // кнопки. Без аватарок Steam: кросс-доменные картинки "пачкают" canvas и
  // ломают toBlob. Имена рисуются только через fillText.
  var RECAP_W = 1080;
  var RECAP_PAD = 56;
  var RECAP_MAX_MAPS = 8;
  // Шрифт карточки — тот же, что у страницы (берётся с body), запасной — системный.
  var RECAP_FALLBACK_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  function recapFontFamily() {
    return getComputedStyle(document.body).fontFamily || RECAP_FALLBACK_FONT;
  }
  var recapState = { open: false, joke: null };

  function randomExcuse(except) {
    var pool = EXCUSES.filter(function (e) { return e !== except; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function recapModel(s) {
    var byId = {};
    s.players.forEach(function (p) { byId[p.steamid64] = p; });
    function nameOf(id) { return (byId[id] && byId[id].name) || "—"; }
    var r = s.recap;
    var hours = s.lastPlayedAt && s.firstPlayedAt ? Math.max(1, Math.round((s.lastPlayedAt - s.firstPlayedAt) / 3600)) : null;
    var maps = s.maps.map(function (m) {
      var ok = m.teams && m.teams.length === 2 && m.teams[0].score != null && m.teams[1].score != null;
      return {
        name: recordMapName(m.map),
        score: ok ? Math.max(m.teams[0].score, m.teams[1].score) + ":" + Math.min(m.teams[0].score, m.teams[1].score) : "",
      };
    });
    return {
      date: sessionDate(s.id),
      sub: mapsCount(s.maps.length) + (hours ? " · ~" + hours + " ч" : ""),
      top: r.top.map(function (e) {
        return { name: nameOf(e.steamid64), rating: e.rating, kd: e.kd, kdDiff: e.kdDiff, wins: e.wins, maps: e.maps };
      }),
      rise: r.rise ? { name: nameOf(r.rise.steamid64), delta: r.rise.delta } : null,
      drop: r.drop ? { name: nameOf(r.drop.steamid64), delta: r.drop.delta } : null,
      maps: maps.slice(0, RECAP_MAX_MAPS),
      moreMaps: Math.max(0, maps.length - RECAP_MAX_MAPS),
      joke: recapState.joke,
    };
  }

  // Текстовая версия карточки: aria-label canvas и опора для проверок.
  function recapAriaLabel(m) {
    var parts = ["Итоги вечера " + m.date + ". " + m.sub + "."];
    if (m.top.length) {
      parts.push("MVP вечера: " + m.top[0].name + ", рейтинг " + fmtRating(m.top[0].rating) + ".");
      parts.push("Топ-3: " + m.top.map(function (t, i) { return (i + 1) + ". " + t.name + " " + fmtRating(t.rating); }).join("; ") + ".");
    }
    if (m.rise) parts.push("Больше всего вырос: " + m.rise.name + " " + fmtRatingDelta(m.rise.delta) + ".");
    if (m.drop) parts.push("Больше всего просел: " + m.drop.name + " " + fmtRatingDelta(m.drop.delta) + ".");
    if (m.maps.length) {
      parts.push("Карты: " + m.maps.map(function (x) { return x.name + (x.score ? " " + x.score : ""); }).join("; ") +
        (m.moreMaps ? " и ещё " + m.moreMaps : "") + ".");
    }
    if (m.joke) parts.push("Шутка вечера: " + m.joke + ".");
    return parts.join(" ");
  }

  // На картинке отрицательные числа со знаком "−" (типографский минус), а не дефисом.
  function recapMinus(str) { return String(str).replace(/^-/, "−"); }

  function recapColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    return {
      bg: v("--bg", "#14161c"), panel: v("--bg-panel", "#1b1e26"), border: v("--border", "#2c303b"),
      text: v("--text", "#e6e8ef"), dim: v("--text-dim", "#9096a6"), faint: v("--text-faint", "#5b6172"),
      accent: v("--accent", "#6ea8ff"), green: v("--green", "#3ecf6e"), red: v("--red", "#e0625c"),
    };
  }
  function fitText(ctx, str, maxW) {
    if (ctx.measureText(str).width <= maxW) return str;
    var s = str;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Один код и для замера (draw = false), и для рисования (draw = true):
  // возвращает полную высоту карточки.
  function renderRecapCard(ctx, m, C, draw) {
    var W = RECAP_W, P = RECAP_PAD, inner = W - 2 * P;
    var family = recapFontFamily();
    var y = P;
    function text(str, x, baseline, size, weight, color, align, maxW) {
      ctx.font = weight + " " + size + "px " + family;
      ctx.textAlign = align || "left";
      var s = maxW ? fitText(ctx, String(str), maxW) : String(str);
      if (draw) { ctx.fillStyle = color; ctx.fillText(s, x, baseline); }
    }
    function panel(x, top, w, h) {
      if (!draw) return;
      roundRect(ctx, x, top, w, h, 20);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.border;
      ctx.stroke();
    }

    text("Рейтинг игроков «ЛЛ»", P, y + 26, 26, "500", C.faint);
    y += 52;
    text("Итоги вечера", P, y + 56, 64, "700", C.text);
    y += 86;
    text(m.date + " · " + m.sub, P, y + 28, 30, "400", C.dim, "left", inner);
    y += 64;

    if (m.top.length) {
      var mvp = m.top[0];
      panel(P, y, inner, 236);
      text("MVP вечера", P + 36, y + 56, 26, "600", C.accent);
      text(mvp.name, P + 36, y + 128, 64, "700", C.text, "left", inner - 72);
      var stats = "Рейтинг " + fmtRating(mvp.rating) + " · K/D " + fmt2(mvp.kd) + " · K-D " + recapMinus(fmtDiff(mvp.kdDiff));
      if (typeof mvp.wins === "number" && typeof mvp.maps === "number") stats += " · побед " + mvp.wins + " из " + mvp.maps;
      text(stats, P + 36, y + 188, 30, "400", C.dim, "left", inner - 72);
      y += 236 + 32;

      text("Топ-3 вечера", P, y + 28, 30, "600", C.dim);
      y += 52;
      m.top.forEach(function (t, i) {
        text(String(i + 1), P + 8, y + 40, 38, "700", C.accent);
        text(t.name, P + 64, y + 40, 38, "500", C.text, "left", inner - 64 - 330);
        text(fmtRating(t.rating) + " · K/D " + fmt2(t.kd), W - P, y + 40, 32, "400", C.dim, "right");
        y += 64;
      });
      y += 24;
    }

    var blocks = [];
    if (m.rise) blocks.push({ label: "Больше всего вырос", name: m.rise.name, value: recapMinus(fmtRatingDelta(m.rise.delta)), color: C.green });
    if (m.drop) blocks.push({ label: "Больше всего просел", name: m.drop.name, value: recapMinus(fmtRatingDelta(m.drop.delta)), color: C.red });
    if (blocks.length) {
      var gap = 24, bw = (inner - gap * (blocks.length - 1)) / blocks.length;
      blocks.forEach(function (b, i) {
        var x = P + i * (bw + gap);
        panel(x, y, bw, 140);
        text(b.label, x + 28, y + 44, 24, "600", C.dim, "left", bw - 56);
        // ширину значения замеряем, чтобы длинное число не налезало на имя
        ctx.font = "700 44px " + family;
        var valueW = ctx.measureText(b.value).width;
        text(b.name, x + 28, y + 104, 38, "700", C.text, "left", Math.max(40, bw - 56 - valueW - 24));
        text(b.value, x + bw - 28, y + 104, 44, "700", b.color, "right");
      });
      y += 140 + 32;
    }

    if (m.maps.length) {
      text("Карты вечера", P, y + 28, 30, "600", C.dim);
      y += 52;
      m.maps.forEach(function (mp) {
        text(mp.name, P + 8, y + 34, 34, "500", C.text, "left", inner - 200);
        if (mp.score) text(mp.score, W - P, y + 34, 34, "700", C.text, "right");
        y += 52;
      });
      if (m.moreMaps) {
        text("и ещё " + m.moreMaps, P + 8, y + 30, 28, "400", C.faint);
        y += 48;
      }
      y += 16;
    }

    if (m.joke) {
      panel(P, y, inner, 150);
      text("Шутка вечера", P + 36, y + 46, 24, "600", C.dim);
      text("«" + m.joke + "» ✅", P + 36, y + 108, 42, "600", C.text, "left", inner - 72);
      y += 150 + 32;
    }
    return y - 32 + P;
  }

  function drawRecapCard(canvas, s) {
    var ctx = canvas.getContext("2d");
    var C = recapColors();
    var m = recapModel(s);
    canvas.width = RECAP_W;
    var H = renderRecapCard(ctx, m, C, false); // замер
    canvas.height = H; // сбрасывает состояние контекста
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, RECAP_W, H);
    renderRecapCard(ctx, m, C, true);
    canvas.setAttribute("aria-label", recapAriaLabel(m));
  }

  function renderRecapPanel(s) {
    var host = document.getElementById("recapPanel");
    if (!host) return;
    host.textContent = "";
    if (!recapState.open || !s.recap) return;
    if (!recapState.joke) recapState.joke = randomExcuse();

    var canvas = document.createElement("canvas");
    canvas.className = "recap-canvas";
    canvas.setAttribute("role", "img");
    var bar = document.createElement("div");
    bar.className = "recap-actions";
    var status = document.createElement("span");
    status.className = "recap-status";
    status.setAttribute("aria-live", "polite");
    status.id = "recapStatus";
    function button(label, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", onClick);
      bar.appendChild(b);
    }

    button("Скачать PNG", function () {
      status.textContent = ""; // не оставляем сообщение от прошлого действия
      canvas.toBlob(function (blob) {
        if (!blob) { status.textContent = "Не удалось сохранить картинку."; return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "itogi-vechera-" + s.id + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        status.textContent = "Файл сохранён.";
      }, "image/png");
    });
    button("Копировать", function () {
      status.textContent = "";
      if (!navigator.clipboard || !window.ClipboardItem) {
        status.textContent = "Браузер не умеет копировать картинку — скачайте файл.";
        return;
      }
      // write вызываем сразу, пока длится жест пользователя (Safari иначе
      // отказывает), а картинку отдаём промисом — так допускает ClipboardItem.
      try {
        var blobPromise = new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error("no blob")); }, "image/png");
        });
        navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]).then(
          function () { status.textContent = "Скопировано."; },
          function () { status.textContent = "Не удалось скопировать — скачайте файл."; }
        );
      } catch (err) {
        status.textContent = "Не удалось скопировать — скачайте файл.";
      }
    });
    button("Другая фраза", function () {
      recapState.joke = randomExcuse(recapState.joke);
      drawRecapCard(canvas, s);
      status.textContent = "";
    });
    bar.appendChild(status);

    host.appendChild(canvas);
    host.appendChild(bar);
    drawRecapCard(canvas, s);
  }

