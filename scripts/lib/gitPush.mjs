// Пуш с повтором: между нашим pull в начале и пушем в конце обновления в master
// может успеть запушить кто-то ещё (бот MatchDay, кнопка в GitHub, ПК владельца).
// Отклонённый push лечится pull --rebase; данные у нас и у них в разных файлах.
export function pushWithRebaseRetry(run, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      run("git", ["push"]);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      run("git", ["pull", "--rebase"]);
    }
  }
}
