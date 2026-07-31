// One-off: add lot-4 i18n keys (final hardcoded-RO cleanup batch)
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "messages");

// helper: build per-locale objects
const L = (ro, en, es, fr, de, pt, it) => ({ ro, en, es, fr, de, pt, it });

const KEYS = {
  goHistory: {
    error: L("Eroare", "Error", "Error", "Erreur", "Fehler", "Erro", "Errore"),
    title: L("Cursele mele 🚕", "My rides 🚕", "Mis viajes 🚕", "Mes courses 🚕", "Meine Fahrten 🚕", "Minhas corridas 🚕", "Le mie corse 🚕"),
    newRide: L("Cursă nouă", "New ride", "Nuevo viaje", "Nouvelle course", "Neue Fahrt", "Nova corrida", "Nuova corsa"),
    empty: L("Nicio cursă încă. Comandă prima! 🎉", "No rides yet. Book your first one! 🎉", "Aún no hay viajes. ¡Pide el primero! 🎉", "Pas encore de course. Réservez la première ! 🎉", "Noch keine Fahrten. Buche deine erste! 🎉", "Nenhuma corrida ainda. Peça a primeira! 🎉", "Nessuna corsa ancora. Prenota la prima! 🎉"),
    receipt: L("BON CURSĂ", "RIDE RECEIPT", "RECIBO DEL VIAJE", "REÇU DE COURSE", "FAHRTBELEG", "RECIBO DA CORRIDA", "RICEVUTA CORSA"),
    class: L("Clasă", "Class", "Clase", "Classe", "Klasse", "Classe", "Classe"),
    from: L("De la", "From", "Desde", "De", "Von", "De", "Da"),
    to: L("Până la", "To", "Hasta", "À", "Nach", "Até", "A"),
    distance: L("Distanță", "Distance", "Distancia", "Distance", "Entfernung", "Distância", "Distanza"),
    duration: L("Durată", "Duration", "Duración", "Durée", "Dauer", "Duração", "Durata"),
    driver: L("Șofer", "Driver", "Conductor", "Chauffeur", "Fahrer", "Motorista", "Autista"),
    total: L("Total", "Total", "Total", "Total", "Gesamt", "Total", "Totale"),
    viewLive: L("Vezi cursa live", "View ride live", "Ver viaje en vivo", "Voir la course en direct", "Fahrt live verfolgen", "Ver corrida ao vivo", "Segui la corsa live"),
  },
  foodTracking: {
    backToRestaurants: L("Înapoi la restaurante", "Back to restaurants", "Volver a restaurantes", "Retour aux restaurants", "Zurück zu den Restaurants", "Voltar aos restaurantes", "Torna ai ristoranti"),
    loading: L("Se încarcă", "Loading", "Cargando", "Chargement", "Wird geladen", "Carregando", "Caricamento"),
    back: L("Înapoi", "Back", "Atrás", "Retour", "Zurück", "Voltar", "Indietro"),
    waitingConfirmation: L("Așteptăm confirmarea restaurantului…", "Waiting for the restaurant to confirm…", "Esperando la confirmación del restaurante…", "En attente de la confirmation du restaurant…", "Wir warten auf die Bestätigung des Restaurants…", "Aguardando a confirmação do restaurante…", "In attesa della conferma del ristorante…"),
    yourCourier: L("Curierul tău", "Your courier", "Tu repartidor", "Votre livreur", "Dein Kurier", "Seu entregador", "Il tuo corriere"),
    callCourier: L("Sună curierul", "Call the courier", "Llamar al repartidor", "Appeler le livreur", "Kurier anrufen", "Ligar para o entregador", "Chiama il corriere"),
    courierTip: L("Bacșiș curier", "Courier tip", "Propina para el repartidor", "Pourboire livreur", "Trinkgeld für den Kurier", "Gorjeta do entregador", "Mancia al corriere"),
  },
  ordersActivity: {
    title: L("Comenzile mele", "My orders", "Mis pedidos", "Mes commandes", "Meine Bestellungen", "Meus pedidos", "I miei ordini"),
    authPrompt: L("Conectează-te ca să-ți vezi comenzile și cursele.", "Sign in to see your orders and rides.", "Inicia sesión para ver tus pedidos y viajes.", "Connectez-vous pour voir vos commandes et courses.", "Melde dich an, um deine Bestellungen und Fahrten zu sehen.", "Entre para ver seus pedidos e corridas.", "Accedi per vedere i tuoi ordini e le tue corse."),
    signIn: L("Conectează-te", "Sign in", "Iniciar sesión", "Se connecter", "Anmelden", "Entrar", "Accedi"),
    networkError: L("Nu am putut încărca activitatea. Verifică conexiunea.", "We couldn't load your activity. Check your connection.", "No pudimos cargar la actividad. Comprueba tu conexión.", "Impossible de charger l'activité. Vérifiez votre connexion.", "Aktivität konnte nicht geladen werden. Prüfe deine Verbindung.", "Não foi possível carregar a atividade. Verifique sua conexão.", "Impossibile caricare l'attività. Controlla la connessione."),
    retry: L("Reîncearcă", "Retry", "Reintentar", "Réessayer", "Erneut versuchen", "Tentar novamente", "Riprova"),
    empty: L("Încă nu ai comenzi sau curse.", "You don't have any orders or rides yet.", "Todavía no tienes pedidos ni viajes.", "Vous n'avez pas encore de commandes ni de courses.", "Du hast noch keine Bestellungen oder Fahrten.", "Você ainda não tem pedidos ou corridas.", "Non hai ancora ordini o corse."),
    orderFood: L("Comandă mâncare", "Order food", "Pedir comida", "Commander à manger", "Essen bestellen", "Pedir comida", "Ordina cibo"),
    callRide: L("Cheamă o mașină", "Get a ride", "Pedir un coche", "Commander une voiture", "Fahrt bestellen", "Chamar um carro", "Chiama un'auto"),
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "Carregando…", "Caricamento…"),
    loadMore: L("Încarcă mai multe", "Load more", "Cargar más", "Charger plus", "Mehr laden", "Carregar mais", "Carica altri"),
    status: {
      placed: L("Plasată", "Placed", "Realizado", "Passée", "Aufgegeben", "Feito", "Effettuato"),
      accepted: L("Acceptată", "Accepted", "Aceptado", "Acceptée", "Angenommen", "Aceito", "Accettato"),
      preparing: L("În preparare", "Preparing", "En preparación", "En préparation", "In Zubereitung", "Em preparo", "In preparazione"),
      ready: L("Gata", "Ready", "Listo", "Prête", "Fertig", "Pronto", "Pronto"),
      picked_up: L("Preluată", "Picked up", "Recogido", "Récupérée", "Abgeholt", "Retirado", "Ritirato"),
      delivering: L("În livrare", "Out for delivery", "En reparto", "En livraison", "In Zustellung", "Em entrega", "In consegna"),
      delivered: L("Livrată", "Delivered", "Entregado", "Livrée", "Zugestellt", "Entregue", "Consegnato"),
      cancelled: L("Anulată", "Cancelled", "Cancelado", "Annulée", "Storniert", "Cancelado", "Annullato"),
      rejected: L("Respinsă", "Rejected", "Rechazado", "Refusée", "Abgelehnt", "Recusado", "Rifiutato"),
      requested: L("Solicitată", "Requested", "Solicitado", "Demandée", "Angefragt", "Solicitado", "Richiesto"),
      searching: L("Căutăm șofer", "Finding a driver", "Buscando conductor", "Recherche d'un chauffeur", "Fahrer wird gesucht", "Procurando motorista", "Ricerca autista"),
      arriving: L("Șoferul vine", "Driver arriving", "El conductor llega", "Le chauffeur arrive", "Fahrer kommt", "Motorista a caminho", "L'autista sta arrivando"),
      in_progress: L("În cursă", "In progress", "En curso", "En cours", "Unterwegs", "Em andamento", "In corso"),
      completed: L("Finalizată", "Completed", "Completado", "Terminée", "Abgeschlossen", "Concluído", "Completato"),
    },
  },
  staysBookings: {
    title: L("Rezervările mele", "My bookings", "Mis reservas", "Mes réservations", "Meine Buchungen", "Minhas reservas", "Le mie prenotazioni"),
    empty: L("Nu ai nicio rezervare.", "You don't have any bookings.", "No tienes ninguna reserva.", "Vous n'avez aucune réservation.", "Du hast keine Buchungen.", "Você não tem reservas.", "Non hai prenotazioni."),
    findStay: L("Caută o cazare", "Find a stay", "Busca un alojamiento", "Trouver un hébergement", "Unterkunft suchen", "Buscar uma acomodação", "Cerca un alloggio"),
    refundProcessed: L("Refund procesat în wallet.", "Refund processed to your wallet.", "Reembolso procesado en tu monedero.", "Remboursement effectué sur votre portefeuille.", "Rückerstattung ins Wallet erfolgt.", "Reembolso processado na carteira.", "Rimborso accreditato nel wallet."),
  },
  stays: {
    destinationPlaceholder: L("ex: Brașov, Roma, Santorini", "e.g. Brașov, Rome, Santorini", "ej.: Brașov, Roma, Santorini", "ex. : Brașov, Rome, Santorin", "z. B. Brașov, Rom, Santorin", "ex.: Brașov, Roma, Santorini", "es.: Brașov, Roma, Santorini"),
    finalPriceNote: L("Prețul afișat e prețul final. În lei, fără taxe ascunse la plată.", "The price shown is the final price. No hidden fees at checkout.", "El precio mostrado es el precio final. Sin cargos ocultos al pagar.", "Le prix affiché est le prix final. Aucun frais caché au paiement.", "Der angezeigte Preis ist der Endpreis. Keine versteckten Gebühren.", "O preço exibido é o preço final. Sem taxas ocultas no pagamento.", "Il prezzo mostrato è quello finale. Nessun costo nascosto al pagamento."),
    verifiedNote: L("verificate de echipa Swypik · plată securizată", "verified by the Swypik team · secure payment", "verificadas por el equipo de Swypik · pago seguro", "vérifiées par l'équipe Swypik · paiement sécurisé", "vom Swypik-Team geprüft · sichere Zahlung", "verificadas pela equipe Swypik · pagamento seguro", "verificate dal team Swypik · pagamento sicuro"),
  },
  hiddenVideos: {
    restore: L("Restaurează", "Restore", "Restaurar", "Restaurer", "Wiederherstellen", "Restaurar", "Ripristina"),
    reason: {
      not_interested: L("Nu mă interesează", "Not interested", "No me interesa", "Pas intéressé", "Kein Interesse", "Não tenho interesse", "Non mi interessa"),
      reported: L("Raportat", "Reported", "Denunciado", "Signalé", "Gemeldet", "Denunciado", "Segnalato"),
      already_seen: L("Văzut deja", "Already seen", "Ya visto", "Déjà vu", "Bereits gesehen", "Já visto", "Già visto"),
      blocked_creator: L("Creator blocat", "Creator blocked", "Creador bloqueado", "Créateur bloqué", "Creator blockiert", "Criador bloqueado", "Creator bloccato"),
    },
  },
  audioPage: {
    back: L("Înapoi", "Back", "Atrás", "Retour", "Zurück", "Voltar", "Indietro"),
    videoCount: L(
      "{count, plural, one {# video} other {# videoclipuri}}",
      "{count, plural, one {# video} other {# videos}}",
      "{count, plural, one {# vídeo} other {# vídeos}}",
      "{count, plural, one {# vidéo} other {# vidéos}}",
      "{count, plural, one {# Video} other {# Videos}}",
      "{count, plural, one {# vídeo} other {# vídeos}}",
      "{count, plural, one {# video} other {# video}}",
    ),
    audioUnsupported: L("Browserul tău nu poate reda audio.", "Your browser can't play audio.", "Tu navegador no puede reproducir audio.", "Votre navigateur ne peut pas lire l'audio.", "Dein Browser kann kein Audio abspielen.", "Seu navegador não consegue reproduzir áudio.", "Il tuo browser non può riprodurre l'audio."),
    licenseSource: L("Sursă licență", "License source", "Fuente de la licencia", "Source de la licence", "Lizenzquelle", "Fonte da licença", "Fonte della licenza"),
    videosWithSound: L("Videoclipuri cu acest sunet", "Videos with this sound", "Vídeos con este sonido", "Vidéos avec ce son", "Videos mit diesem Sound", "Vídeos com este som", "Video con questo suono"),
    noVideos: L("Niciun videoclip încă.", "No videos yet.", "Aún no hay vídeos.", "Pas encore de vidéos.", "Noch keine Videos.", "Nenhum vídeo ainda.", "Nessun video ancora."),
  },
  flyBooking: {
    return: L("retur", "return", "vuelta", "retour", "Rückflug", "volta", "ritorno"),
    status: L("Status", "Status", "Estado", "Statut", "Status", "Status", "Stato"),
    pnr: L("Cod rezervare (PNR)", "Booking reference (PNR)", "Código de reserva (PNR)", "Référence de réservation (PNR)", "Buchungscode (PNR)", "Código de reserva (PNR)", "Codice prenotazione (PNR)"),
    total: L("Total", "Total", "Total", "Total", "Gesamt", "Total", "Totale"),
    foodPromoTitle: L("10% reducere la mâncare 🍕", "10% off food 🍕", "10% de descuento en comida 🍕", "10 % de réduction sur la nourriture 🍕", "10 % Rabatt auf Essen 🍕", "10% de desconto em comida 🍕", "10% di sconto sul cibo 🍕"),
    foodPromoSubtitle: L("Comandă prin Swypik în drum spre aeroport.", "Order via Swypik on your way to the airport.", "Pide con Swypik de camino al aeropuerto.", "Commandez via Swypik en route vers l'aéroport.", "Bestelle über Swypik auf dem Weg zum Flughafen.", "Peça pelo Swypik a caminho do aeroporto.", "Ordina con Swypik mentre vai in aeroporto."),
    statusLabel: {
      pending: L("În așteptarea plății", "Awaiting payment", "Pendiente de pago", "En attente de paiement", "Zahlung ausstehend", "Aguardando pagamento", "In attesa di pagamento"),
      paid: L("Plătit — se emite biletul", "Paid — ticket being issued", "Pagado — emitiendo el billete", "Payé — billet en cours d'émission", "Bezahlt — Ticket wird ausgestellt", "Pago — emitindo o bilhete", "Pagato — biglietto in emissione"),
      ticketed: L("Bilet emis ✈️", "Ticket issued ✈️", "Billete emitido ✈️", "Billet émis ✈️", "Ticket ausgestellt ✈️", "Bilhete emitido ✈️", "Biglietto emesso ✈️"),
      failed: L("Emitere eșuată — te contactăm", "Issuing failed — we'll contact you", "Emisión fallida — te contactaremos", "Émission échouée — nous vous contacterons", "Ausstellung fehlgeschlagen — wir melden uns", "Falha na emissão — entraremos em contato", "Emissione non riuscita — ti contatteremo"),
      cancelled: L("Anulat", "Cancelled", "Cancelado", "Annulé", "Storniert", "Cancelado", "Annullato"),
    },
  },
  conversation: {
    back: L("Înapoi", "Back", "Atrás", "Retour", "Zurück", "Voltar", "Indietro"),
    title: L("Conversație", "Conversation", "Conversación", "Conversation", "Unterhaltung", "Conversa", "Conversazione"),
  },
  postVote: {
    votes: L(
      "{count, plural, one {# vot} few {# voturi} other {# de voturi}}",
      "{count, plural, one {# vote} other {# votes}}",
      "{count, plural, one {# voto} other {# votos}}",
      "{count, plural, one {# vote} other {# votes}}",
      "{count, plural, one {# Stimme} other {# Stimmen}}",
      "{count, plural, one {# voto} other {# votos}}",
      "{count, plural, one {# voto} other {# voti}}",
    ),
    yourVote: L("votul tău", "your vote", "tu voto", "votre vote", "deine Stimme", "seu voto", "il tuo voto"),
    tapToVote: L("Apasă pe variantă pentru a vota.", "Tap an option to vote.", "Toca una opción para votar.", "Appuyez sur une option pour voter.", "Tippe auf eine Option, um abzustimmen.", "Toque em uma opção para votar.", "Tocca un'opzione per votare."),
  },
  stayDetail: {
    confirmed: L("Rezervare confirmată!", "Booking confirmed!", "¡Reserva confirmada!", "Réservation confirmée !", "Buchung bestätigt!", "Reserva confirmada!", "Prenotazione confermata!"),
    checking: L("Se verifică...", "Checking...", "Comprobando...", "Vérification...", "Wird geprüft...", "Verificando...", "Verifica in corso..."),
  },
  verticals: {
    back: L("Înapoi", "Back", "Atrás", "Retour", "Zurück", "Voltar", "Indietro"),
    emptyTitle: L("Încă nimic aici", "Nothing here yet", "Aún no hay nada aquí", "Rien ici pour l'instant", "Hier ist noch nichts", "Nada por aqui ainda", "Ancora niente qui"),
  },
  productFeed: {
    loadingClips: L("Se încarcă clipurile...", "Loading clips...", "Cargando clips...", "Chargement des clips...", "Clips werden geladen...", "Carregando clipes...", "Caricamento clip..."),
    added: L("Adăugat", "Added", "Añadido", "Ajouté", "Hinzugefügt", "Adicionado", "Aggiunto"),
    cart: L("Coș", "Cart", "Cesta", "Panier", "Warenkorb", "Carrinho", "Carrello"),
  },
  pushPrompt: {
    cardTitle: L("Activează notificările push", "Turn on push notifications", "Activa las notificaciones push", "Activez les notifications push", "Push-Benachrichtigungen aktivieren", "Ative as notificações push", "Attiva le notifiche push"),
    cardSubtitle: L("Primește alerte când ai un comentariu, un follow nou sau o comandă.", "Get alerts for new comments, follows and orders.", "Recibe alertas de nuevos comentarios, seguidores y pedidos.", "Recevez des alertes pour les commentaires, abonnés et commandes.", "Erhalte Alerts bei Kommentaren, neuen Followern oder Bestellungen.", "Receba alertas de comentários, novos seguidores e pedidos.", "Ricevi avvisi per commenti, nuovi follower e ordini."),
    close: L("Închide", "Close", "Cerrar", "Fermer", "Schließen", "Fechar", "Chiudi"),
  },
  reviewList: {
    empty: L("Niciun review încă. Fii primul care lasă o părere.", "No reviews yet. Be the first to share your opinion.", "Aún no hay reseñas. Sé el primero en opinar.", "Pas encore d'avis. Soyez le premier à donner le vôtre.", "Noch keine Bewertungen. Sei der Erste mit einer Meinung.", "Nenhuma avaliação ainda. Seja o primeiro a opinar.", "Nessuna recensione ancora. Sii il primo a lasciare un parere."),
    anonymous: L("Utilizator", "User", "Usuario", "Utilisateur", "Nutzer", "Usuário", "Utente"),
    verifiedBuyer: L("Cumpărător verificat", "Verified buyer", "Comprador verificado", "Acheteur vérifié", "Verifizierter Käufer", "Comprador verificado", "Acquirente verificato"),
    helpful: L(
      "{count, plural, one {# util} few {# utili} other {# utili}}",
      "{count, plural, one {# helpful} other {# helpful}}",
      "{count, plural, one {# útil} other {# útiles}}",
      "{count, plural, one {# utile} other {# utiles}}",
      "{count, plural, one {# hilfreich} other {# hilfreich}}",
      "{count, plural, one {# útil} other {# úteis}}",
      "{count, plural, one {# utile} other {# utili}}",
    ),
  },
  account: {
    legalTerms: L("Termeni", "Terms", "Términos", "Conditions", "AGB", "Termos", "Termini"),
    legalPrivacy: L("Confidențialitate", "Privacy", "Privacidad", "Confidentialité", "Datenschutz", "Privacidade", "Privacy"),
    legalCookies: L("Cookie-uri", "Cookies", "Cookies", "Cookies", "Cookies", "Cookies", "Cookie"),
  },
  likedVideos: {
    title: L("Videoclipuri likeuite", "Liked videos", "Vídeos que te gustan", "Vidéos aimées", "Videos mit „Gefällt mir“", "Vídeos curtidos", "Video con Mi piace"),
    empty: L("Niciun video likeuit încă.", "No liked videos yet.", "Aún no te gusta ningún vídeo.", "Pas encore de vidéos aimées.", "Noch keine Videos mit „Gefällt mir“.", "Nenhum vídeo curtido ainda.", "Nessun video con Mi piace ancora."),
  },
  liveViewer: {
    buy: L("Cumpără", "Buy", "Comprar", "Acheter", "Kaufen", "Comprar", "Acquista"),
    seeProducts: L("Vezi produse", "See products", "Ver productos", "Voir les produits", "Produkte ansehen", "Ver produtos", "Vedi prodotti"),
    productCount: L(
      "{count, plural, one {# produs} few {# produse} other {# de produse}}",
      "{count, plural, one {# product} other {# products}}",
      "{count, plural, one {# producto} other {# productos}}",
      "{count, plural, one {# produit} other {# produits}}",
      "{count, plural, one {# Produkt} other {# Produkte}}",
      "{count, plural, one {# produto} other {# produtos}}",
      "{count, plural, one {# prodotto} other {# prodotti}}",
    ),
  },
  missionDetail: {
    backToMissions: L("Înapoi la missions", "Back to missions", "Volver a las misiones", "Retour aux missions", "Zurück zu den Missionen", "Voltar às missões", "Torna alle missioni"),
  },
  postPage: {
    home: L("Acasă", "Home", "Inicio", "Accueil", "Startseite", "Início", "Home"),
  },
  searchPage: {
    title: L("Căutare", "Search", "Búsqueda", "Recherche", "Suche", "Busca", "Ricerca"),
    tabVideos: L("Videoclipuri", "Videos", "Vídeos", "Vidéos", "Videos", "Vídeos", "Video"),
    tabCreators: L("Creatori", "Creators", "Creadores", "Créateurs", "Creator", "Criadores", "Creator"),
    tabProducts: L("Produse", "Products", "Productos", "Produits", "Produkte", "Produtos", "Prodotti"),
    minChars: L("Scrie cel puțin 2 caractere pentru a căuta.", "Type at least 2 characters to search.", "Escribe al menos 2 caracteres para buscar.", "Saisissez au moins 2 caractères pour rechercher.", "Gib mindestens 2 Zeichen ein, um zu suchen.", "Digite pelo menos 2 caracteres para buscar.", "Digita almeno 2 caratteri per cercare."),
  },
  trendsPage: {
    title: L("Trends acum", "Trending now", "Tendencias ahora", "Tendances du moment", "Aktuelle Trends", "Tendências agora", "Tendenze del momento"),
    subtitle: L("Topul curent — hashtag-uri, sunete, produse și topicuri detectate AI.", "The current top — hashtags, sounds, products and topics detected by AI.", "El top actual: hashtags, sonidos, productos y temas detectados por IA.", "Le top actuel — hashtags, sons, produits et sujets détectés par l'IA.", "Die aktuellen Tops — Hashtags, Sounds, Produkte und KI-erkannte Themen.", "O top atual — hashtags, sons, produtos e tópicos detectados por IA.", "La top attuale — hashtag, suoni, prodotti e argomenti rilevati dall'IA."),
    empty: L("Niciun trend detectat încă. Cron-ul rulează la 6 ore — revino curând.", "No trends detected yet. The job runs every 6 hours — check back soon.", "Aún no se han detectado tendencias. El proceso se ejecuta cada 6 horas: vuelve pronto.", "Aucune tendance détectée pour l'instant. Le traitement s'exécute toutes les 6 heures — revenez bientôt.", "Noch keine Trends erkannt. Der Job läuft alle 6 Stunden — schau bald wieder vorbei.", "Nenhuma tendência detectada ainda. O processo roda a cada 6 horas — volte em breve.", "Nessuna tendenza rilevata ancora. Il processo gira ogni 6 ore — torna presto."),
  },
  hostBookings: {
    title: L("Rezervări primite", "Received bookings", "Reservas recibidas", "Réservations reçues", "Eingegangene Buchungen", "Reservas recebidas", "Prenotazioni ricevute"),
    cancelWarnPaid: L(
      "Anulezi rezervarea lui {name}?\n\nClientul primește înapoi TOȚI banii ({amount}), iar suma încasată se retrage din portofelul tău.\n\nAnulările dese îți pot suspenda contul de gazdă.",
      "Cancel {name}'s booking?\n\nThe guest gets ALL their money back ({amount}), and the amount received is withdrawn from your wallet.\n\nFrequent cancellations may suspend your host account.",
      "¿Cancelar la reserva de {name}?\n\nEl cliente recibe TODO su dinero de vuelta ({amount}) y el importe cobrado se retira de tu monedero.\n\nLas cancelaciones frecuentes pueden suspender tu cuenta de anfitrión.",
      "Annuler la réservation de {name} ?\n\nLe client est intégralement remboursé ({amount}) et le montant perçu est retiré de votre portefeuille.\n\nDes annulations fréquentes peuvent suspendre votre compte hôte.",
      "Buchung von {name} stornieren?\n\nDer Gast erhält das GESAMTE Geld zurück ({amount}) und der erhaltene Betrag wird aus deinem Wallet abgezogen.\n\nHäufige Stornierungen können dein Gastgeberkonto sperren.",
      "Cancelar a reserva de {name}?\n\nO cliente recebe TODO o dinheiro de volta ({amount}) e o valor recebido é retirado da sua carteira.\n\nCancelamentos frequentes podem suspender sua conta de anfitrião.",
      "Annullare la prenotazione di {name}?\n\nIl cliente riceve TUTTI i soldi indietro ({amount}) e l'importo incassato viene prelevato dal tuo wallet.\n\nAnnullamenti frequenti possono sospendere il tuo account host.",
    ),
    cancelWarnUnpaid: L("Anulezi rezervarea (neplătită) a lui {name}?", "Cancel {name}'s (unpaid) booking?", "¿Cancelar la reserva (no pagada) de {name}?", "Annuler la réservation (non payée) de {name} ?", "Die (unbezahlte) Buchung von {name} stornieren?", "Cancelar a reserva (não paga) de {name}?", "Annullare la prenotazione (non pagata) di {name}?"),
    cancelFailed: L("Anularea a eșuat.", "Cancellation failed.", "La cancelación falló.", "L'annulation a échoué.", "Stornierung fehlgeschlagen.", "O cancelamento falhou.", "Annullamento non riuscito."),
    guests: L(
      "{count, plural, one {# oaspete} few {# oaspeți} other {# de oaspeți}}",
      "{count, plural, one {# guest} other {# guests}}",
      "{count, plural, one {# huésped} other {# huéspedes}}",
      "{count, plural, one {# invité} other {# invités}}",
      "{count, plural, one {# Gast} other {# Gäste}}",
      "{count, plural, one {# hóspede} other {# hóspedes}}",
      "{count, plural, one {# ospite} other {# ospiti}}",
    ),
    paid: L("plătit", "paid", "pagado", "payé", "bezahlt", "pago", "pagato"),
    refunded: L("rambursat", "refunded", "reembolsado", "remboursé", "erstattet", "reembolsado", "rimborsato"),
    status: {
      pending: L("În așteptare", "Pending", "Pendiente", "En attente", "Ausstehend", "Pendente", "In attesa"),
      confirmed: L("Confirmată", "Confirmed", "Confirmada", "Confirmée", "Bestätigt", "Confirmada", "Confermata"),
      cancelled: L("Anulată", "Cancelled", "Cancelada", "Annulée", "Storniert", "Cancelada", "Annullata"),
      completed: L("Încheiată", "Completed", "Completada", "Terminée", "Abgeschlossen", "Concluída", "Completata"),
    },
  },
  installPrompt: {
    title: L("Instalează aplicația", "Install the app", "Instala la aplicación", "Installez l'application", "App installieren", "Instale o aplicativo", "Installa l'app"),
    subtitle: L("Adaugă Swypik pe ecranul principal pentru acces rapid și experiență nativă.", "Add Swypik to your home screen for quick access and a native experience.", "Añade Swypik a tu pantalla de inicio para un acceso rápido y una experiencia nativa.", "Ajoutez Swypik à votre écran d'accueil pour un accès rapide et une expérience native.", "Füge Swypik dem Startbildschirm hinzu — für schnellen Zugriff und natives Erlebnis.", "Adicione o Swypik à tela inicial para acesso rápido e experiência nativa.", "Aggiungi Swypik alla schermata iniziale per un accesso rapido e un'esperienza nativa."),
    installing: L("Se instalează…", "Installing…", "Instalando…", "Installation…", "Wird installiert…", "Instalando…", "Installazione…"),
    install: L("Instalează", "Install", "Instalar", "Installer", "Installieren", "Instalar", "Installa"),
    later: L("Mai târziu", "Later", "Más tarde", "Plus tard", "Später", "Mais tarde", "Più tardi"),
    close: L("Închide", "Close", "Cerrar", "Fermer", "Schließen", "Fechar", "Chiudi"),
  },
  searchBar: {
    placeholder: L("Caută produse, creatori, #hashtag-uri…", "Search products, creators, #hashtags…", "Busca productos, creadores, #hashtags…", "Recherchez des produits, créateurs, #hashtags…", "Suche Produkte, Creator, #Hashtags…", "Busque produtos, criadores, #hashtags…", "Cerca prodotti, creator, #hashtag…"),
    typeHashtag: L("Hashtag", "Hashtag", "Hashtag", "Hashtag", "Hashtag", "Hashtag", "Hashtag"),
    typeCreator: L("Creator", "Creator", "Creador", "Créateur", "Creator", "Criador", "Creator"),
    typeProduct: L("Produs", "Product", "Producto", "Produit", "Produkt", "Produto", "Prodotto"),
    typeCategory: L("Categorie", "Category", "Categoría", "Catégorie", "Kategorie", "Categoria", "Categoria"),
    searchLabel: L("Caută", "Search", "Buscar", "Rechercher", "Suchen", "Buscar", "Cerca"),
  },
  topBar: {
    categories: L("Categorii", "Categories", "Categorías", "Catégories", "Kategorien", "Categorias", "Categorie"),
    cart: L("Coș", "Cart", "Cesta", "Panier", "Warenkorb", "Carrinho", "Carrello"),
  },
  checkoutForm: {
    paidWithSwyp: L("Plătit cu SWYP", "Paid with SWYP", "Pagado con SWYP", "Payé avec SWYP", "Mit SWYP bezahlt", "Pago com SWYP", "Pagato con SWYP"),
    cardRemaining: L("De plată cu cardul", "To pay by card", "A pagar con tarjeta", "À payer par carte", "Mit Karte zu zahlen", "A pagar com cartão", "Da pagare con carta"),
  },
  chatInterface: {
    insightRating: L("Rating {rating}/5 — calitate peste medie", "Rating {rating}/5 — above-average quality", "Valoración {rating}/5 — calidad por encima de la media", "Note {rating}/5 — qualité supérieure à la moyenne", "Bewertung {rating}/5 — überdurchschnittliche Qualität", "Avaliação {rating}/5 — qualidade acima da média", "Valutazione {rating}/5 — qualità sopra la media"),
    insightOrders: L("{orders}+ comenzi — seller de încredere", "{orders}+ orders — trusted seller", "{orders}+ pedidos — vendedor de confianza", "{orders}+ commandes — vendeur de confiance", "{orders}+ Bestellungen — vertrauenswürdiger Verkäufer", "{orders}+ pedidos — vendedor confiável", "{orders}+ ordini — venditore affidabile"),
    insightSold: L("{orders}+ vândute — produs verificat", "{orders}+ sold — verified product", "{orders}+ vendidos — producto verificado", "{orders}+ vendus — produit vérifié", "{orders}+ verkauft — geprüftes Produkt", "{orders}+ vendidos — produto verificado", "{orders}+ venduti — prodotto verificato"),
    insightDiscount: L("Reducere reală de {percent}% față de prețul standard", "Real {percent}% discount vs. the standard price", "Descuento real del {percent}% frente al precio estándar", "Vraie réduction de {percent} % par rapport au prix standard", "Echter Rabatt von {percent} % gegenüber dem Standardpreis", "Desconto real de {percent}% em relação ao preço padrão", "Sconto reale del {percent}% rispetto al prezzo standard"),
    insightBestValue: L("Best value în categoria sa", "Best value in its category", "La mejor relación calidad-precio de su categoría", "Meilleur rapport qualité-prix de sa catégorie", "Bestes Preis-Leistungs-Verhältnis seiner Kategorie", "Melhor custo-benefício da categoria", "Miglior rapporto qualità-prezzo della categoria"),
    insightFastDelivery: L("Livrare rapidă — {days} zile", "Fast delivery — {days} days", "Entrega rápida — {days} días", "Livraison rapide — {days} jours", "Schnelle Lieferung — {days} Tage", "Entrega rápida — {days} dias", "Consegna rapida — {days} giorni"),
    deliveryDays: L(
      "{days, plural, one {# zi} few {# zile} other {# de zile}}",
      "{days, plural, one {# day} other {# days}}",
      "{days, plural, one {# día} other {# días}}",
      "{days, plural, one {# jour} other {# jours}}",
      "{days, plural, one {# Tag} other {# Tage}}",
      "{days, plural, one {# dia} other {# dias}}",
      "{days, plural, one {# giorno} other {# giorni}}",
    ),
    seeAllDetails: L("Vezi toate detaliile", "See all details", "Ver todos los detalles", "Voir tous les détails", "Alle Details ansehen", "Ver todos os detalhes", "Vedi tutti i dettagli"),
  },
};

// join namespace: nested additions
const JOIN_EXTRA = {
  hostApply: {
    submitted: L("Aplicație trimisă!", "Application submitted!", "¡Solicitud enviada!", "Candidature envoyée !", "Bewerbung gesendet!", "Candidatura enviada!", "Candidatura inviata!"),
    legalForm: L("Forma juridică", "Legal form", "Forma jurídica", "Forme juridique", "Rechtsform", "Forma jurídica", "Forma giuridica"),
    addressPlaceholder: L("Str. Principală nr. 12", "12 Main Street", "Calle Mayor 12", "12 rue Principale", "Hauptstraße 12", "Rua Principal, 12", "Via Principale 12"),
  },
  fleet: {
    recruitTitle: L("Recrutează pentru flota ta", "Recruit for your fleet", "Recluta para tu flota", "Recrutez pour votre flotte", "Rekrutiere für deine Flotte", "Recrute para sua frota", "Recluta per la tua flotta"),
  },
};

const LOCALES = ["ro", "en", "es", "fr", "de", "pt", "it"];

function pick(node, loc) {
  // node is either an L() object (has all locale keys as strings) or nested object
  if (typeof node === "object" && LOCALES.every((l) => typeof node[l] === "string")) return node[loc];
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = pick(v, loc);
  return out;
}

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

for (const loc of LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [ns, keys] of Object.entries(KEYS)) {
    if (!data[ns]) data[ns] = {};
    deepMerge(data[ns], pick(keys, loc));
  }
  if (!data.join) data.join = {};
  deepMerge(data.join, pick(JOIN_EXTRA, loc));
  fs.writeFileSync(file, JSON.stringify(data, null, 4) + "\n");
  console.log(`${loc}: ok`);
}
