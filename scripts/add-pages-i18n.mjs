// One-shot: namespaces battlesPage + missionsPage în messages/*.json (Faza D)
import fs from "node:fs";

const D = {
  ro: {
    battlesPage: {
      subtitle: "Versus între produse. Votează preferatul, câștigă SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Noi", sortEnding: "⏰ Se închid",
      empty: "Niciun battle activ. Ești primul!", createOne: "Creează unul",
      votes: "{count} voturi", permanent: "Permanent", ended: "Încheiat",
    },
    missionsPage: {
      subtitle: "Brief-uri plătite pentru creatori. Câștigi SWYP + bounty per vânzare.",
      empty: "Nu sunt mission-uri active acum. Revino curând!",
      perSale: "/vânzare", noDeadline: "Fără termen", ended: "Încheiat",
    },
  },
  en: {
    battlesPage: {
      subtitle: "Product versus product. Vote your favorite, earn SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 New", sortEnding: "⏰ Ending",
      empty: "No active battles. Be the first!", createOne: "Create one",
      votes: "{count} votes", permanent: "Permanent", ended: "Ended",
    },
    missionsPage: {
      subtitle: "Paid briefs for creators. Earn SWYP + a bounty per sale.",
      empty: "No active missions right now. Check back soon!",
      perSale: "/sale", noDeadline: "No deadline", ended: "Ended",
    },
  },
  es: {
    battlesPage: {
      subtitle: "Producto contra producto. Vota tu favorito, gana SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Nuevos", sortEnding: "⏰ Por cerrar",
      empty: "No hay battles activos. ¡Sé el primero!", createOne: "Crea uno",
      votes: "{count} votos", permanent: "Permanente", ended: "Finalizado",
    },
    missionsPage: {
      subtitle: "Briefs pagados para creadores. Gana SWYP + bounty por venta.",
      empty: "No hay misiones activas ahora. ¡Vuelve pronto!",
      perSale: "/venta", noDeadline: "Sin plazo", ended: "Finalizada",
    },
  },
  fr: {
    battlesPage: {
      subtitle: "Produit contre produit. Votez pour votre favori, gagnez des SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Nouveaux", sortEnding: "⏰ Bientôt finis",
      empty: "Aucun battle actif. Soyez le premier !", createOne: "Créez-en un",
      votes: "{count} votes", permanent: "Permanent", ended: "Terminé",
    },
    missionsPage: {
      subtitle: "Briefs rémunérés pour créateurs. Gagnez des SWYP + une prime par vente.",
      empty: "Pas de missions actives pour l'instant. Revenez bientôt !",
      perSale: "/vente", noDeadline: "Sans échéance", ended: "Terminée",
    },
  },
  de: {
    battlesPage: {
      subtitle: "Produkt gegen Produkt. Stimme für deinen Favoriten, verdiene SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Neu", sortEnding: "⏰ Enden bald",
      empty: "Keine aktiven Battles. Sei der Erste!", createOne: "Erstelle eins",
      votes: "{count} Stimmen", permanent: "Dauerhaft", ended: "Beendet",
    },
    missionsPage: {
      subtitle: "Bezahlte Briefings für Creators. Verdiene SWYP + Bounty pro Verkauf.",
      empty: "Gerade keine aktiven Missionen. Schau bald wieder vorbei!",
      perSale: "/Verkauf", noDeadline: "Ohne Frist", ended: "Beendet",
    },
  },
  pt: {
    battlesPage: {
      subtitle: "Produto contra produto. Vote no favorito, ganhe SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Novos", sortEnding: "⏰ A terminar",
      empty: "Nenhum battle ativo. Seja o primeiro!", createOne: "Crie um",
      votes: "{count} votos", permanent: "Permanente", ended: "Encerrado",
    },
    missionsPage: {
      subtitle: "Briefs pagos para criadores. Ganhe SWYP + bounty por venda.",
      empty: "Sem missões ativas agora. Volte em breve!",
      perSale: "/venda", noDeadline: "Sem prazo", ended: "Encerrada",
    },
  },
  it: {
    battlesPage: {
      subtitle: "Prodotto contro prodotto. Vota il tuo preferito, guadagna SWYP.",
      sortHot: "🔥 Hot", sortNew: "🆕 Nuovi", sortEnding: "⏰ In chiusura",
      empty: "Nessun battle attivo. Sii il primo!", createOne: "Creane uno",
      votes: "{count} voti", permanent: "Permanente", ended: "Concluso",
    },
    missionsPage: {
      subtitle: "Brief retribuiti per creator. Guadagna SWYP + bounty per vendita.",
      empty: "Nessuna missione attiva al momento. Torna presto!",
      perSale: "/vendita", noDeadline: "Senza scadenza", ended: "Conclusa",
    },
  },
};

for (const [loc, ns] of Object.entries(D)) {
  const file = `messages/${loc}.json`;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(j, ns);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log(`${file} += battlesPage, missionsPage`);
}
