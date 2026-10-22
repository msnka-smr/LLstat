// Аватарки из матчей cybershoke — снимок, который он делает один раз и потом
// не обновляет (у moloko в июньских и октябрьских матчах одна и та же старая
// картинка, а в Steam уже другая). Поэтому актуальную берём напрямую у Steam
// и храним отдельным полем steamAvatarUrl; avatarUrl из матчей остаётся запасным.

const AVATAR_RE = /<avatarFull><!\[CDATA\[https?:\/\/[^\]]*?\/([0-9a-f]{40})_full\.jpg\]\]><\/avatarFull>/;

export function parseAvatarFull(xml) {
  const hash = typeof xml === "string" ? xml.match(AVATAR_RE)?.[1] : null;
  // тот же хост, что у аватарок cybershoke, чтобы URL выглядели единообразно
  return hash ? `https://avatars.steamstatic.com/${hash}_full.jpg` : null;
}

// fetchText(steamid64) → текст XML профиля или null; исключения глотаем:
// недоступный Steam не должен ронять обновление, остаётся прошлая аватарка
export async function refreshSteamAvatars(registry, fetchText, concurrency = 4) {
  const ids = Object.keys(registry);
  const changed = [];
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      let url = null;
      try {
        url = parseAvatarFull(await fetchText(id));
      } catch {
        continue;
      }
      if (url && registry[id].steamAvatarUrl !== url) {
        registry[id].steamAvatarUrl = url;
        changed.push(id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return changed;
}

export async function fetchSteamProfileXml(steamid64) {
  const res = await fetch(`https://steamcommunity.com/profiles/${steamid64}?xml=1`, {
    signal: AbortSignal.timeout(10000),
  });
  return res.ok ? res.text() : null;
}
