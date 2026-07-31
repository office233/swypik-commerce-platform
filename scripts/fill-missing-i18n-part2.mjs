// P1b: go (nested), shell — es/fr/de/pt/it (en există deja)
import fs from "node:fs";
import { applyTranslations } from "./fill-missing-i18n-part1.mjs";

const T2 = {
  shell: {
    becomeCourier: { es: "Conviértete en repartidor", fr: "Devenir coursier", de: "Kurier werden", pt: "Torne-se estafeta", it: "Diventa corriere" },
    bgWarning: { es: "Mantén la app abierta (en primer plano) para recibir pedidos: iOS detiene el GPS en segundo plano.", fr: "Gardez l'app ouverte (au premier plan) pour recevoir des commandes — iOS coupe le GPS en arrière-plan.", de: "Halte die App offen (im Vordergrund), um Aufträge zu erhalten — iOS stoppt GPS im Hintergrund.", pt: "Mantenha a app aberta (em primeiro plano) para receber pedidos — o iOS pára o GPS em segundo plano.", it: "Tieni l'app aperta (in primo piano) per ricevere ordini — iOS ferma il GPS in background." },
    courierApproved: { es: "Aprobado", fr: "Approuvé", de: "Genehmigt", pt: "Aprovado", it: "Approvato" },
    courierPending: { es: "En revisión", fr: "En cours de vérification", de: "In Prüfung", pt: "Em análise", it: "In verifica" },
    courierRejected: { es: "Rechazado", fr: "Rejeté", de: "Abgelehnt", pt: "Rejeitado", it: "Rifiutato" },
    discoverAfterDelivery: { es: "¿Te gustó? Descubre más en el feed", fr: "Ça vous a plu ? Découvrez-en plus dans le feed", de: "Hat's gefallen? Entdecke mehr im Feed", pt: "Gostou? Descubra mais no feed", it: "Ti è piaciuto? Scopri di più nel feed" },
    discoverFeed: { es: "Descubre el feed", fr: "Découvrir le feed", de: "Feed entdecken", pt: "Descobrir o feed", it: "Scopri il feed" },
    discoverFeedSub: { es: "Mira clips y productos nuevos mientras esperas", fr: "Regardez de nouveaux clips et produits en attendant", de: "Sieh dir neue Clips und Produkte an, während du wartest", pt: "Veja novos clipes e produtos enquanto espera", it: "Guarda nuovi clip e prodotti mentre aspetti" },
    gmaps: { es: "Google Maps", fr: "Google Maps", de: "Google Maps", pt: "Google Maps", it: "Google Maps" },
    modeBuyer: { es: "Comprador", fr: "Acheteur", de: "Käufer", pt: "Comprador", it: "Acquirente" },
    modeBuyerSub: { es: "Feed y compras", fr: "Feed et achats", de: "Feed & Einkäufe", pt: "Feed e compras", it: "Feed e acquisti" },
    modeCourier: { es: "Repartidor / Conductor", fr: "Coursier / Chauffeur", de: "Kurier / Fahrer", pt: "Estafeta / Motorista", it: "Corriere / Autista" },
    modeCourierSub: { es: "Entregas y viajes", fr: "Livraisons et courses", de: "Lieferungen und Fahrten", pt: "Entregas e viagens", it: "Consegne e corse" },
    modeCreator: { es: "Creador", fr: "Créateur", de: "Creator", pt: "Criador", it: "Creator" },
    modeCreatorSub: { es: "Publica clips", fr: "Publiez des clips", de: "Clips veröffentlichen", pt: "Publique clipes", it: "Pubblica clip" },
    modeSeller: { es: "Vendedor", fr: "Vendeur", de: "Verkäufer", pt: "Vendedor", it: "Venditore" },
    modeSellerSub: { es: "Panel de vendedor", fr: "Tableau de bord vendeur", de: "Verkäufer-Dashboard", pt: "Painel de vendedor", it: "Dashboard venditore" },
    myModes: { es: "Mis modos", fr: "Mes modes", de: "Meine Modi", pt: "Os meus modos", it: "Le mie modalità" },
    openFeed: { es: "Abrir el feed", fr: "Ouvrir le feed", de: "Feed öffnen", pt: "Abrir o feed", it: "Apri il feed" },
    soundOff: { es: "Sonido de oferta: apagado", fr: "Son des offres : désactivé", de: "Angebotston: aus", pt: "Som de oferta: desligado", it: "Suono offerta: spento" },
    soundOn: { es: "Sonido de oferta: encendido", fr: "Son des offres : activé", de: "Angebotston: an", pt: "Som de oferta: ligado", it: "Suono offerta: acceso" },
    waze: { es: "Waze", fr: "Waze", de: "Waze", pt: "Waze", it: "Waze" },
  },
};

// go e nested (go.cancel.confirm etc.) — tratăm separat cu chei plate
const GO = {
  "cancel.changed_mind": { es: "Cambié de opinión", fr: "J'ai changé d'avis", de: "Ich habe es mir anders überlegt", pt: "Mudei de ideias", it: "Ho cambiato idea" },
  "cancel.confirm": { es: "Cancelar el viaje", fr: "Annuler la course", de: "Fahrt stornieren", pt: "Cancelar a viagem", it: "Annulla la corsa" },
  "cancel.driver_not_coming": { es: "El conductor no viene", fr: "Le chauffeur ne vient pas", de: "Der Fahrer kommt nicht", pt: "O motorista não vem", it: "L'autista non arriva" },
  "cancel.error": { es: "No pudimos cancelar.", fr: "Impossible d'annuler.", de: "Stornierung fehlgeschlagen.", pt: "Não foi possível cancelar.", it: "Impossibile annullare." },
  "cancel.feeWarning": { es: "Se aplica una tarifa de cancelación de {fee}.", fr: "Des frais d'annulation de {fee} s'appliquent.", de: "Es fällt eine Stornogebühr von {fee} an.", pt: "Aplica-se uma taxa de cancelamento de {fee}.", it: "Si applica una tariffa di cancellazione di {fee}." },
  "cancel.keep": { es: "Mantener el viaje", fr: "Garder la course", de: "Fahrt behalten", pt: "Manter a viagem", it: "Mantieni la corsa" },
  "cancel.other": { es: "Otro motivo", fr: "Autre raison", de: "Anderer Grund", pt: "Outro motivo", it: "Altro motivo" },
  "cancel.otherPlaceholder": { es: "Cuéntanos qué pasó…", fr: "Dites-nous ce qui s'est passé…", de: "Erzähl uns, was passiert ist…", pt: "Conte-nos o que aconteceu…", it: "Raccontaci cosa è successo…" },
  "cancel.title": { es: "¿Por qué cancelas?", fr: "Pourquoi annulez-vous ?", de: "Warum stornierst du?", pt: "Porque está a cancelar?", it: "Perché annulli?" },
  "cancel.wait_too_long": { es: "Espero demasiado", fr: "J'attends trop longtemps", de: "Ich warte zu lange", pt: "Estou à espera há demasiado tempo", it: "Aspetto troppo" },
  "cancel.wrong_address": { es: "Me equivoqué de dirección", fr: "Je me suis trompé d'adresse", de: "Falsche Adresse angegeben", pt: "Enganei-me na morada", it: "Ho sbagliato indirizzo" },
  classComfort: { es: "Comfort", fr: "Comfort", de: "Comfort", pt: "Comfort", it: "Comfort" },
  classEconomy: { es: "Economy", fr: "Economy", de: "Economy", pt: "Economy", it: "Economy" },
  classVan: { es: "Van", fr: "Van", de: "Van", pt: "Van", it: "Van" },
  "driver.call": { es: "Llamar al conductor", fr: "Appeler le chauffeur", de: "Fahrer anrufen", pt: "Ligar ao motorista", it: "Chiama l'autista" },
  "driver.copied": { es: "¡Copiado!", fr: "Copié !", de: "Kopiert!", pt: "Copiado!", it: "Copiato!" },
  "driver.copyPlate": { es: "Copiar matrícula", fr: "Copier la plaque", de: "Kennzeichen kopieren", pt: "Copiar matrícula", it: "Copia targa" },
  "driver.rating": { es: "★ {rating}", fr: "★ {rating}", de: "★ {rating}", pt: "★ {rating}", it: "★ {rating}" },
  dropoffPlaceholder: { es: "¿A dónde vas?", fr: "Où allez-vous ?", de: "Wohin geht's?", pt: "Para onde vai?", it: "Dove vai?" },
  "errors.backToGo": { es: "Volver a Go", fr: "Retour à Go", de: "Zurück zu Go", pt: "Voltar ao Go", it: "Torna a Go" },
  "errors.noAccess": { es: "No tienes acceso a este viaje.", fr: "Vous n'avez pas accès à cette course.", de: "Du hast keinen Zugriff auf diese Fahrt.", pt: "Não tem acesso a esta viagem.", it: "Non hai accesso a questa corsa." },
  "errors.notFound": { es: "El viaje no existe.", fr: "Cette course n'existe pas.", de: "Diese Fahrt existiert nicht.", pt: "A viagem não existe.", it: "La corsa non esiste." },
  estimateError: { es: "No pudimos estimar la tarifa.", fr: "Impossible d'estimer le tarif.", de: "Fahrpreis konnte nicht geschätzt werden.", pt: "Não foi possível estimar a tarifa.", it: "Impossibile stimare la tariffa." },
  eta: { es: "~{min} min • {km} km", fr: "~{min} min • {km} km", de: "~{min} Min. • {km} km", pt: "~{min} min • {km} km", it: "~{min} min • {km} km" },
  hintComfort: { es: "más espacioso", fr: "plus spacieux", de: "geräumiger", pt: "mais espaçoso", it: "più spazioso" },
  hintEconomy: { es: "el más barato", fr: "le moins cher", de: "am günstigsten", pt: "o mais barato", it: "il più economico" },
  hintVan: { es: "hasta 6 plazas", fr: "jusqu'à 6 places", de: "bis zu 6 Sitze", pt: "até 6 lugares", it: "fino a 6 posti" },
  myLocation: { es: "Usar mi ubicación", fr: "Utiliser ma position", de: "Meinen Standort verwenden", pt: "Usar a minha localização", it: "Usa la mia posizione" },
  noZone: { es: "Swypik Go aún no está disponible en tu zona.", fr: "Swypik Go n'est pas encore disponible dans votre zone.", de: "Swypik Go ist in deiner Gegend noch nicht verfügbar.", pt: "O Swypik Go ainda não está disponível na sua zona.", it: "Swypik Go non è ancora disponibile nella tua zona." },
  order: { es: "Pedir • {price}", fr: "Commander • {price}", de: "Bestellen • {price}", pt: "Pedir • {price}", it: "Ordina • {price}" },
  orderError: { es: "No pudimos crear el viaje.", fr: "Impossible de créer la course.", de: "Fahrt konnte nicht erstellt werden.", pt: "Não foi possível criar a viagem.", it: "Impossibile creare la corsa." },
  orderNoPrice: { es: "Pedir", fr: "Commander", de: "Bestellen", pt: "Pedir", it: "Ordina" },
  ordering: { es: "Creando tu viaje…", fr: "Création de votre course…", de: "Deine Fahrt wird erstellt…", pt: "A criar a sua viagem…", it: "Creazione della corsa…" },
  paySwyp: { es: "Pagar con SWYP", fr: "Payer avec SWYP", de: "Mit SWYP bezahlen", pt: "Pagar com SWYP", it: "Paga con SWYP" },
  pickupPlaceholder: { es: "¿Desde dónde sales?", fr: "D'où partez-vous ?", de: "Wo geht's los?", pt: "De onde parte?", it: "Da dove parti?" },
  "receipt.another": { es: "Pedir otro viaje", fr: "Commander une autre course", de: "Weitere Fahrt bestellen", pt: "Pedir outra viagem", it: "Ordina un'altra corsa" },
  "receipt.cancelledFee": { es: "Tarifa de cancelación: {fee}", fr: "Frais d'annulation : {fee}", de: "Stornogebühr: {fee}", pt: "Taxa de cancelamento: {fee}", it: "Tariffa di cancellazione: {fee}" },
  "receipt.cancelledFree": { es: "Cancelación gratuita.", fr: "Annulation gratuite.", de: "Kostenlose Stornierung.", pt: "Cancelamento gratuito.", it: "Cancellazione gratuita." },
  "receipt.ratePrompt": { es: "¿Cómo fue el viaje?", fr: "Comment s'est passée la course ?", de: "Wie war deine Fahrt?", pt: "Como foi a viagem?", it: "Com'è andata la corsa?" },
  "receipt.rateSend": { es: "Enviar valoración", fr: "Envoyer la note", de: "Bewertung senden", pt: "Enviar avaliação", it: "Invia valutazione" },
  "receipt.rateThanks": { es: "¡Gracias por tu valoración! 💛", fr: "Merci pour votre note ! 💛", de: "Danke für deine Bewertung! 💛", pt: "Obrigado pela avaliação! 💛", it: "Grazie per la valutazione! 💛" },
  "receipt.total": { es: "Total a pagar", fr: "Total à payer", de: "Zu zahlender Betrag", pt: "Total a pagar", it: "Totale da pagare" },
  "search.cancelFree": { es: "Cancelar (gratis)", fr: "Annuler (gratuit)", de: "Stornieren (kostenlos)", pt: "Cancelar (grátis)", it: "Annulla (gratis)" },
  "search.elapsed": { es: "{sec} seg", fr: "{sec} s", de: "{sec} Sek.", pt: "{sec} seg", it: "{sec} sec" },
  "search.sending": { es: "Enviando tu solicitud a los conductores cercanos…", fr: "Envoi de votre demande aux chauffeurs à proximité…", de: "Deine Anfrage wird an Fahrer in der Nähe gesendet…", pt: "A enviar o seu pedido aos motoristas próximos…", it: "Invio della richiesta agli autisti vicini…" },
  "search.wave1": { es: "Buscando conductores cerca (2 km)…", fr: "Recherche de chauffeurs à proximité (2 km)…", de: "Suche Fahrer in der Nähe (2 km)…", pt: "À procura de motoristas por perto (2 km)…", it: "Ricerca autisti nelle vicinanze (2 km)…" },
  "search.wave2": { es: "Ampliando la búsqueda (5 km)…", fr: "Extension de la recherche (5 km)…", de: "Suche wird erweitert (5 km)…", pt: "A alargar a procura (5 km)…", it: "Estensione della ricerca (5 km)…" },
  "search.wave3": { es: "Buscando en toda la ciudad (10 km)…", fr: "Recherche dans toute la ville (10 km)…", de: "Suche in der ganzen Stadt (10 km)…", pt: "À procura em toda a cidade (10 km)…", it: "Ricerca in tutta la città (10 km)…" },
  "share.button": { es: "Compartir el viaje", fr: "Partager la course", de: "Fahrt teilen", pt: "Partilhar a viagem", it: "Condividi la corsa" },
  "share.copied": { es: "¡Enlace copiado!", fr: "Lien copié !", de: "Link kopiert!", pt: "Link copiado!", it: "Link copiato!" },
  "share.sos": { es: "SOS 112", fr: "SOS 112", de: "SOS 112", pt: "SOS 112", it: "SOS 112" },
  "status.accepted": { es: "El conductor va hacia ti", fr: "Votre chauffeur arrive", de: "Dein Fahrer ist unterwegs", pt: "O motorista vai a caminho", it: "L'autista sta arrivando" },
  "status.arriving": { es: "¡El conductor está cerca!", fr: "Votre chauffeur est presque là !", de: "Dein Fahrer ist gleich da!", pt: "O motorista está quase a chegar!", it: "L'autista è quasi arrivato!" },
  "status.cancelled": { es: "Viaje cancelado", fr: "Course annulée", de: "Fahrt storniert", pt: "Viagem cancelada", it: "Corsa annullata" },
  "status.completed": { es: "Viaje completado", fr: "Course terminée", de: "Fahrt abgeschlossen", pt: "Viagem concluída", it: "Corsa completata" },
  "status.in_progress": { es: "Viaje en curso", fr: "Course en cours", de: "Fahrt läuft", pt: "Viagem em curso", it: "Corsa in corso" },
  "status.requested": { es: "Preparando tu viaje…", fr: "Préparation de votre course…", de: "Deine Fahrt wird vorbereitet…", pt: "A preparar a sua viagem…", it: "Preparazione della corsa…" },
  "status.searching": { es: "Buscando un conductor cerca…", fr: "Recherche d'un chauffeur à proximité…", de: "Suche einen Fahrer in der Nähe…", pt: "À procura de um motorista por perto…", it: "Ricerca di un autista nelle vicinanze…" },
  surge: { es: "Alta demanda: tarifa ×{mult}", fr: "Forte demande — tarif ×{mult}", de: "Hohe Nachfrage — Tarif ×{mult}", pt: "Grande procura — tarifa ×{mult}", it: "Alta domanda — tariffa ×{mult}" },
  swypBalance: { es: "Saldo: {swyp} SWYP (aprox. {lei} lei) - cubrimos lo que se pueda del viaje", fr: "Solde : {swyp} SWYP (env. {lei} lei) - nous couvrons le maximum de la course", de: "Guthaben: {swyp} SWYP (ca. {lei} Lei) - wir decken so viel wie möglich der Fahrt", pt: "Saldo: {swyp} SWYP (aprox. {lei} lei) - cobrimos o máximo possível da viagem", it: "Saldo: {swyp} SWYP (circa {lei} lei) - copriamo il possibile della corsa" },
  title: { es: "Swypik Go", fr: "Swypik Go", de: "Swypik Go", pt: "Swypik Go", it: "Swypik Go" },
  "track.expired": { es: "El enlace ha caducado o no existe.", fr: "Le lien a expiré ou n'existe pas.", de: "Der Link ist abgelaufen oder existiert nicht.", pt: "O link expirou ou não existe.", it: "Il link è scaduto o non esiste." },
  "track.finished": { es: "El viaje ha terminado.", fr: "La course est terminée.", de: "Die Fahrt ist beendet.", pt: "A viagem terminou.", it: "La corsa è terminata." },
  "track.loading": { es: "Cargando…", fr: "Chargement…", de: "Wird geladen…", pt: "A carregar…", it: "Caricamento…" },
  "track.searching": { es: "Buscando un conductor…", fr: "Recherche d'un chauffeur…", de: "Suche einen Fahrer…", pt: "À procura de um motorista…", it: "Ricerca di un autista…" },
  "track.title": { es: "Viaje Swypik Go", fr: "Course Swypik Go", de: "Swypik-Go-Fahrt", pt: "Viagem Swypik Go", it: "Corsa Swypik Go" },
  "track.withDriver": { es: "Conductor: {name}", fr: "Chauffeur : {name}", de: "Fahrer: {name}", pt: "Motorista: {name}", it: "Autista: {name}" },
};

applyTranslations(T2);

// aplică GO nested
const set = (obj, keyPath, val) => {
  const parts = keyPath.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
  const last = parts.at(-1);
  if (o[last] === undefined) { o[last] = val; return 1; }
  return 0;
};
for (const loc of ["es", "fr", "de", "pt", "it"]) {
  const file = `messages/${loc}.json`;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  j.go = j.go || {};
  let added = 0;
  for (const [k, vals] of Object.entries(GO)) added += set(j.go, k, vals[loc]);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log(`${loc}: go +${added}`);
}
