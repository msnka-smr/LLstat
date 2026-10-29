    var recapBtn = document.getElementById("recapBtn");
    if (recapBtn) {
      recapBtn.addEventListener("click", function () {
        recapState.open = !recapState.open;
        if (recapState.open) recapState.joke = randomExcuse();
        renderSessionHeader();
        // renderSessionHeader пересоздал кнопку; возвращаем фокус, иначе с
        // клавиатуры нельзя закрыть панель тем же нажатием
        document.getElementById("recapBtn").focus();
      });
    }
    renderRecapPanel(s);
