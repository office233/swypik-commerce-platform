// One-off: add lot-5 i18n keys (admin/** + cauze/** hardcoded-RO cleanup)
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "messages");

const L = (ro, en, es, fr, de, pt, it) => ({ ro, en, es, fr, de, pt, it });

const KEYS = {
  causesPanel: {
    verifPending: L("În așteptare", "Pending", "Pendiente", "En attente", "Ausstehend", "Pendente", "In attesa"),
    verifInReview: L("În verificare", "In review", "En revisión", "En cours de vérification", "In Prüfung", "Em análise", "In verifica"),
    verifVerified: L("Verificată ✓", "Verified ✓", "Verificada ✓", "Vérifiée ✓", "Verifiziert ✓", "Verificada ✓", "Verificata ✓"),
    verifRejected: L("Respinsă", "Rejected", "Rechazada", "Rejetée", "Abgelehnt", "Rejeitada", "Respinta"),
    authRequired: L("Autentifică-te pentru a-ți administra cauzele.", "Sign in to manage your causes.", "Inicia sesión para administrar tus causas.", "Connectez-vous pour gérer vos causes.", "Melde dich an, um deine Anliegen zu verwalten.", "Inicie sessão para gerir as suas causas.", "Accedi per gestire le tue cause."),
    networkError: L("Eroare de rețea.", "Network error.", "Error de red.", "Erreur réseau.", "Netzwerkfehler.", "Erro de rede.", "Errore di rete."),
    registered: L("Cauza a fost înregistrată. Verificarea se face de echipa Swypik.", "The cause has been registered. Verification is done by the Swypik team.", "La causa ha sido registrada. La verificación la realiza el equipo de Swypik.", "La cause a été enregistrée. La vérification est effectuée par l'équipe Swypik.", "Das Anliegen wurde registriert. Die Prüfung erfolgt durch das Swypik-Team.", "A causa foi registada. A verificação é feita pela equipa Swypik.", "La causa è stata registrata. La verifica viene effettuata dal team Swypik."),
    registerError: L("Eroare la înregistrare.", "Registration error.", "Error al registrar.", "Erreur lors de l'enregistrement.", "Fehler bei der Registrierung.", "Erro ao registar.", "Errore durante la registrazione."),
    campaignInvalid: L("Completează cauza și o țintă validă (minim 1 leu).", "Fill in the cause and a valid goal (minimum 1 leu).", "Completa la causa y una meta válida (mínimo 1 leu).", "Renseignez la cause et un objectif valide (minimum 1 leu).", "Fülle das Anliegen und ein gültiges Ziel aus (mindestens 1 Leu).", "Preencha a causa e uma meta válida (mínimo 1 leu).", "Compila la causa e un obiettivo valido (minimo 1 leu)."),
    campaignCreated: L("Campania a fost creată (draft).", "The campaign has been created (draft).", "La campaña ha sido creada (borrador).", "La campagne a été créée (brouillon).", "Die Kampagne wurde erstellt (Entwurf).", "A campanha foi criada (rascunho).", "La campagna è stata creata (bozza)."),
    createError: L("Eroare la creare.", "Creation error.", "Error al crear.", "Erreur lors de la création.", "Fehler beim Erstellen.", "Erro ao criar.", "Errore durante la creazione."),
    uploadError: L("Eroare la upload.", "Upload error.", "Error al subir.", "Erreur lors de l'envoi.", "Fehler beim Hochladen.", "Erro no upload.", "Errore durante il caricamento."),
    expenseInvalid: L("Completează campania, suma și dovada (upload).", "Fill in the campaign, the amount and the proof (upload).", "Completa la campaña, el importe y la prueba (subida).", "Renseignez la campagne, le montant et le justificatif (envoi).", "Fülle Kampagne, Betrag und Nachweis (Upload) aus.", "Preencha a campanha, o valor e o comprovativo (upload).", "Compila la campagna, l'importo e la prova (upload)."),
    expenseReported: L("Cheltuiala a fost raportată — apare public după confirmare.", "The expense has been reported — it appears publicly after confirmation.", "El gasto ha sido reportado: aparecerá públicamente tras la confirmación.", "La dépense a été déclarée — elle apparaîtra publiquement après confirmation.", "Die Ausgabe wurde gemeldet — sie erscheint nach Bestätigung öffentlich.", "A despesa foi reportada — aparece publicamente após confirmação.", "La spesa è stata segnalata — apparirà pubblicamente dopo la conferma."),
    reportError: L("Eroare la raportare.", "Reporting error.", "Error al reportar.", "Erreur lors de la déclaration.", "Fehler beim Melden.", "Erro ao reportar.", "Errore durante la segnalazione."),
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    title: L("Swypik Cares — panoul tău", "Swypik Cares — your panel", "Swypik Cares — tu panel", "Swypik Cares — votre panneau", "Swypik Cares — dein Bereich", "Swypik Cares — o seu painel", "Swypik Cares — il tuo pannello"),
    subtitle: L("Înregistrează o cauză, creează campanii și raportează transparent cheltuielile.", "Register a cause, create campaigns and report expenses transparently.", "Registra una causa, crea campañas y reporta los gastos con transparencia.", "Enregistrez une cause, créez des campagnes et déclarez les dépenses en toute transparence.", "Registriere ein Anliegen, erstelle Kampagnen und melde Ausgaben transparent.", "Registe uma causa, crie campanhas e reporte as despesas com transparência.", "Registra una causa, crea campagne e segnala le spese in modo trasparente."),
    myCauses: L("Cauzele mele", "My causes", "Mis causas", "Mes causes", "Meine Anliegen", "As minhas causas", "Le mie cause"),
    noCauses: L("Nu ai nicio cauză înregistrată.", "You have no registered causes.", "No tienes ninguna causa registrada.", "Vous n'avez aucune cause enregistrée.", "Du hast kein registriertes Anliegen.", "Não tem nenhuma causa registada.", "Non hai nessuna causa registrata."),
    kindNgo: L("ONG", "NGO", "ONG", "ONG", "NGO", "ONG", "ONG"),
    kindFamily: L("Familie", "Family", "Familia", "Famille", "Familie", "Família", "Famiglia"),
    kindSmallBusiness: L("Business mic", "Small business", "Pequeño negocio", "Petite entreprise", "Kleinunternehmen", "Pequeno negócio", "Piccola impresa"),
    kindCommunity: L("Comunitate", "Community", "Comunidad", "Communauté", "Gemeinschaft", "Comunidade", "Comunità"),
    kindEmergency: L("Urgență", "Emergency", "Emergencia", "Urgence", "Notfall", "Emergência", "Emergenza"),
    causeName: L("Numele cauzei", "Cause name", "Nombre de la causa", "Nom de la cause", "Name des Anliegens", "Nome da causa", "Nome della causa"),
    legalId: L("CUI / CIF (opțional)", "Tax ID (optional)", "NIF (opcional)", "SIRET (facultatif)", "Steuernummer (optional)", "NIF (opcional)", "Partita IVA (facoltativa)"),
    city: L("Oraș", "City", "Ciudad", "Ville", "Stadt", "Cidade", "Città"),
    contactName: L("Persoană de contact", "Contact person", "Persona de contacto", "Personne de contact", "Ansprechpartner", "Pessoa de contacto", "Persona di contatto"),
    contactEmail: L("Email contact", "Contact email", "Email de contacto", "E-mail de contact", "Kontakt-E-Mail", "Email de contacto", "Email di contatto"),
    contactPhone: L("Telefon (opțional)", "Phone (optional)", "Teléfono (opcional)", "Téléphone (facultatif)", "Telefon (optional)", "Telefone (opcional)", "Telefono (facoltativo)"),
    description: L("Descriere", "Description", "Descripción", "Description", "Beschreibung", "Descrição", "Descrizione"),
    registerBtn: L("Înregistrează cauza (verificare manuală)", "Register the cause (manual verification)", "Registrar la causa (verificación manual)", "Enregistrer la cause (vérification manuelle)", "Anliegen registrieren (manuelle Prüfung)", "Registar a causa (verificação manual)", "Registra la causa (verifica manuale)"),
    campaigns: L("Campanii", "Campaigns", "Campañas", "Campagnes", "Kampagnen", "Campanhas", "Campagne"),
    viewExpenses: L("Vezi cheltuielile raportate", "View reported expenses", "Ver los gastos reportados", "Voir les dépenses déclarées", "Gemeldete Ausgaben ansehen", "Ver as despesas reportadas", "Vedi le spese segnalate"),
    noExpenses: L("Nicio cheltuială raportată.", "No expenses reported.", "Ningún gasto reportado.", "Aucune dépense déclarée.", "Keine Ausgaben gemeldet.", "Nenhuma despesa reportada.", "Nessuna spesa segnalata."),
    expenseLine: L("{amount} lei", "{amount} lei", "{amount} lei", "{amount} lei", "{amount} Lei", "{amount} lei", "{amount} lei"),
    proofLink: L("dovadă", "proof", "prueba", "justificatif", "Nachweis", "comprovativo", "prova"),
    needVerified: L("Poți crea campanii după ce o cauză este verificată.", "You can create campaigns after a cause is verified.", "Puedes crear campañas después de que una causa sea verificada.", "Vous pouvez créer des campagnes après la vérification d'une cause.", "Du kannst Kampagnen erstellen, sobald ein Anliegen verifiziert ist.", "Pode criar campanhas depois de uma causa ser verificada.", "Puoi creare campagne dopo che una causa è stata verificata."),
    chooseCause: L("Alege cauza…", "Choose the cause…", "Elige la causa…", "Choisissez la cause…", "Anliegen wählen…", "Escolha a causa…", "Scegli la causa…"),
    campaignTitle: L("Titlul campaniei", "Campaign title", "Título de la campaña", "Titre de la campagne", "Kampagnentitel", "Título da campanha", "Titolo della campagna"),
    goalPlaceholder: L("Țintă (lei)", "Goal (lei)", "Meta (lei)", "Objectif (lei)", "Ziel (Lei)", "Meta (lei)", "Obiettivo (lei)"),
    storyPlaceholder: L("Povestea campaniei", "Campaign story", "Historia de la campaña", "Histoire de la campagne", "Geschichte der Kampagne", "História da campanha", "Storia della campagna"),
    createCampaign: L("Creează campania", "Create the campaign", "Crear la campaña", "Créer la campagne", "Kampagne erstellen", "Criar a campanha", "Crea la campagna"),
    reportExpenseTitle: L("Raportează o cheltuială (cu dovadă)", "Report an expense (with proof)", "Reporta un gasto (con prueba)", "Déclarer une dépense (avec justificatif)", "Ausgabe melden (mit Nachweis)", "Reportar uma despesa (com comprovativo)", "Segnala una spesa (con prova)"),
    chooseCampaign: L("Alege campania…", "Choose the campaign…", "Elige la campaña…", "Choisissez la campagne…", "Kampagne wählen…", "Escolha a campanha…", "Scegli la campagna…"),
    amountPlaceholder: L("Sumă (lei)", "Amount (lei)", "Importe (lei)", "Montant (lei)", "Betrag (Lei)", "Valor (lei)", "Importo (lei)"),
    purposePlaceholder: L("Scop (ex: plată factură spital)", "Purpose (e.g. hospital bill payment)", "Propósito (ej.: pago de factura de hospital)", "Objet (ex. : paiement d'une facture d'hôpital)", "Zweck (z. B. Zahlung einer Krankenhausrechnung)", "Finalidade (ex.: pagamento de fatura hospitalar)", "Scopo (es.: pagamento fattura ospedale)"),
    proofLabel: L("Dovadă (factură/chitanță — png/jpg/webp):", "Proof (invoice/receipt — png/jpg/webp):", "Prueba (factura/recibo — png/jpg/webp):", "Justificatif (facture/reçu — png/jpg/webp) :", "Nachweis (Rechnung/Quittung — png/jpg/webp):", "Comprovativo (fatura/recibo — png/jpg/webp):", "Prova (fattura/ricevuta — png/jpg/webp):"),
    proofUploaded: L("Dovadă încărcată ✓", "Proof uploaded ✓", "Prueba subida ✓", "Justificatif envoyé ✓", "Nachweis hochgeladen ✓", "Comprovativo carregado ✓", "Prova caricata ✓"),
    reportBtn: L("Raportează cheltuiala", "Report the expense", "Reportar el gasto", "Déclarer la dépense", "Ausgabe melden", "Reportar a despesa", "Segnala la spesa"),
  },
  adminFleet: {
    title: L("Flotă — verificări", "Fleet — verifications", "Flota — verificaciones", "Flotte — vérifications", "Flotte — Prüfungen", "Frota — verificações", "Flotta — verifiche"),
    pendingCount: L("{count} în așteptare", "{count} pending", "{count} pendientes", "{count} en attente", "{count} ausstehend", "{count} pendentes", "{count} in attesa"),
    activeCount: L("{count} activi", "{count} active", "{count} activos", "{count} actifs", "{count} aktiv", "{count} ativos", "{count} attivi"),
    suspendedCount: L("{count} suspendați", "{count} suspended", "{count} suspendidos", "{count} suspendus", "{count} gesperrt", "{count} suspensos", "{count} sospesi"),
    rejectedCount: L("{count} respinși", "{count} rejected", "{count} rechazados", "{count} rejetés", "{count} abgelehnt", "{count} rejeitados", "{count} respinti"),
    totalCount: L("{count} total", "{count} total", "{count} en total", "{count} au total", "{count} gesamt", "{count} no total", "{count} in totale"),
    applicationsTitle: L("Aplicații șoferi & curieri", "Driver & courier applications", "Solicitudes de conductores y repartidores", "Candidatures chauffeurs & coursiers", "Bewerbungen Fahrer & Kuriere", "Candidaturas de motoristas e estafetas", "Candidature autisti e corrieri"),
    thName: L("Nume", "Name", "Nombre", "Nom", "Name", "Nome", "Nome"),
    thType: L("Tip", "Type", "Tipo", "Type", "Typ", "Tipo", "Tipo"),
    thContact: L("Contact", "Contact", "Contacto", "Contact", "Kontakt", "Contacto", "Contatto"),
    thLoginAccount: L("Cont login", "Login account", "Cuenta de acceso", "Compte de connexion", "Login-Konto", "Conta de login", "Account di accesso"),
    thCity: L("Oraș", "City", "Ciudad", "Ville", "Stadt", "Cidade", "Città"),
    thVehicle: L("Vehicul", "Vehicle", "Vehículo", "Véhicule", "Fahrzeug", "Veículo", "Veicolo"),
    thLocationIp: L("Locație / IP", "Location / IP", "Ubicación / IP", "Localisation / IP", "Standort / IP", "Localização / IP", "Posizione / IP"),
    thStatus: L("Status", "Status", "Estado", "Statut", "Status", "Estado", "Stato"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
    noAccountTitle: L("Aplicație trimisă fără cont — se leagă la primul login", "Application submitted without an account — it links on first login", "Solicitud enviada sin cuenta: se vincula en el primer inicio de sesión", "Candidature envoyée sans compte — liée à la première connexion", "Bewerbung ohne Konto eingereicht — wird beim ersten Login verknüpft", "Candidatura enviada sem conta — liga-se no primeiro login", "Candidatura inviata senza account — si collega al primo accesso"),
    noAccount: L("fără cont", "no account", "sin cuenta", "sans compte", "kein Konto", "sem conta", "senza account"),
    updatedAt: L("actualizat: {time}", "updated: {time}", "actualizado: {time}", "mis à jour : {time}", "aktualisiert: {time}", "atualizado: {time}", "aggiornato: {time}"),
    onlineNoGps: L("🟢 online, fără GPS", "🟢 online, no GPS", "🟢 en línea, sin GPS", "🟢 en ligne, sans GPS", "🟢 online, kein GPS", "🟢 online, sem GPS", "🟢 online, senza GPS"),
    noLocation: L("— fără locație", "— no location", "— sin ubicación", "— pas de localisation", "— kein Standort", "— sem localização", "— nessuna posizione"),
    lastSession: L("ultima sesiune: {time}", "last session: {time}", "última sesión: {time}", "dernière session : {time}", "letzte Sitzung: {time}", "última sessão: {time}", "ultima sessione: {time}"),
    suspended: L("suspendat", "suspended", "suspendido", "suspendu", "gesperrt", "suspenso", "sospeso"),
    noApplications: L("Nicio aplicație încă.", "No applications yet.", "Aún no hay solicitudes.", "Aucune candidature pour le moment.", "Noch keine Bewerbungen.", "Ainda não há candidaturas.", "Ancora nessuna candidatura."),
    franchisesTitle: L("Francize de flotă", "Fleet franchises", "Franquicias de flota", "Franchises de flotte", "Flotten-Franchises", "Franquias de frota", "Franchising di flotta"),
    thCompany: L("Firmă", "Company", "Empresa", "Société", "Firma", "Empresa", "Azienda"),
    thVertical: L("Vertical", "Vertical", "Vertical", "Verticale", "Vertikale", "Vertical", "Verticale"),
    thDrivers: L("Șoferi", "Drivers", "Conductores", "Chauffeurs", "Fahrer", "Motoristas", "Autisti"),
    noFranchises: L("Nicio franciză încă. Aplicațiile vin din /join/franchise.", "No franchises yet. Applications come from /join/franchise.", "Aún no hay franquicias. Las solicitudes llegan desde /join/franchise.", "Aucune franchise pour le moment. Les candidatures arrivent via /join/franchise.", "Noch keine Franchises. Bewerbungen kommen über /join/franchise.", "Ainda não há franquias. As candidaturas chegam por /join/franchise.", "Ancora nessun franchising. Le candidature arrivano da /join/franchise."),
    deleteForever: L("Șterge definitiv", "Delete permanently", "Eliminar definitivamente", "Supprimer définitivement", "Endgültig löschen", "Eliminar definitivamente", "Elimina definitivamente"),
  },
  adminPricing: {
    thCity: L("Oraș", "City", "Ciudad", "Ville", "Stadt", "Cidade", "Città"),
    thClass: L("Clasă", "Class", "Clase", "Classe", "Klasse", "Classe", "Classe"),
    thBase: L("Bază", "Base", "Base", "Base", "Basis", "Base", "Base"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
    thZone: L("Zonă", "Zone", "Zona", "Zone", "Zone", "Zona", "Zona"),
    thStart: L("Început", "Start", "Inicio", "Début", "Beginn", "Início", "Inizio"),
    thEnd: L("Sfârșit", "End", "Fin", "Fin", "Ende", "Fim", "Fine"),
    thSource: L("Sursă", "Source", "Fuente", "Source", "Quelle", "Fonte", "Fonte"),
    zoneLabel: L("Zonă", "Zone", "Zona", "Zone", "Zone", "Zona", "Zona"),
    durationMin: L("Durată (min)", "Duration (min)", "Duración (min)", "Durée (min)", "Dauer (Min)", "Duração (min)", "Durata (min)"),
  },
  adminOrders: {
    notFound: L("Comanda nu a fost găsită.", "Order not found.", "Pedido no encontrado.", "Commande introuvable.", "Bestellung nicht gefunden.", "Encomenda não encontrada.", "Ordine non trovato."),
    paymentSummary: L("Sumar plată", "Payment summary", "Resumen de pago", "Récapitulatif du paiement", "Zahlungsübersicht", "Resumo do pagamento", "Riepilogo pagamento"),
    totalPaid: L("Total plătit", "Total paid", "Total pagado", "Total payé", "Gesamt bezahlt", "Total pago", "Totale pagato"),
    trackingCode: L("🚚 Cod de urmărire", "🚚 Tracking code", "🚚 Código de seguimiento", "🚚 Code de suivi", "🚚 Sendungsnummer", "🚚 Código de rastreio", "🚚 Codice di tracciamento"),
    deliveryAddress: L("Adresă de livrare", "Delivery address", "Dirección de entrega", "Adresse de livraison", "Lieferadresse", "Morada de entrega", "Indirizzo di consegna"),
    noDeliveryAddress: L("Nu a fost furnizată nicio adresă de livrare.", "No delivery address was provided.", "No se proporcionó ninguna dirección de entrega.", "Aucune adresse de livraison n'a été fournie.", "Es wurde keine Lieferadresse angegeben.", "Não foi fornecida nenhuma morada de entrega.", "Non è stato fornito alcun indirizzo di consegna."),
    addAwbTitle: L("Adaugă cod AWB", "Add AWB code", "Añadir código AWB", "Ajouter un code AWB", "AWB-Code hinzufügen", "Adicionar código AWB", "Aggiungi codice AWB"),
    addAwbDesc: L("Introdu codul de urmărire primit de la curier sau furnizor.", "Enter the tracking code received from the courier or supplier.", "Introduce el código de seguimiento recibido del mensajero o proveedor.", "Saisissez le code de suivi reçu du transporteur ou du fournisseur.", "Gib die vom Kurier oder Lieferanten erhaltene Sendungsnummer ein.", "Introduza o código de rastreio recebido do estafeta ou fornecedor.", "Inserisci il codice di tracciamento ricevuto dal corriere o dal fornitore."),
  },
  adminCreators: {
    searchPlaceholder: L("Caută username sau nume...", "Search username or name...", "Buscar nombre de usuario o nombre...", "Rechercher un nom d'utilisateur ou un nom...", "Benutzername oder Namen suchen...", "Pesquisar nome de utilizador ou nome...", "Cerca username o nome..."),
    searchBtn: L("Caută", "Search", "Buscar", "Rechercher", "Suchen", "Pesquisar", "Cerca"),
    thFollowers: L("Urmăritori", "Followers", "Seguidores", "Abonnés", "Follower", "Seguidores", "Follower"),
    thSalesCount: L("Vânzări (#)", "Sales (#)", "Ventas (#)", "Ventes (#)", "Verkäufe (#)", "Vendas (#)", "Vendite (#)"),
    thSalesTotal: L("Vânzări (total)", "Sales (total)", "Ventas (total)", "Ventes (total)", "Verkäufe (gesamt)", "Vendas (total)", "Vendite (totale)"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
    noCreators: L("Niciun creator găsit.", "No creators found.", "No se encontraron creadores.", "Aucun créateur trouvé.", "Keine Creator gefunden.", "Nenhum criador encontrado.", "Nessun creator trovato."),
  },
  adminCommissions: {
    pendingLabel: L("În așteptare", "Pending", "Pendientes", "En attente", "Ausstehend", "Pendentes", "In attesa"),
    paidLabel: L("Plătite", "Paid", "Pagadas", "Payées", "Bezahlt", "Pagas", "Pagate"),
    thPlatform: L("Platformă", "Platform", "Plataforma", "Plateforme", "Plattform", "Plataforma", "Piattaforma"),
    thOrder: L("Comandă", "Order", "Pedido", "Commande", "Bestellung", "Encomenda", "Ordine"),
    thPaid: L("Plătit", "Paid", "Pagado", "Payé", "Bezahlt", "Pago", "Pagato"),
  },
  adminHosts: {
    host: L("Gazdă: ", "Host: ", "Anfitrión: ", "Hôte : ", "Gastgeber: ", "Anfitrião: ", "Host: "),
    form: L("Formă: ", "Legal form: ", "Forma: ", "Forme : ", "Rechtsform: ", "Forma: ", "Forma: "),
    company: L("Firmă: ", "Company: ", "Empresa: ", "Société : ", "Firma: ", "Empresa: ", "Azienda: "),
    cnpMaskedTitle: L("afișat mascat — integral doar la raportare fiscală", "displayed masked — full only for tax reporting", "mostrado enmascarado: completo solo para informes fiscales", "affiché masqué — complet uniquement pour la déclaration fiscale", "maskiert angezeigt — vollständig nur für die Steuermeldung", "apresentado mascarado — completo apenas para o reporte fiscal", "mostrato mascherato — completo solo per la dichiarazione fiscale"),
    noteLabel: L("Notă:", "Note:", "Nota:", "Note :", "Hinweis:", "Nota:", "Nota:"),
    needsInfoPlaceholder: L("ex: lipsește extrasul CF; certificatul de clasificare e expirat...", "e.g. the land registry extract is missing; the classification certificate is expired...", "ej.: falta el extracto del registro; el certificado de clasificación está caducado...", "ex. : l'extrait du registre foncier manque ; le certificat de classification est expiré...", "z. B.: Grundbuchauszug fehlt; das Klassifizierungszertifikat ist abgelaufen...", "ex.: falta a certidão predial; o certificado de classificação está expirado...", "es.: manca l'estratto catastale; il certificato di classificazione è scaduto..."),
  },
  adminImport: {
    missingColumns: L("Coloane lipsă", "Missing columns", "Columnas faltantes", "Colonnes manquantes", "Fehlende Spalten", "Colunas em falta", "Colonne mancanti"),
    importing: L("Se importă produsele…", "Importing products…", "Importando productos…", "Importation des produits…", "Produkte werden importiert…", "A importar produtos…", "Importazione prodotti…"),
    totalRows: L("Total rânduri", "Total rows", "Total de filas", "Total de lignes", "Zeilen gesamt", "Total de linhas", "Righe totali"),
    thRow: L("Rând", "Row", "Fila", "Ligne", "Zeile", "Linha", "Riga"),
    thPrice: L("Preț", "Price", "Precio", "Prix", "Preis", "Preço", "Prezzo"),
  },
  adminCourierPayouts: {
    loading: L("Se încarcă…", "Loading…", "Cargando…", "Chargement…", "Wird geladen…", "A carregar…", "Caricamento…"),
    thAmount: L("Sumă", "Amount", "Importe", "Montant", "Betrag", "Valor", "Importo"),
    thRequestedAt: L("Cerută la", "Requested at", "Solicitada el", "Demandée le", "Angefragt am", "Pedida em", "Richiesta il"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminShell: {
    comingSoon: L("În curând", "Coming soon", "Próximamente", "Bientôt disponible", "Demnächst", "Em breve", "In arrivo"),
    closeMenu: L("Închide meniul", "Close menu", "Cerrar el menú", "Fermer le menu", "Menü schließen", "Fechar o menu", "Chiudi il menu"),
    close: L("Închide", "Close", "Cerrar", "Fermer", "Schließen", "Fechar", "Chiudi"),
  },
  adminApplications: {
    partnersTitle: L("Aplicații parteneri", "Partner applications", "Solicitudes de socios", "Candidatures partenaires", "Partner-Bewerbungen", "Candidaturas de parceiros", "Candidature partner"),
    thCity: L("Oraș", "City", "Ciudad", "Ville", "Stadt", "Cidade", "Città"),
    thReceived: L("Primită", "Received", "Recibida", "Reçue", "Eingegangen", "Recebida", "Ricevuta"),
    creatorTitle: L("Aplicații creator", "Creator applications", "Solicitudes de creador", "Candidatures créateur", "Creator-Bewerbungen", "Candidaturas de criador", "Candidature creator"),
    creatorSubtitle: L("Cereri de la utilizatori care vor să devină creatori.", "Requests from users who want to become creators.", "Solicitudes de usuarios que quieren convertirse en creadores.", "Demandes d'utilisateurs souhaitant devenir créateurs.", "Anfragen von Nutzern, die Creator werden möchten.", "Pedidos de utilizadores que querem tornar-se criadores.", "Richieste di utenti che vogliono diventare creator."),
    reviewNote: L("Notă review", "Review note", "Nota de revisión", "Note de revue", "Review-Notiz", "Nota de revisão", "Nota di revisione"),
    journalNotePlaceholder: L("Notă pentru jurnal sau motiv de respingere...", "Note for the log or rejection reason...", "Nota para el registro o motivo de rechazo...", "Note pour le journal ou motif de rejet...", "Notiz für das Protokoll oder Ablehnungsgrund...", "Nota para o registo ou motivo de rejeição...", "Nota per il registro o motivo del rifiuto..."),
  },
  adminDisputes: {
    respondTitle: L("Răspunde la dispute", "Respond to the dispute", "Responder a la disputa", "Répondre au litige", "Auf den Disput antworten", "Responder ao litígio", "Rispondi alla disputa"),
    filesLabel: L("Fișiere (PDF / PNG / JPG, max 5MB)", "Files (PDF / PNG / JPG, max 5MB)", "Archivos (PDF / PNG / JPG, máx. 5MB)", "Fichiers (PDF / PNG / JPG, max 5 Mo)", "Dateien (PDF / PNG / JPG, max. 5 MB)", "Ficheiros (PDF / PNG / JPG, máx. 5MB)", "File (PDF / PNG / JPG, max 5MB)"),
    uploadingStripe: L("Se urcă la Stripe…", "Uploading to Stripe…", "Subiendo a Stripe…", "Envoi vers Stripe…", "Wird zu Stripe hochgeladen…", "A carregar para o Stripe…", "Caricamento su Stripe…"),
    orderTotal: L("Total comandă:", "Order total:", "Total del pedido:", "Total de la commande :", "Bestellsumme:", "Total da encomenda:", "Totale ordine:"),
    evidenceSent: L("Evidence trimisă:", "Evidence sent:", "Evidencia enviada:", "Preuves envoyées :", "Nachweise gesendet:", "Evidência enviada:", "Prove inviate:"),
  },
  adminModeration: {
    actionsTitle: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
    internalReason: L("Motiv intern (opțional)", "Internal reason (optional)", "Motivo interno (opcional)", "Motif interne (facultatif)", "Interner Grund (optional)", "Motivo interno (opcional)", "Motivo interno (facoltativo)"),
    journalPlaceholder: L("Notă pentru jurnal...", "Note for the log...", "Nota para el registro...", "Note pour le journal...", "Notiz für das Protokoll...", "Nota para o registo...", "Nota per il registro..."),
    pageTitle: L("Moderare conținut", "Content moderation", "Moderación de contenido", "Modération du contenu", "Inhaltsmoderation", "Moderação de conteúdo", "Moderazione dei contenuti"),
    statusTriaged: L("În analiză", "Under review", "En análisis", "En cours d'analyse", "In Prüfung", "Em análise", "In analisi"),
    noteLabel: L("Notă:", "Note:", "Nota:", "Note :", "Hinweis:", "Nota:", "Nota:"),
  },
  adminPayouts: {
    pendingLabel: L("În așteptare", "Pending", "Pendientes", "En attente", "Ausstehend", "Pendentes", "In attesa"),
    failedLabel: L("Eșuate", "Failed", "Fallidas", "Échouées", "Fehlgeschlagen", "Falhadas", "Fallite"),
    thAmount: L("Sumă", "Amount", "Importe", "Montant", "Betrag", "Valor", "Importo"),
  },
  adminStrikes: {
    thWhen: L("Când", "When", "Cuándo", "Quand", "Wann", "Quando", "Quando"),
    thExpires: L("Expiră", "Expires", "Expira", "Expire", "Läuft ab", "Expira", "Scade"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminRefunds: {
    thOrder: L("Comandă", "Order", "Pedido", "Commande", "Bestellung", "Encomenda", "Ordine"),
    thAmount: L("Sumă", "Amount", "Importe", "Montant", "Betrag", "Valor", "Importo"),
  },
  adminReturns: {
    thOrder: L("Comandă", "Order", "Pedido", "Commande", "Bestellung", "Encomenda", "Ordine"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminReviews: {
    reactivate: L("Reactivează", "Reactivate", "Reactivar", "Réactiver", "Reaktivieren", "Reativar", "Riattiva"),
    delete: L("Șterge", "Delete", "Eliminar", "Supprimer", "Löschen", "Eliminar", "Elimina"),
  },
  adminUsers: {
    searchPlaceholder: L("Caută după username, email sau nume...", "Search by username, email or name...", "Buscar por nombre de usuario, email o nombre...", "Rechercher par nom d'utilisateur, e-mail ou nom...", "Nach Benutzername, E-Mail oder Name suchen...", "Pesquisar por nome de utilizador, email ou nome...", "Cerca per username, email o nome..."),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminVideos: {
    thDuration: L("Durată", "Duration", "Duración", "Durée", "Dauer", "Duração", "Durata"),
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminCron: {
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
  },
  adminHealth: {
    latency: L("Latență", "Latency", "Latencia", "Latence", "Latenz", "Latência", "Latenza"),
  },
  adminMarketplace: {
    searchPlaceholder: L("Caută produse după titlu, slug, brand sau categorie...", "Search products by title, slug, brand or category...", "Buscar productos por título, slug, marca o categoría...", "Rechercher des produits par titre, slug, marque ou catégorie...", "Produkte nach Titel, Slug, Marke oder Kategorie suchen...", "Pesquisar produtos por título, slug, marca ou categoria...", "Cerca prodotti per titolo, slug, brand o categoria..."),
  },
  adminRisk: {
    title: L("Risc fraudă comenzi", "Order fraud risk", "Riesgo de fraude en pedidos", "Risque de fraude des commandes", "Bestellbetrugsrisiko", "Risco de fraude em encomendas", "Rischio frode ordini"),
    noSignals: L("Niciun semnal în ultimele 30 zile. Chart-ul se va popula automat când apar comenzi flagged sau decizii admin.", "No signals in the last 30 days. The chart will populate automatically when flagged orders or admin decisions appear.", "Sin señales en los últimos 30 días. El gráfico se llenará automáticamente cuando aparezcan pedidos marcados o decisiones de administrador.", "Aucun signal au cours des 30 derniers jours. Le graphique se remplira automatiquement dès que des commandes signalées ou des décisions admin apparaîtront.", "Keine Signale in den letzten 30 Tagen. Das Diagramm füllt sich automatisch, sobald markierte Bestellungen oder Admin-Entscheidungen erscheinen.", "Sem sinais nos últimos 30 dias. O gráfico será preenchido automaticamente quando surgirem encomendas sinalizadas ou decisões de admin.", "Nessun segnale negli ultimi 30 giorni. Il grafico si popolerà automaticamente quando appariranno ordini segnalati o decisioni admin."),
    chartAria: L("Trend ultimele 30 zile pentru comenzi flagged, decizii approve/block și auto-blocks", "Trend over the last 30 days for flagged orders, approve/block decisions and auto-blocks", "Tendencia de los últimos 30 días de pedidos marcados, decisiones approve/block y auto-blocks", "Tendance des 30 derniers jours pour les commandes signalées, décisions approve/block et auto-blocks", "Trend der letzten 30 Tage für markierte Bestellungen, Approve/Block-Entscheidungen und Auto-Blocks", "Tendência dos últimos 30 dias para encomendas sinalizadas, decisões approve/block e auto-blocks", "Trend degli ultimi 30 giorni per ordini segnalati, decisioni approve/block e auto-block"),
  },
  adminSellers: {
    thActions: L("Acțiuni", "Actions", "Acciones", "Actions", "Aktionen", "Ações", "Azioni"),
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
