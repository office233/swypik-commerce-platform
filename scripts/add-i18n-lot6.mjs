// One-off: add lot-6 i18n keys (seller/courier/creator/developers/apps/onboarding/legal hardcoded-RO cleanup)
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "messages");

const L = (ro, en, es, fr, de, pt, it) => ({ ro, en, es, fr, de, pt, it });

const KEYS = {
  sellerListings: {
    title: L("Anunțurile mele", "My listings", "Mis anuncios", "Mes annonces", "Meine Anzeigen", "Os meus anúncios", "I miei annunci"),
    newListing: L("Anunț nou", "New listing", "Anuncio nuevo", "Nouvelle annonce", "Neue Anzeige", "Novo anúncio", "Nuovo annuncio"),
    currency: L("Monedă", "Currency", "Moneda", "Devise", "Währung", "Moeda", "Valuta"),
    country: L("Țara", "Country", "País", "Pays", "Land", "País", "Paese"),
    city: L("Oraș", "City", "Ciudad", "Ville", "Stadt", "Cidade", "Città"),
    contactPhone: L("Telefon contact (afișat pe anunț)", "Contact phone (shown on the listing)", "Teléfono de contacto (visible en el anuncio)", "Téléphone de contact (affiché sur l'annonce)", "Kontakttelefon (in der Anzeige sichtbar)", "Telefone de contacto (visível no anúncio)", "Telefono di contatto (visibile nell'annuncio)"),
    thListing: L("Anunț", "Listing", "Anuncio", "Annonce", "Anzeige", "Anúncio", "Annuncio"),
    thLocation: L("Locație", "Location", "Ubicación", "Lieu", "Ort", "Localização", "Località"),
    thPrice: L("Preț", "Price", "Precio", "Prix", "Preis", "Preço", "Prezzo"),
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    empty: L("Niciun anunț încă. Publică primul!", "No listings yet. Publish your first one!", "Aún no hay anuncios. ¡Publica el primero!", "Aucune annonce pour l'instant. Publiez la première !", "Noch keine Anzeigen. Veröffentliche die erste!", "Ainda sem anúncios. Publica o primeiro!", "Nessun annuncio ancora. Pubblica il primo!"),
  },
  devPortal: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    subtitle: L("Construiește aplicații pentru sellerii Swypik.", "Build apps for Swypik sellers.", "Crea aplicaciones para los vendedores de Swypik.", "Créez des applications pour les vendeurs Swypik.", "Erstelle Apps für Swypik-Verkäufer.", "Cria aplicações para os vendedores Swypik.", "Crea app per i venditori Swypik."),
    registerTitle: L("Înregistrează-te ca dezvoltator", "Register as a developer", "Regístrate como desarrollador", "Inscrivez-vous comme développeur", "Als Entwickler registrieren", "Regista-te como programador", "Registrati come sviluppatore"),
    myApps: L("Aplicațiile mele", "My apps", "Mis aplicaciones", "Mes applications", "Meine Apps", "As minhas aplicações", "Le mie app"),
    noApps: L("Nu ai încă aplicații.", "You don't have any apps yet.", "Aún no tienes aplicaciones.", "Vous n'avez pas encore d'applications.", "Du hast noch keine Apps.", "Ainda não tens aplicações.", "Non hai ancora app."),
    rotateSecret: L("Regenerează secret", "Rotate secret", "Regenerar secreto", "Régénérer le secret", "Secret erneuern", "Regenerar segredo", "Rigenera secret"),
    loadingDeliveries: L("Se încarcă livrările…", "Loading deliveries…", "Cargando entregas…", "Chargement des livraisons…", "Zustellungen werden geladen…", "A carregar entregas…", "Caricamento consegne…"),
    noDeliveries: L("Nicio livrare webhook încă.", "No webhook deliveries yet.", "Aún no hay entregas de webhook.", "Aucune livraison de webhook pour l'instant.", "Noch keine Webhook-Zustellungen.", "Ainda sem entregas de webhook.", "Nessuna consegna webhook ancora."),
    thAttempts: L("Încercări", "Attempts", "Intentos", "Tentatives", "Versuche", "Tentativas", "Tentativi"),
    thDate: L("Dată", "Date", "Fecha", "Date", "Datum", "Data", "Data"),
  },
  courierEarnings: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    title: L("Câștigurile mele", "My earnings", "Mis ganancias", "Mes gains", "Meine Einnahmen", "Os meus ganhos", "I miei guadagni"),
    autoPayTitle: L("Plăți automate (Stripe)", "Automatic payouts (Stripe)", "Pagos automáticos (Stripe)", "Paiements automatiques (Stripe)", "Automatische Auszahlungen (Stripe)", "Pagamentos automáticos (Stripe)", "Pagamenti automatici (Stripe)"),
    stripeActive: L("Cont Stripe activ — retragerile se plătesc automat.", "Stripe account active — withdrawals are paid automatically.", "Cuenta de Stripe activa — los retiros se pagan automáticamente.", "Compte Stripe actif — les retraits sont payés automatiquement.", "Stripe-Konto aktiv — Auszahlungen erfolgen automatisch.", "Conta Stripe ativa — os levantamentos são pagos automaticamente.", "Account Stripe attivo — i prelievi vengono pagati automaticamente."),
    stripeIncomplete: L("Contul Stripe există dar nu e complet.", "Your Stripe account exists but is not complete.", "La cuenta de Stripe existe pero no está completa.", "Le compte Stripe existe mais n'est pas complet.", "Das Stripe-Konto existiert, ist aber unvollständig.", "A conta Stripe existe mas não está completa.", "L'account Stripe esiste ma non è completo."),
    lastTransactions: L("Ultimele tranzacții", "Latest transactions", "Últimas transacciones", "Dernières transactions", "Letzte Transaktionen", "Últimas transações", "Ultime transazioni"),
    emptyTransactions: L("Nimic încă — acceptă o livrare sau o cursă.", "Nothing yet — accept a delivery or a ride.", "Nada todavía — acepta una entrega o un viaje.", "Rien pour l'instant — acceptez une livraison ou une course.", "Noch nichts — nimm eine Lieferung oder Fahrt an.", "Ainda nada — aceita uma entrega ou uma viagem.", "Ancora niente — accetta una consegna o una corsa."),
  },
  liveStudio: {
    createAria: L("Creează stream nou", "Create new stream", "Crear nuevo stream", "Créer un nouveau stream", "Neuen Stream erstellen", "Criar novo stream", "Crea nuovo stream"),
    scheduleTitle: L("Programează stream", "Schedule stream", "Programar stream", "Programmer un stream", "Stream planen", "Agendar stream", "Programma stream"),
    cancel: L("Renunță", "Cancel", "Cancelar", "Annuler", "Abbrechen", "Cancelar", "Annulla"),
    create: L("Creează", "Create", "Crear", "Créer", "Erstellen", "Criar", "Crea"),
    empty: L("Niciun stream încă. Apasă „Stream nou”.", "No streams yet. Tap “New stream”.", "Aún no hay streams. Pulsa “Nuevo stream”.", "Aucun stream pour l'instant. Appuyez sur « Nouveau stream ».", "Noch keine Streams. Tippe auf „Neuer Stream“.", "Ainda sem streams. Toca em “Novo stream”.", "Nessuno stream ancora. Tocca “Nuovo stream”."),
    copyRtmpAria: L("Copiază URL RTMP", "Copy RTMP URL", "Copiar URL RTMP", "Copier l'URL RTMP", "RTMP-URL kopieren", "Copiar URL RTMP", "Copia URL RTMP"),
    copyKeyAria: L("Copiază Stream Key", "Copy Stream Key", "Copiar Stream Key", "Copier la Stream Key", "Stream-Key kopieren", "Copiar Stream Key", "Copia Stream Key"),
  },
  sellerProducts: {
    title: L("Produsele mele", "My products", "Mis productos", "Mes produits", "Meine Produkte", "Os meus produtos", "I miei prodotti"),
    subtitle: L("Gestionează catalogul tău de produse locale.", "Manage your local product catalog.", "Gestiona tu catálogo de productos locales.", "Gérez votre catalogue de produits locaux.", "Verwalte deinen lokalen Produktkatalog.", "Gere o teu catálogo de produtos locais.", "Gestisci il tuo catalogo di prodotti locali."),
    addAria: L("Adaugă produs nou", "Add new product", "Añadir producto nuevo", "Ajouter un nouveau produit", "Neues Produkt hinzufügen", "Adicionar novo produto", "Aggiungi nuovo prodotto"),
    thPrice: L("Preț", "Price", "Precio", "Prix", "Preis", "Preço", "Prezzo"),
    loading: L("Se încarcă...", "Loading...", "Cargando...", "Chargement...", "Wird geladen...", "A carregar...", "Caricamento..."),
    emptyTitle: L("Niciun produs adăugat.", "No products added.", "Ningún producto añadido.", "Aucun produit ajouté.", "Keine Produkte hinzugefügt.", "Nenhum produto adicionado.", "Nessun prodotto aggiunto."),
    emptySubtitle: L("Începe să vinzi adăugând primul tău produs.", "Start selling by adding your first product.", "Empieza a vender añadiendo tu primer producto.", "Commencez à vendre en ajoutant votre premier produit.", "Beginne zu verkaufen, indem du dein erstes Produkt hinzufügst.", "Começa a vender adicionando o teu primeiro produto.", "Inizia a vendere aggiungendo il tuo primo prodotto."),
  },
  appStore: {
    subtitle: L("Extinde-ți magazinul cu aplicații create de dezvoltatori.", "Extend your shop with apps built by developers.", "Amplía tu tienda con aplicaciones creadas por desarrolladores.", "Étendez votre boutique avec des applications créées par des développeurs.", "Erweitere deinen Shop mit von Entwicklern erstellten Apps.", "Expande a tua loja com aplicações criadas por programadores.", "Estendi il tuo negozio con app create dagli sviluppatori."),
    searchPlaceholder: L("Caută aplicații…", "Search apps…", "Buscar aplicaciones…", "Rechercher des applications…", "Apps suchen…", "Pesquisar aplicações…", "Cerca app…"),
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    empty: L("Nicio aplicație găsită.", "No apps found.", "No se encontraron aplicaciones.", "Aucune application trouvée.", "Keine Apps gefunden.", "Nenhuma aplicação encontrada.", "Nessuna app trovata."),
  },
  appDetail: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    notFound: L("Aplicația nu există.", "This app does not exist.", "La aplicación no existe.", "Cette application n'existe pas.", "Diese App existiert nicht.", "A aplicação não existe.", "L'app non esiste."),
    backToStore: L("Înapoi la App Store", "Back to App Store", "Volver al App Store", "Retour à l'App Store", "Zurück zum App Store", "Voltar à App Store", "Torna all'App Store"),
    cancel: L("Anulează", "Cancel", "Cancelar", "Annuler", "Abbrechen", "Cancelar", "Annulla"),
    loginPrompt: L("Loghează-te ca seller pentru a instala această aplicație.", "Log in as a seller to install this app.", "Inicia sesión como vendedor para instalar esta aplicación.", "Connectez-vous en tant que vendeur pour installer cette application.", "Melde dich als Verkäufer an, um diese App zu installieren.", "Inicia sessão como vendedor para instalar esta aplicação.", "Accedi come venditore per installare questa app."),
  },
  courierPwa: {
    waitingOrders: L("Aștept comenzi… GPS-ul se trimite la 10s.", "Waiting for orders… GPS is sent every 10s.", "Esperando pedidos… El GPS se envía cada 10 s.", "En attente de commandes… Le GPS est envoyé toutes les 10 s.", "Warte auf Bestellungen… GPS wird alle 10 s gesendet.", "À espera de encomendas… O GPS é enviado a cada 10 s.", "In attesa di ordini… Il GPS viene inviato ogni 10 s."),
    newRide: L("Cursă nouă!", "New ride!", "¡Nuevo viaje!", "Nouvelle course !", "Neue Fahrt!", "Nova viagem!", "Nuova corsa!"),
    newOrder: L("Comandă nouă!", "New order!", "¡Nuevo pedido!", "Nouvelle commande !", "Neue Bestellung!", "Nova encomenda!", "Nuovo ordine!"),
    orderLabel: L("Comandă:", "Order:", "Pedido:", "Commande :", "Bestellung:", "Encomenda:", "Ordine:"),
    rideInProgress: L("Cursă în curs", "Ride in progress", "Viaje en curso", "Course en cours", "Fahrt läuft", "Viagem em curso", "Corsa in corso"),
  },
  courierCode: {
    backAria: L("Înapoi", "Back", "Atrás", "Retour", "Zurück", "Voltar", "Indietro"),
    totalReferred: L("Total aduși", "Total referred", "Total referidos", "Total parrainés", "Insgesamt geworben", "Total angariados", "Totale invitati"),
    earned: L("Câștigați", "Earned", "Ganado", "Gagné", "Verdient", "Ganho", "Guadagnato"),
  },
  courierEarningsTab: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    tip: L("Bacșiș", "Tip", "Propina", "Pourboire", "Trinkgeld", "Gorjeta", "Mancia"),
    ibanPlaceholder: L("IBAN (opțional)", "IBAN (optional)", "IBAN (opcional)", "IBAN (facultatif)", "IBAN (optional)", "IBAN (opcional)", "IBAN (facoltativo)"),
  },
  sellerMerchant: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    subtitle: L("Panou comenzi live — se actualizează la 10s", "Live orders panel — refreshes every 10s", "Panel de pedidos en vivo — se actualiza cada 10 s", "Panneau de commandes en direct — actualisé toutes les 10 s", "Live-Bestellpanel — aktualisiert alle 10 s", "Painel de encomendas ao vivo — atualiza a cada 10 s", "Pannello ordini live — si aggiorna ogni 10 s"),
    pricePlaceholder: L("Preț (lei)", "Price (RON)", "Precio (RON)", "Prix (RON)", "Preis (RON)", "Preço (RON)", "Prezzo (RON)"),
  },
  sellerStaysCalendar: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    pricePerNight: L("Preț/noapte (lei)", "Price/night (RON)", "Precio/noche (RON)", "Prix/nuit (RON)", "Preis/Nacht (RON)", "Preço/noite (RON)", "Prezzo/notte (RON)"),
  },
  selenaAssistant: {
    title: L("Selena — asistent AI pentru vânzări", "Selena — AI sales assistant", "Selena — asistente de ventas con IA", "Selena — assistante IA pour les ventes", "Selena — KI-Verkaufsassistentin", "Selena — assistente de vendas com IA", "Selena — assistente IA per le vendite"),
    limitReached: L("Limită atinsă", "Limit reached", "Límite alcanzado", "Limite atteinte", "Limit erreicht", "Limite atingido", "Limite raggiunto"),
  },
  creatorProfile: {
    statVideos: L("Clipuri", "Videos", "Vídeos", "Vidéos", "Videos", "Vídeos", "Video"),
    statViews: L("Vizualizări", "Views", "Visualizaciones", "Vues", "Aufrufe", "Visualizações", "Visualizzazioni"),
    statLikes: L("Aprecieri", "Likes", "Me gusta", "J'aime", "Likes", "Gostos", "Mi piace"),
  },
  onboarding: {
    title: L("Alege ce vrei să vezi", "Choose what you want to see", "Elige lo que quieres ver", "Choisissez ce que vous voulez voir", "Wähle, was du sehen möchtest", "Escolhe o que queres ver", "Scegli cosa vuoi vedere"),
  },
  sellerLayout: {
    sellerAccount: L("Cont Vânzător", "Seller Account", "Cuenta de Vendedor", "Compte Vendeur", "Verkäuferkonto", "Conta de Vendedor", "Account Venditore"),
  },
  sellerReturns: {
    acceptAria: L("Acceptă cererea și restituie banii", "Accept the request and refund the money", "Acepta la solicitud y devuelve el dinero", "Acceptez la demande et remboursez l'argent", "Anfrage annehmen und Geld zurückerstatten", "Aceita o pedido e devolve o dinheiro", "Accetta la richiesta e rimborsa il denaro"),
  },
  legalLayout: {
    terms: L("Termeni", "Terms", "Términos", "Conditions", "AGB", "Termos", "Termini"),
    privacy: L("Confidențialitate", "Privacy", "Privacidad", "Confidentialité", "Datenschutz", "Privacidade", "Privacy"),
    cookies: L("Cookie-uri", "Cookies", "Cookies", "Cookies", "Cookies", "Cookies", "Cookie"),
    anpc: L("Protecția consumatorului (ANPC)", "Consumer protection (ANPC)", "Protección del consumidor (ANPC)", "Protection des consommateurs (ANPC)", "Verbraucherschutz (ANPC)", "Proteção do consumidor (ANPC)", "Tutela dei consumatori (ANPC)"),
    backHome: L("Înapoi acasă", "Back home", "Volver al inicio", "Retour à l'accueil", "Zurück zur Startseite", "Voltar ao início", "Torna alla home"),
  },
  legalCookies: {
    preferencesTitle: L("Preferințe", "Preferences", "Preferencias", "Préférences", "Einstellungen", "Preferências", "Preferenze"),
  },
  legalTerms: {
    title: L("Termeni și Condiții", "Terms and Conditions", "Términos y Condiciones", "Conditions Générales", "Allgemeine Geschäftsbedingungen", "Termos e Condições", "Termini e Condizioni"),
    lastUpdated: L("Ultima actualizare: {date}", "Last updated: {date}", "Última actualización: {date}", "Dernière mise à jour : {date}", "Zuletzt aktualisiert: {date}", "Última atualização: {date}", "Ultimo aggiornamento: {date}"),
    summary: L("Pe scurt: prețul afișat e prețul final, politicile de anulare sunt la vedere înainte de plată, iar drepturile tale legale de consumator rămân mereu intacte.", "In short: the displayed price is the final price, cancellation policies are visible before payment, and your legal consumer rights always remain intact.", "En resumen: el precio mostrado es el precio final, las políticas de cancelación son visibles antes del pago y tus derechos legales como consumidor permanecen siempre intactos.", "En bref : le prix affiché est le prix final, les politiques d'annulation sont visibles avant le paiement et vos droits légaux de consommateur restent toujours intacts.", "Kurz gesagt: Der angezeigte Preis ist der Endpreis, Stornierungsrichtlinien sind vor der Zahlung sichtbar und deine gesetzlichen Verbraucherrechte bleiben stets unangetastet.", "Em resumo: o preço apresentado é o preço final, as políticas de cancelamento são visíveis antes do pagamento e os teus direitos legais de consumidor permanecem sempre intactos.", "In breve: il prezzo mostrato è quello finale, le politiche di cancellazione sono visibili prima del pagamento e i tuoi diritti legali di consumatore restano sempre intatti."),
  },
  legalPrivacy: {
    title: L("Politica de confidențialitate", "Privacy Policy", "Política de privacidad", "Politique de confidentialité", "Datenschutzerklärung", "Política de privacidade", "Informativa sulla privacy"),
    lastUpdated: L("Ultima actualizare: {date}", "Last updated: {date}", "Última actualización: {date}", "Dernière mise à jour : {date}", "Zuletzt aktualisiert: {date}", "Última atualização: {date}", "Ultimo aggiornamento: {date}"),
    summary: L("Pe scurt: colectăm doar ce e necesar, criptăm ce e sensibil, nu vindem datele nimănui și le poți controla oricând. Detaliile complete, mai jos.", "In short: we collect only what is necessary, encrypt what is sensitive, never sell your data and you can control it at any time. Full details below.", "En resumen: recopilamos solo lo necesario, ciframos lo sensible, no vendemos tus datos a nadie y puedes controlarlos en cualquier momento. Detalles completos abajo.", "En bref : nous ne collectons que le nécessaire, chiffrons ce qui est sensible, ne vendons vos données à personne et vous pouvez les contrôler à tout moment. Détails complets ci-dessous.", "Kurz gesagt: Wir erfassen nur das Nötige, verschlüsseln Sensibles, verkaufen deine Daten an niemanden und du kannst sie jederzeit kontrollieren. Alle Details unten.", "Em resumo: recolhemos apenas o necessário, encriptamos o que é sensível, não vendemos os teus dados a ninguém e podes controlá-los a qualquer momento. Detalhes completos abaixo.", "In breve: raccogliamo solo il necessario, criptiamo ciò che è sensibile, non vendiamo i tuoi dati a nessuno e puoi controllarli in qualsiasi momento. Dettagli completi qui sotto."),
  },
  legalAnpc: {
    title: L("Protecția consumatorului", "Consumer protection", "Protección del consumidor", "Protection des consommateurs", "Verbraucherschutz", "Proteção do consumidor", "Tutela dei consumatori"),
    intro: L("Ai drepturi garantate de lege atunci când cumperi online, iar noi nu le putem limita prin niciun termen contractual. Mai jos, ce poți face dacă ceva nu merge bine.", "You have rights guaranteed by law when you buy online, and we cannot limit them through any contractual term. Below, what you can do if something goes wrong.", "Tienes derechos garantizados por la ley al comprar en línea, y no podemos limitarlos mediante ningún término contractual. A continuación, qué puedes hacer si algo sale mal.", "Vous avez des droits garantis par la loi lorsque vous achetez en ligne, et nous ne pouvons les limiter par aucune clause contractuelle. Ci-dessous, ce que vous pouvez faire si quelque chose ne va pas.", "Beim Online-Kauf hast du gesetzlich garantierte Rechte, die wir durch keine Vertragsklausel einschränken können. Unten erfährst du, was du tun kannst, wenn etwas schiefgeht.", "Tens direitos garantidos por lei quando compras online e não os podemos limitar por nenhum termo contratual. Abaixo, o que podes fazer se algo correr mal.", "Hai diritti garantiti dalla legge quando acquisti online e non possiamo limitarli con alcuna clausola contrattuale. Qui sotto, cosa puoi fare se qualcosa va storto."),
    whereTitle: L("Unde te poți adresa", "Where you can turn to", "A dónde puedes acudir", "Où vous adresser", "An wen du dich wenden kannst", "A quem podes recorrer", "A chi puoi rivolgerti"),
    rightsTitle: L("Drepturile tale principale", "Your main rights", "Tus derechos principales", "Vos droits principaux", "Deine wichtigsten Rechte", "Os teus direitos principais", "I tuoi diritti principali"),
    r1Strong: L("Retragere în 14 zile", "Withdrawal within 14 days", "Desistimiento en 14 días", "Rétractation sous 14 jours", "Widerruf innerhalb von 14 Tagen", "Retratação em 14 dias", "Recesso entro 14 giorni"),
    r1Text: L(" — pentru produse cumpărate online, fără să motivezi. Există excepții legale (mâncare, produse personalizate, cazări cu dată determinată) — le găsești în ", " — for products bought online, without giving a reason. There are legal exceptions (food, personalized products, stays with a fixed date) — you can find them in ", " — para productos comprados en línea, sin justificación. Existen excepciones legales (comida, productos personalizados, alojamientos con fecha determinada) — las encuentras en ", " — pour les produits achetés en ligne, sans justification. Il existe des exceptions légales (nourriture, produits personnalisés, hébergements à date fixe) — vous les trouverez dans ", " — für online gekaufte Produkte, ohne Angabe von Gründen. Es gibt gesetzliche Ausnahmen (Lebensmittel, personalisierte Produkte, Unterkünfte mit festem Datum) — du findest sie in ", " — para produtos comprados online, sem justificação. Existem exceções legais (comida, produtos personalizados, estadias com data fixa) — encontra-las em ", " — per prodotti acquistati online, senza motivazione. Esistono eccezioni legali (cibo, prodotti personalizzati, soggiorni con data fissa) — le trovi in "),
    r1Link: L("Termeni, secțiunea 5", "Terms, section 5", "Términos, sección 5", "Conditions, section 5", "AGB, Abschnitt 5", "Termos, secção 5", "Termini, sezione 5"),
    r2Strong: L("Garanție legală de conformitate 2 ani", "2-year legal conformity guarantee", "Garantía legal de conformidad de 2 años", "Garantie légale de conformité de 2 ans", "2 Jahre gesetzliche Gewährleistung", "Garantia legal de conformidade de 2 anos", "Garanzia legale di conformità di 2 anni"),
    r2Text: L(" — pentru produse neconforme ai dreptul la reparare, înlocuire sau restituirea banilor.", " — for non-conforming products you are entitled to repair, replacement or a refund.", " — para productos no conformes tienes derecho a reparación, sustitución o reembolso.", " — pour les produits non conformes, vous avez droit à la réparation, au remplacement ou au remboursement.", " — bei mangelhaften Produkten hast du Anspruch auf Reparatur, Ersatz oder Rückerstattung.", " — para produtos não conformes tens direito a reparação, substituição ou reembolso.", " — per prodotti non conformi hai diritto a riparazione, sostituzione o rimborso."),
    r3Strong: L("Preț final afișat", "Final price displayed", "Precio final mostrado", "Prix final affiché", "Angezeigter Endpreis", "Preço final apresentado", "Prezzo finale mostrato"),
    r3Text: L(" — prețul pe care îl vezi include TVA și nu poate crește la finalul comenzii.", " — the price you see includes VAT and cannot increase at checkout.", " — el precio que ves incluye IVA y no puede aumentar al finalizar el pedido.", " — le prix que vous voyez inclut la TVA et ne peut pas augmenter à la fin de la commande.", " — der angezeigte Preis enthält die MwSt. und kann am Ende der Bestellung nicht steigen.", " — o preço que vês inclui IVA e não pode aumentar no final da encomenda.", " — il prezzo che vedi include l'IVA e non può aumentare alla fine dell'ordine."),
    r4Strong: L("Informare corectă", "Fair information", "Información correcta", "Information correcte", "Korrekte Information", "Informação correta", "Informazione corretta"),
    r4Text: L(" — trebuie să știi cine e vânzătorul real. Pe Swypik îți spunem la fiecare serviciu dacă suntem intermediari sau vânzător.", " — you must know who the real seller is. On Swypik we tell you for each service whether we are an intermediary or the seller.", " — debes saber quién es el vendedor real. En Swypik te decimos en cada servicio si somos intermediarios o vendedores.", " — vous devez savoir qui est le vendeur réel. Sur Swypik, nous vous indiquons pour chaque service si nous sommes intermédiaires ou vendeur.", " — du musst wissen, wer der tatsächliche Verkäufer ist. Auf Swypik sagen wir dir bei jedem Dienst, ob wir Vermittler oder Verkäufer sind.", " — deves saber quem é o vendedor real. No Swypik dizemos-te em cada serviço se somos intermediários ou vendedores.", " — devi sapere chi è il venditore reale. Su Swypik ti diciamo per ogni servizio se siamo intermediari o venditori."),
    operatorTitle: L("Operatorul platformei", "Platform operator", "Operador de la plataforma", "Opérateur de la plateforme", "Plattformbetreiber", "Operador da plataforma", "Operatore della piattaforma"),
    linkTerms: L("Termeni și Condiții", "Terms and Conditions", "Términos y Condiciones", "Conditions Générales", "AGB", "Termos e Condições", "Termini e Condizioni"),
    linkPrivacy: L("Politica de confidențialitate", "Privacy Policy", "Política de privacidad", "Politique de confidentialité", "Datenschutzerklärung", "Política de privacidade", "Informativa sulla privacy"),
    linkCookies: L("Cookie-uri", "Cookies", "Cookies", "Cookies", "Cookies", "Cookies", "Cookie"),
  },
};

const locales = ["ro", "en", "es", "fr", "de", "pt", "it"];
for (const loc of locales) {
  const file = path.join(dir, `${loc}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let added = 0;
  for (const [ns, keys] of Object.entries(KEYS)) {
    data[ns] = data[ns] || {};
    for (const [k, vals] of Object.entries(keys)) {
      if (!(k in data[ns])) {
        data[ns][k] = vals[loc];
        added++;
      }
    }
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`${loc}: +${added} keys`);
}
