import fs from "node:fs";
const K = {
  ro: { cardExploreKicker: "Descoperă produse", cardExploreTitle: "Explore", cardExploreCta: "Vezi feedul →", cardMissionsKicker: "Câștigă SWYP", cardMissionsTitle: "Misiuni", cardMissionsCta: "Vezi misiunile →" },
  en: { cardExploreKicker: "Discover products", cardExploreTitle: "Explore", cardExploreCta: "See the feed →", cardMissionsKicker: "Earn SWYP", cardMissionsTitle: "Missions", cardMissionsCta: "See missions →" },
  es: { cardExploreKicker: "Descubre productos", cardExploreTitle: "Explorar", cardExploreCta: "Ver el feed →", cardMissionsKicker: "Gana SWYP", cardMissionsTitle: "Misiones", cardMissionsCta: "Ver misiones →" },
  fr: { cardExploreKicker: "Découvrez des produits", cardExploreTitle: "Explorer", cardExploreCta: "Voir le fil →", cardMissionsKicker: "Gagnez des SWYP", cardMissionsTitle: "Missions", cardMissionsCta: "Voir les missions →" },
  de: { cardExploreKicker: "Produkte entdecken", cardExploreTitle: "Explore", cardExploreCta: "Zum Feed →", cardMissionsKicker: "SWYP verdienen", cardMissionsTitle: "Missionen", cardMissionsCta: "Missionen ansehen →" },
  pt: { cardExploreKicker: "Descubra produtos", cardExploreTitle: "Explorar", cardExploreCta: "Ver o feed →", cardMissionsKicker: "Ganhe SWYP", cardMissionsTitle: "Missões", cardMissionsCta: "Ver missões →" },
  it: { cardExploreKicker: "Scopri prodotti", cardExploreTitle: "Esplora", cardExploreCta: "Vedi il feed →", cardMissionsKicker: "Guadagna SWYP", cardMissionsTitle: "Missioni", cardMissionsCta: "Vedi le missioni →" },
};
for (const [lang, keys] of Object.entries(K)) {
  const p = `messages/${lang}.json`;
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.account = { ...m.account, ...keys };
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  console.log(lang, "ok");
}
