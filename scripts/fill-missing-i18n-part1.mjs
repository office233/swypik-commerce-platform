// P1a: completează cheile lipsă — accountOrders, ageverification, becomeacreator, reviewForm, settingsClient, stripeConnectCard, join
// Traduceri reale per limbă (nu copii). Cheile sunt setate DOAR dacă lipsesc.
import fs from "node:fs";

export const T1 = {
  accountOrders: {
    cantitate: { en: "Qty: {qty} × {unit}", es: "Cant: {qty} × {unit}", fr: "Qté : {qty} × {unit}", de: "Menge: {qty} × {unit}", pt: "Qtd: {qty} × {unit}", it: "Qtà: {qty} × {unit}" },
    headerComenzi: { en: "My orders", es: "Mis pedidos", fr: "Mes commandes", de: "Meine Bestellungen", pt: "Meus pedidos", it: "I miei ordini" },
    produs: { en: "product", es: "producto", fr: "produit", de: "Produkt", pt: "produto", it: "prodotto" },
    produse: { en: "products", es: "productos", fr: "produits", de: "Produkte", pt: "produtos", it: "prodotti" },
    reducere: { en: "Discount", es: "Descuento", fr: "Réduction", de: "Rabatt", pt: "Desconto", it: "Sconto" },
    status: { en: "Status", es: "Estado", fr: "Statut", de: "Status", pt: "Estado", it: "Stato" },
    statusCancelled: { en: "Cancelled", es: "Cancelado", fr: "Annulée", de: "Storniert", pt: "Cancelado", it: "Annullato" },
    statusDelivered: { en: "Delivered", es: "Entregado", fr: "Livrée", de: "Zugestellt", pt: "Entregue", it: "Consegnato" },
    statusFulfilled: { en: "Shipped", es: "Enviado", fr: "Expédiée", de: "Versandt", pt: "Enviado", it: "Spedito" },
    statusPaid: { en: "Paid", es: "Pagado", fr: "Payée", de: "Bezahlt", pt: "Pago", it: "Pagato" },
    statusPending: { en: "Pending", es: "Pendiente", fr: "En attente", de: "Ausstehend", pt: "Pendente", it: "In attesa" },
    statusProcessing: { en: "Processing", es: "En proceso", fr: "En traitement", de: "In Bearbeitung", pt: "Em processamento", it: "In elaborazione" },
    statusRefunded: { en: "Refunded", es: "Reembolsado", fr: "Remboursée", de: "Erstattet", pt: "Reembolsado", it: "Rimborsato" },
    statusReturnRequested: { en: "Return requested", es: "Devolución solicitada", fr: "Retour demandé", de: "Rücksendung angefragt", pt: "Devolução solicitada", it: "Reso richiesto" },
    subtotal: { en: "Subtotal", es: "Subtotal", fr: "Sous-total", de: "Zwischensumme", pt: "Subtotal", it: "Subtotale" },
    total: { en: "Total", es: "Total", fr: "Total", de: "Gesamt", pt: "Total", it: "Totale" },
    transport: { en: "Shipping", es: "Envío", fr: "Livraison", de: "Versand", pt: "Envio", it: "Spedizione" },
    tva: { en: "VAT", es: "IVA", fr: "TVA", de: "MwSt.", pt: "IVA", it: "IVA" },
  },
  ageverificationAgeVerification: {
    btnSePregateste: { en: "Preparing...", es: "Preparando...", fr: "Préparation...", de: "Wird vorbereitet...", pt: "A preparar...", it: "Preparazione..." },
    ctaReia: { en: "Resume verification", es: "Reanudar la verificación", fr: "Reprendre la vérification", de: "Verifizierung fortsetzen", pt: "Retomar a verificação", it: "Riprendi la verifica" },
    ctaReverifica: { en: "Re-verify (replace document)", es: "Reverificar (reemplazar documento)", fr: "Revérifier (remplacer le document)", de: "Erneut verifizieren (Dokument ersetzen)", pt: "Verificar novamente (substituir documento)", it: "Riverifica (sostituisci documento)" },
    ctaVerifica: { en: "Verify my age", es: "Verificar mi edad", fr: "Vérifier mon âge", de: "Mein Alter verifizieren", pt: "Verificar a minha idade", it: "Verifica la mia età" },
    errNecunoscuta: { en: "Unknown error.", es: "Error desconocido.", fr: "Erreur inconnue.", de: "Unbekannter Fehler.", pt: "Erro desconhecido.", it: "Errore sconosciuto." },
    errOptIn: { en: "We couldn't save your preference.", es: "No pudimos guardar la preferencia.", fr: "Impossible d'enregistrer la préférence.", de: "Die Einstellung konnte nicht gespeichert werden.", pt: "Não foi possível guardar a preferência.", it: "Impossibile salvare la preferenza." },
    errStart: { en: "We couldn't start the verification.", es: "No pudimos iniciar la verificación.", fr: "Impossible de démarrer la vérification.", de: "Die Verifizierung konnte nicht gestartet werden.", pt: "Não foi possível iniciar a verificação.", it: "Impossibile avviare la verifica." },
    motivRespingere: { en: "Rejection reason: {reason}", es: "Motivo del rechazo: {reason}", fr: "Motif du rejet : {reason}", de: "Ablehnungsgrund: {reason}", pt: "Motivo da rejeição: {reason}", it: "Motivo del rifiuto: {reason}" },
    statusCurent: { en: "Current status", es: "Estado actual", fr: "Statut actuel", de: "Aktueller Status", pt: "Estado atual", it: "Stato attuale" },
    statusExpirat: { en: "Expired", es: "Caducado", fr: "Expiré", de: "Abgelaufen", pt: "Expirado", it: "Scaduto" },
    statusNeverificat: { en: "Not verified", es: "No verificado", fr: "Non vérifié", de: "Nicht verifiziert", pt: "Não verificado", it: "Non verificato" },
    statusPending: { en: "Verification in progress", es: "Verificación en curso", fr: "Vérification en cours", de: "Verifizierung läuft", pt: "Verificação em curso", it: "Verifica in corso" },
    statusRespins: { en: "Rejected", es: "Rechazado", fr: "Rejeté", de: "Abgelehnt", pt: "Rejeitado", it: "Rifiutato" },
    statusVerificat: { en: "Verified", es: "Verificado", fr: "Vérifié", de: "Verifiziert", pt: "Verificado", it: "Verificato" },
  },
  becomeacreator: {
    benefit1Body: { en: "Film straight from the app and reach a vertical audience with buying intent.", es: "Graba directamente desde la app y llega a una audiencia vertical con intención de compra.", fr: "Filmez directement depuis l'app et touchez une audience verticale avec intention d'achat.", de: "Filme direkt aus der App und erreiche ein vertikales Publikum mit Kaufabsicht.", pt: "Filme diretamente da app e alcance uma audiência vertical com intenção de compra.", it: "Gira direttamente dall'app e raggiungi un pubblico verticale con intenzione d'acquisto." },
    benefit1Title: { en: "Post TikTok-style clips", es: "Publica clips estilo TikTok", fr: "Publiez des clips façon TikTok", de: "Poste Clips im TikTok-Stil", pt: "Publique clipes estilo TikTok", it: "Pubblica clip in stile TikTok" },
    benefit2Body: { en: "You automatically earn a share of the orders generated through your clips.", es: "Recibes automáticamente un porcentaje de los pedidos generados por tus clips.", fr: "Vous recevez automatiquement un pourcentage des commandes générées par vos clips.", de: "Du erhältst automatisch einen Anteil der über deine Clips generierten Bestellungen.", pt: "Recebe automaticamente uma percentagem dos pedidos gerados pelos seus clipes.", it: "Ricevi automaticamente una percentuale degli ordini generati dai tuoi clip." },
    benefit2Title: { en: "Commission on every sale", es: "Comisión por cada venta", fr: "Commission sur chaque vente", de: "Provision bei jedem Verkauf", pt: "Comissão em cada venda", it: "Commissione su ogni vendita" },
    benefit3Body: { en: "Earn SWYP points for engagement and turn them into real benefits.", es: "Gana puntos SWYP por el engagement y conviértelos en beneficios reales.", fr: "Gagnez des points SWYP pour l'engagement et convertissez-les en avantages réels.", de: "Verdiene SWYP-Punkte für Engagement und wandle sie in echte Vorteile um.", pt: "Ganhe pontos SWYP pelo engagement e converta-os em benefícios reais.", it: "Guadagna punti SWYP per l'engagement e convertili in vantaggi reali." },
    benefit3Title: { en: "SWYP rewards", es: "Recompensas SWYP", fr: "Récompenses SWYP", de: "SWYP-Belohnungen", pt: "Recompensas SWYP", it: "Premi SWYP" },
    benefit4Body: { en: "Swypik users come to discover products — your content has direct impact.", es: "Los usuarios de Swypik vienen a descubrir productos: tu contenido tiene impacto directo.", fr: "Les utilisateurs Swypik viennent découvrir des produits — votre contenu a un impact direct.", de: "Swypik-Nutzer kommen, um Produkte zu entdecken — dein Content hat direkten Einfluss.", pt: "Os utilizadores Swypik vêm descobrir produtos — o seu conteúdo tem impacto direto.", it: "Gli utenti Swypik vengono per scoprire prodotti — il tuo contenuto ha un impatto diretto." },
    benefit4Title: { en: "Shopping-focused audience", es: "Audiencia enfocada en compras", fr: "Audience dédiée au shopping", de: "Shopping-fokussiertes Publikum", pt: "Audiência dedicada às compras", it: "Pubblico dedicato allo shopping" },
    metaDescription: { en: "Post clips, earn sales commissions and SWYP rewards. Join the Swypik creator network.", es: "Publica clips, gana comisiones por ventas y recompensas SWYP. Únete a la red de creadores Swypik.", fr: "Publiez des clips, gagnez des commissions et des récompenses SWYP. Rejoignez le réseau de créateurs Swypik.", de: "Poste Clips, verdiene Verkaufsprovisionen und SWYP-Belohnungen. Werde Teil des Swypik-Creator-Netzwerks.", pt: "Publique clipes, ganhe comissões de vendas e recompensas SWYP. Junte-se à rede de criadores Swypik.", it: "Pubblica clip, guadagna commissioni sulle vendite e premi SWYP. Unisciti alla rete di creator Swypik." },
    metaTitle: { en: "Become a creator on Swypik", es: "Conviértete en creador en Swypik", fr: "Devenez créateur sur Swypik", de: "Werde Creator auf Swypik", pt: "Torne-se criador na Swypik", it: "Diventa creator su Swypik" },
  },
  reviewForm: {
    ariaRating: { en: "Star rating", es: "Calificación de estrellas", fr: "Note en étoiles", de: "Sternebewertung", pt: "Classificação por estrelas", it: "Valutazione a stelle" },
    ariaStele: { en: "{n} stars", es: "{n} estrellas", fr: "{n} étoiles", de: "{n} Sterne", pt: "{n} estrelas", it: "{n} stelle" },
    btnSeTrimite: { en: "Sending…", es: "Enviando…", fr: "Envoi…", de: "Wird gesendet…", pt: "A enviar…", it: "Invio…" },
    btnTrimite: { en: "Submit review", es: "Enviar reseña", fr: "Envoyer l'avis", de: "Bewertung senden", pt: "Enviar avaliação", it: "Invia recensione" },
    errAuth: { en: "You must be signed in.", es: "Debes iniciar sesión.", fr: "Vous devez être connecté.", de: "Du musst angemeldet sein.", pt: "Tem de iniciar sessão.", it: "Devi effettuare l'accesso." },
    errDeja: { en: "You already reviewed this product.", es: "Ya has dejado una reseña para este producto.", fr: "Vous avez déjà laissé un avis pour ce produit.", de: "Du hast dieses Produkt bereits bewertet.", pt: "Já avaliou este produto.", it: "Hai già recensito questo prodotto." },
    errGenerica: { en: "Something went wrong.", es: "Ocurrió un error.", fr: "Une erreur est survenue.", de: "Ein Fehler ist aufgetreten.", pt: "Ocorreu um erro.", it: "Si è verificato un errore." },
    errRating: { en: "Select a rating between 1 and 5 stars.", es: "Selecciona una calificación entre 1 y 5 estrellas.", fr: "Sélectionnez une note entre 1 et 5 étoiles.", de: "Wähle eine Bewertung zwischen 1 und 5 Sternen.", pt: "Selecione uma classificação entre 1 e 5 estrelas.", it: "Seleziona una valutazione tra 1 e 5 stelle." },
    errRetea: { en: "A network error occurred.", es: "Ocurrió un error de red.", fr: "Une erreur réseau est survenue.", de: "Ein Netzwerkfehler ist aufgetreten.", pt: "Ocorreu um erro de rede.", it: "Si è verificato un errore di rete." },
    labelParere: { en: "Your opinion", es: "Tu opinión", fr: "Votre avis", de: "Deine Meinung", pt: "A sua opinião", it: "La tua opinione" },
    labelRating: { en: "Rating", es: "Calificación", fr: "Note", de: "Bewertung", pt: "Classificação", it: "Valutazione" },
    labelTitlu: { en: "Title (optional)", es: "Título (opcional)", fr: "Titre (facultatif)", de: "Titel (optional)", pt: "Título (opcional)", it: "Titolo (facoltativo)" },
  },
  settingsClient: {
    ariaInapoi: { en: "Back to profile", es: "Volver al perfil", fr: "Retour au profil", de: "Zurück zum Profil", pt: "Voltar ao perfil", it: "Torna al profilo" },
    headerTitle: { en: "Settings", es: "Ajustes", fr: "Paramètres", de: "Einstellungen", pt: "Definições", it: "Impostazioni" },
    itemAdmin: { en: "Admin Dashboard", es: "Panel de administración", fr: "Tableau de bord admin", de: "Admin-Dashboard", pt: "Painel de administração", it: "Dashboard admin" },
    itemAdrese: { en: "Delivery addresses", es: "Direcciones de entrega", fr: "Adresses de livraison", de: "Lieferadressen", pt: "Moradas de entrega", it: "Indirizzi di consegna" },
    itemComenzi: { en: "My orders", es: "Mis pedidos", fr: "Mes commandes", de: "Meine Bestellungen", pt: "Meus pedidos", it: "I miei ordini" },
    itemDeconnect: { en: "Sign out", es: "Cerrar sesión", fr: "Se déconnecter", de: "Abmelden", pt: "Terminar sessão", it: "Esci" },
    itemDevinoSeller: { en: "Become a seller", es: "Conviértete en vendedor", fr: "Devenir vendeur", de: "Verkäufer werden", pt: "Torne-se vendedor", it: "Diventa venditore" },
    itemEditeaza: { en: "Edit profile", es: "Editar perfil", fr: "Modifier le profil", de: "Profil bearbeiten", pt: "Editar perfil", it: "Modifica profilo" },
    itemLimba: { en: "Language & currency", es: "Idioma y moneda", fr: "Langue et devise", de: "Sprache & Währung", pt: "Idioma e moeda", it: "Lingua e valuta" },
    itemNotificari: { en: "Notifications", es: "Notificaciones", fr: "Notifications", de: "Benachrichtigungen", pt: "Notificações", it: "Notifiche" },
    itemSeDeconnect: { en: "Signing out…", es: "Cerrando sesión…", fr: "Déconnexion…", de: "Abmeldung…", pt: "A terminar sessão…", it: "Uscita…" },
    itemSecuritate: { en: "Security & password", es: "Seguridad y contraseña", fr: "Sécurité et mot de passe", de: "Sicherheit & Passwort", pt: "Segurança e palavra-passe", it: "Sicurezza e password" },
    itemSeller: { en: "Seller Dashboard", es: "Panel de vendedor", fr: "Tableau de bord vendeur", de: "Verkäufer-Dashboard", pt: "Painel de vendedor", it: "Dashboard venditore" },
    itemSellerPending: { en: "Seller application under review", es: "Solicitud de vendedor en revisión", fr: "Candidature vendeur en cours d'examen", de: "Verkäuferantrag in Prüfung", pt: "Candidatura de vendedor em análise", it: "Candidatura venditore in revisione" },
    itemWallet: { en: "SWYP wallet", es: "Cartera SWYP", fr: "Portefeuille SWYP", de: "SWYP-Wallet", pt: "Carteira SWYP", it: "Portafoglio SWYP" },
  },
  stripeConnectCard: {
    badgeNeconectat: { en: "NOT CONNECTED", es: "NO CONECTADO", fr: "NON CONNECTÉ", de: "NICHT VERBUNDEN", pt: "NÃO LIGADO", it: "NON COLLEGATO" },
    badgePending: { en: "PENDING", es: "PENDIENTE", fr: "EN ATTENTE", de: "AUSSTEHEND", pt: "PENDENTE", it: "IN ATTESA" },
    badgeVerificat: { en: "VERIFIED", es: "VERIFICADO", fr: "VÉRIFIÉ", de: "VERIFIZIERT", pt: "VERIFICADO", it: "VERIFICATO" },
    btnConecteaza: { en: "Connect Stripe", es: "Conectar Stripe", fr: "Connecter Stripe", de: "Stripe verbinden", pt: "Ligar Stripe", it: "Collega Stripe" },
    btnContinua: { en: "Continue verification", es: "Continuar la verificación", fr: "Continuer la vérification", de: "Verifizierung fortsetzen", pt: "Continuar a verificação", it: "Continua la verifica" },
    btnRedirect: { en: "Redirecting...", es: "Redirigiendo...", fr: "Redirection...", de: "Weiterleitung...", pt: "A redirecionar...", it: "Reindirizzamento..." },
    descActiv: { en: "Payments and payouts are active. You can receive commissions.", es: "Los pagos y retiros están activos. Puedes recibir comisiones.", fr: "Les paiements et versements sont actifs. Vous pouvez recevoir des commissions.", de: "Zahlungen und Auszahlungen sind aktiv. Du kannst Provisionen erhalten.", pt: "Os pagamentos e levantamentos estão ativos. Pode receber comissões.", it: "Pagamenti e versamenti sono attivi. Puoi ricevere commissioni." },
    descNeconectatCreator: { en: "Connect a Stripe account to receive your creator commission earnings.", es: "Conecta una cuenta de Stripe para recibir tus comisiones de creador.", fr: "Connectez un compte Stripe pour recevoir vos commissions de créateur.", de: "Verbinde ein Stripe-Konto, um deine Creator-Provisionen zu erhalten.", pt: "Ligue uma conta Stripe para receber as suas comissões de criador.", it: "Collega un account Stripe per ricevere le tue commissioni da creator." },
    descNeconectatSeller: { en: "Connect a Stripe account to receive your sales earnings.", es: "Conecta una cuenta de Stripe para recibir el dinero de tus ventas.", fr: "Connectez un compte Stripe pour recevoir l'argent de vos ventes.", de: "Verbinde ein Stripe-Konto, um deine Verkaufserlöse zu erhalten.", pt: "Ligue uma conta Stripe para receber o dinheiro das suas vendas.", it: "Collega un account Stripe per ricevere i ricavi delle tue vendite." },
    descPending: { en: "Stripe needs more information to activate payouts.", es: "Stripe necesita más información para activar los retiros.", fr: "Stripe a besoin d'informations supplémentaires pour activer les versements.", de: "Stripe benötigt weitere Informationen, um Auszahlungen zu aktivieren.", pt: "A Stripe precisa de mais informações para ativar os levantamentos.", it: "Stripe ha bisogno di ulteriori informazioni per attivare i versamenti." },
    errConectare: { en: "Connection error.", es: "Error de conexión.", fr: "Erreur de connexion.", de: "Verbindungsfehler.", pt: "Erro de ligação.", it: "Errore di collegamento." },
    errRetea: { en: "Network error.", es: "Error de red.", fr: "Erreur réseau.", de: "Netzwerkfehler.", pt: "Erro de rede.", it: "Errore di rete." },
    errVerificare: { en: "Error checking status.", es: "Error al verificar el estado.", fr: "Erreur lors de la vérification du statut.", de: "Fehler beim Prüfen des Status.", pt: "Erro ao verificar o estado.", it: "Errore durante la verifica dello stato." },
    titluActiv: { en: "Stripe Connect active", es: "Stripe Connect activo", fr: "Stripe Connect actif", de: "Stripe Connect aktiv", pt: "Stripe Connect ativo", it: "Stripe Connect attivo" },
    titluNeconectat: { en: "Connect Stripe to get paid", es: "Conecta Stripe para recibir pagos", fr: "Connectez Stripe pour être payé", de: "Verbinde Stripe, um Zahlungen zu erhalten", pt: "Ligue a Stripe para receber pagamentos", it: "Collega Stripe per ricevere pagamenti" },
    titluPending: { en: "Stripe — finish verification", es: "Stripe: completa la verificación", fr: "Stripe — terminez la vérification", de: "Stripe — Verifizierung abschließen", pt: "Stripe — conclua a verificação", it: "Stripe — completa la verifica" },
  },
  join: {
    foundingCounter: { en: "Founding Driver seats left: {count} of 500", es: "Plazas de Founding Driver restantes: {count} de 500", fr: "Places Founding Driver restantes : {count} sur 500", de: "Verbleibende Founding-Driver-Plätze: {count} von 500", pt: "Vagas de Founding Driver restantes: {count} de 500", it: "Posti Founding Driver rimasti: {count} su 500" },
    foundingDetail: { en: "0% commission for the first 60 days, then 15% for life for the first 500 drivers. Next 2000: 18%. Standard: 20%.", es: "0% de comisión los primeros 60 días, luego 15% de por vida para los primeros 500 conductores. Siguientes 2000: 18%. Estándar: 20%.", fr: "0 % de commission les 60 premiers jours, puis 15 % à vie pour les 500 premiers chauffeurs. Les 2000 suivants : 18 %. Standard : 20 %.", de: "0 % Provision in den ersten 60 Tagen, danach 15 % lebenslang für die ersten 500 Fahrer. Nächste 2000: 18 %. Standard: 20 %.", pt: "0% de comissão nos primeiros 60 dias, depois 15% vitalício para os primeiros 500 motoristas. Próximos 2000: 18%. Padrão: 20%.", it: "0% di commissione per i primi 60 giorni, poi 15% a vita per i primi 500 autisti. Successivi 2000: 18%. Standard: 20%." },
  },
};

// Runner comun — importat și de part2
export function applyTranslations(T) {
  const LOCALES = ["en", "es", "fr", "de", "pt", "it"];
  for (const loc of LOCALES) {
    const file = `messages/${loc}.json`;
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    let added = 0;
    for (const [ns, keys] of Object.entries(T)) {
      j[ns] = j[ns] || {};
      for (const [k, vals] of Object.entries(keys)) {
        if (j[ns][k] === undefined && vals[loc] !== undefined) {
          j[ns][k] = vals[loc];
          added++;
        }
      }
    }
    fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
    console.log(`${loc}: +${added}`);
  }
}

if (process.argv[1].endsWith("fill-missing-i18n-part1.mjs")) applyTranslations(T1);
