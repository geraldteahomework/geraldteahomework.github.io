'use strict';
// Translations. English is the key; t(key) returns the key itself in English.
// Static HTML is marked with data-i18n / data-i18n-html / data-i18n-placeholder /
// data-i18n-title / data-i18n-aria and filled in by applyLanguage().

const LANGUAGES = { en: 'English', sq: 'Shqip' };
let LANG = 'en';
try { if (localStorage.getItem('hw_lang') === 'sq') LANG = 'sq'; } catch { /* ignore */ }

const I18N = {};
// keys that need an English text different from the key itself
I18N.en = {
  'app.name': 'Homework',
  'app.signin': 'Homework — sign in',
  'reminders.homework': 'Homework',
};
I18N.sq = {
  // ----- general / header -----
  'app.name': 'Detyrat',
  'app.signin': 'Detyrat — hyrja',
  'reminders.homework': 'Detyrat',
  'Homework': 'Detyrë',
  'Checklist': 'Lista',
  'Calendar': 'Kalendari',
  'Stats': 'Statistika',
  'Settings': 'Cilësimet',
  'Live sync status': 'Gjendja e sinkronizimit',
  'Offline': 'Pa lidhje',
  'Offline · {n} waiting to sync': 'Pa lidhje · {n} në pritje për sinkronizim',
  'Syncing {n}…': 'Duke sinkronizuar {n}…',
  'Week {letter}': 'Java {letter}',
  'You are offline': 'Je pa lidhje',
  'You are offline.': 'Je pa lidhje.',
  'Please sign in': 'Hyr në llogari',
  'Request failed ({status})': 'Kërkesa dështoi ({status})',
  'Could not load: {err}': 'Nuk u ngarkua: {err}',
  'Could not load grades: {err}': 'Nuk u ngarkuan notat: {err}',
  'Could not load settings: {err}': 'Nuk u ngarkuan cilësimet: {err}',
  'Saved on this device — will sync when online': 'U ruajt në këtë pajisje — sinkronizohet kur të ketë lidhje',
  'Could not sync one change: {err}': 'Një ndryshim nuk u sinkronizua: {err}',
  'Synced': 'U sinkronizua',
  'Undo': 'Zhbëj',
  'Undone': 'U kthye',

  // ----- dates -----
  'Today': 'Sot',
  'Tomorrow': 'Nesër',
  'Yesterday': 'Dje',
  'today': 'sot',
  'tomorrow': 'nesër',
  'yesterday': 'dje',
  '{n} days ago': '{n} ditë më parë',
  'in {n} days': 'pas {n} ditësh',
  'In 2 days': 'Pas 2 ditësh',
  'Next Mon': 'Të hënën',
  'Next week': 'Javën tjetër',
  '+1 week': '+1 javë',
  'Next {subject}': 'Ora tjetër: {subject}',
  'Day before': 'Një ditë para',
  'Pick a date': 'Zgjidh një datë',
  'Monday': 'E hënë', 'Tuesday': 'E martë', 'Wednesday': 'E mërkurë', 'Thursday': 'E enjte', 'Friday': 'E premte', 'Saturday': 'E shtunë', 'Sunday': 'E diel',
  'Mon': 'Hën', 'Tue': 'Mar', 'Wed': 'Mër', 'Thu': 'Enj', 'Fri': 'Pre', 'Sat': 'Sht', 'Sun': 'Die',

  // ----- day bar -----
  'back {when}': 'kthehemi {when}',
  '{name} in 1 day': '{name} pas 1 dite',
  '{name} in {n} days': '{name} pas {n} ditësh',
  '1 school day left': 'ka mbetur 1 ditë shkolle',
  '{n} school days left': 'kanë mbetur {n} ditë shkolle',
  'in {term}': 'në {term}',
  '{n} min left': 'edhe {n} min',
  'next {subject} at {time}': 'pas: {subject} në {time}',
  'last lesson': 'ora e fundit',
  'Next:': 'Pas:',
  'at {time}': 'në {time}',
  'in {n} min': 'pas {n} min',
  '· now': '· tani',

  // ----- types -----
  'Test': 'Test',
  'Quiz': 'Kuiz',
  'Project': 'Projekt',
  'Study session': 'Sesion studimi',
  'Other': 'Tjetër',
  'Step': 'Hap',

  // ----- quick add -----
  'What do you have to do?': 'Çfarë ke për të bërë?',
  'Subject': 'Lënda',
  'Once': 'Një herë',
  'Every week': 'Çdo javë',
  'Every 2 weeks': 'Çdo 2 javë',
  'Every 3 weeks': 'Çdo 3 javë',
  'Every 4 weeks': 'Çdo 4 javë',
  'Repeat': 'Përsërit',
  'Add': 'Shto',
  'Added': 'U shtua',
  'Added — repeats automatically': 'U shtua — përsëritet automatikisht',
  'Search…': 'Kërko…',
  'All': 'Të gjitha',

  // ----- list -----
  'Overdue': 'Të vonuara',
  'Overdue · ': 'Vonuar · ',
  'Next 7 days': '7 ditët e ardhshme',
  'Later': 'Më vonë',
  'Completed': 'Të përfunduara',
  'Move all to today': 'Zhvendosi të gjitha sot',
  'to {day}': 'për {day}',
  'Moved 1 item to {when}': 'U zhvendos 1 detyrë për {when}',
  'Moved {n} items to {when}': 'U zhvendosën {n} detyra për {when}',
  'Nothing matches.': 'Asgjë nuk përputhet.',
  'Nothing to do. Add homework above when you get it in class.': 'Asgjë për të bërë. Shto detyrat më sipër kur t\'i marrësh në klasë.',
  'Cleared every Sunday night — 1 older one not shown (search finds it, Stats still count it).': 'Pastrohet çdo të diel në mbrëmje — 1 më e vjetër nuk shfaqet (kërkimi e gjen, Statistikat e numërojnë).',
  'Cleared every Sunday night — {n} older ones not shown (search finds them, Stats still count them).': 'Pastrohet çdo të diel në mbrëmje — {n} më të vjetra nuk shfaqen (kërkimi i gjen, Statistikat i numërojnë).',
  'Mark done': 'Shëno si të kryer',
  'Mark step done': 'Shëno hapin si të kryer',
  'Waiting to sync': 'Në pritje të sinkronizimit',
  'Repeats': 'Përsëritet',
  'Add grade': 'Shto notë',
  'for {title}': 'për {title}',
  'of {project}': 'i {project}',
  '{done}/{total} study': '{done}/{total} studim',
  '{done}/{total} steps': '{done}/{total} hapa',
  'Postpone': 'Shtyj',
  'Study on:': 'Studio më:',
  'Move to:': 'Zhvendos për:',
  'Star': 'Vër yll',
  'Unstar': 'Hiq yllin',
  'Edit': 'Ndrysho',
  'Edit project': 'Ndrysho projektin',
  'Open {subject}': 'Hap {subject}',
  'Done ✓': 'U krye ✓',
  'Marked not done': 'U shënua si e pakryer',
  'Step done ✓': 'Hapi u krye ✓',
  'Step not done': 'Hapi u shënua si i pakryer',
  'Study for {title}': 'Studim për {title}',
  'Study session added for {when}': 'Sesioni i studimit u shtua për {when}',
  'Moved to {when}': 'U zhvendos për {when}',
  'That item is no longer there': 'Ajo detyrë nuk është më',

  // ----- trash -----
  'Recently deleted': 'Të fshira së fundmi',
  'Kept for 30 days, then removed for good.': 'Mbahen 30 ditë, pastaj hiqen përgjithmonë.',
  'deleted {when}': 'fshirë {when}',
  'Restore': 'Rikthe',
  'Restored': 'U rikthye',
  'Delete forever': 'Fshi përgjithmonë',
  'Empty': 'Zbraz',
  'Remove everything in Recently deleted for good?': 'Të hiqet përgjithmonë gjithçka nga Të fshirat së fundmi?',

  // ----- calendar -----
  'Previous': 'E mëparshmja',
  'Next': 'Tjetra',
  'Month': 'Muaji',
  'Week': 'Java',
  'Shading shows how busy each day is — darker means more due. Green = weekend, striped = holiday.': 'Hijezimi tregon sa e ngarkuar është çdo ditë — sa më e errët, aq më shumë detyra. Jeshile = fundjavë, me vija = pushim.',
  '+{n} more': '+{n} të tjera',
  'Classes:': 'Orët:',
  'Nothing due this day.': 'Asgjë me afat për këtë ditë.',
  'Add something for this day…': 'Shto diçka për këtë ditë…',

  // ----- stats -----
  'This week': 'Këtë javë',
  "completed · {a}/{b} of this week's due": 'të përfunduara · {a}/{b} nga afatet e kësaj jave',
  'On time': 'Në kohë',
  'last 30 days': '30 ditët e fundit',
  'Streak': 'Seria',
  'day without a missed deadline': 'ditë pa humbur asnjë afat',
  'days without a missed deadline': 'ditë pa humbur asnjë afat',
  'Grade average': 'Mesatarja e notave',
  '1 grade': '1 notë',
  '{n} grades': '{n} nota',
  'all time': 'gjithë kohës',
  'All time': 'Gjithë kohës',
  'Next 4 weeks': '4 javët e ardhshme',
  'How much is due each day — darker is busier. Tests count triple, projects and quizzes double.': 'Sa detyra ka çdo ditë — sa më e errët, aq më e ngarkuar. Testet numërohen trefish, projektet dhe kuizet dyfish.',
  '{date}: {n} due': '{date}: {n} me afat',
  'Completed per week': 'Të përfunduara në javë',
  'Completed items per week': 'Detyra të përfunduara në javë',
  'Week of {date}: {n} completed': 'Java e {date}: {n} të përfunduara',
  'Grades': 'Notat',
  'Average': 'Mesatarja',
  'Trend': 'Trendi',
  'Latest': 'E fundit',
  'No grades yet. Tick off a test and tap "Add grade", or add one below.': 'Ende pa nota. Shëno një test si të kryer dhe prek "Shto notë", ose shto një më poshtë.',
  'What was it? (optional)': 'Çfarë ishte? (opsionale)',
  'Delete': 'Fshi',
  'Grade added': 'Nota u shtua',
  'Grade deleted': 'Nota u fshi',
  '(no subject)': '(pa lëndë)',
  'Not graded yet': 'Pa notë ende',
  'e.g. 7.5': 'p.sh. 7.5',

  // ----- subject page -----
  '‹ Back': '‹ Kthehu',
  'Next lesson {when}': 'Ora tjetër {when}',
  'To do': 'Për t\'u bërë',
  '1 test coming': '1 test në vijim',
  '{n} tests coming': '{n} teste në vijim',
  'no tests coming': 'asnjë test në vijim',
  'oldest → newest': 'më e vjetra → më e reja',
  'Upcoming': 'Në vijim',
  'Nothing to do for this subject.': 'Asgjë për të bërë për këtë lëndë.',
  'No grades yet.': 'Ende pa nota.',

  // ----- edit dialog -----
  'Title': 'Titulli',
  'Type': 'Lloji',
  'Due date': 'Afati',
  'Time (optional)': 'Ora (opsionale)',
  'Notes': 'Shënime',
  'Pages, chapters, what to study…': 'Faqet, kapitujt, çfarë të studiosh…',
  'Done': 'E kryer',
  '★ Starred': '★ Me yll',
  'Steps': 'Hapat',
  'Add a step…': 'Shto një hap…',
  'Due date for this step (optional)': 'Afati për këtë hap (opsional)',
  'Remove': 'Hiq',
  'Break the project into steps. Give a step its own date and it shows up in the checklist and calendar.': 'Ndaje projektin në hapa. Vëri një hapi datën e vet dhe ai shfaqet në listë dhe në kalendar.',
  'Grade': 'Nota',
  'Part of a repeating series': 'Pjesë e një serie të përsëritur',
  'every week': 'çdo javë',
  'every {n} weeks': 'çdo {n} javë',
  'Changes here affect only this one.': 'Ndryshimet këtu prekin vetëm këtë.',
  'Edit the series': 'Ndrysho serinë',
  'Duplicate': 'Kopjo',
  'Same thing again for the next lesson': 'E njëjta gjë përsëri për orën tjetër',
  'Cancel': 'Anulo',
  'Save': 'Ruaj',
  'Saved': 'U ruajt',
  'Saved.': 'U ruajt.',
  'Deleted': 'U fshi',
  'Grade not saved while offline': 'Nota nuk u ruajt pa lidhje',
  'Copied to {when}': 'U kopjua për {when}',

  // ----- repeating dialog -----
  'Repeating homework': 'Detyra të përsëritura',
  'On': 'Më',
  'Active': 'Aktive',
  'Delete series': 'Fshi serinë',
  'Delete this repeating series and its upcoming items? Past and completed ones are kept.': 'Të fshihet kjo seri e përsëritur dhe detyrat e saj të ardhshme? Ato të kaluara dhe të përfunduara mbahen.',
  'Series saved': 'Seria u ruajt',
  'Series deleted': 'Seria u fshi',
  'Nothing repeating yet.': 'Ende asgjë e përsëritur.',
  'on {day}': 'çdo {day}',
  '· stopped': '· ndaluar',
  'Things that come back every week (or two). Upcoming ones are created automatically; add a new one from the checklist by choosing "Every week" when you add it.': 'Gjëra që përsëriten çdo javë (ose dy). Të ardhshmet krijohen automatikisht; shto një të re nga lista duke zgjedhur "Çdo javë" kur e shton.',

  // ----- settings: timetable -----
  'Timetable': 'Orari',
  'Your classes for each day. One class per line, optionally with a start time, e.g. <code>08:00 Math</code>. With times, the app knows which class you\'re in right now.': 'Orët e mësimit për çdo ditë. Një lëndë për rresht, sipas dëshirës me orën e fillimit, p.sh. <code>08:00 Matematikë</code>. Me orët, aplikacioni e di në cilën orë mësimi je tani.',
  'Same every week': 'I njëjtë çdo javë',
  'Alternates A/B weeks': 'Alternon javët A/B',
  'This week is': 'Kjo javë është',
  'Lesson length (min)': 'Kohëzgjatja e orës (min)',
  'Week A': 'Java A',
  'Week B': 'Java B',
  'Show': 'Shfaq',
  'Mon–Fri': 'Hën–Pre',
  'Mon–Sun': 'Hën–Die',
  '08:00 Math&#10;09:00 English': '08:00 Matematikë&#10;09:00 Anglisht',
  'Copy A → B': 'Kopjo A → B',
  'Save timetable': 'Ruaj orarin',

  // ----- settings: holidays / terms -----
  'Holidays': 'Pushimet',
  'School breaks. Repeating homework skips them, the A/B week counter pauses, and the calendar marks them.': 'Pushimet shkollore. Detyrat e përsëritura i kapërcejnë, numërimi i javëve A/B ndalon dhe kalendari i shënon.',
  'No holidays yet.': 'Ende pa pushime.',
  'Name (e.g. Winter break)': 'Emri (p.sh. Pushimet e dimrit)',
  'Holiday': 'Pushim',
  '+ Add holiday': '+ Shto pushim',
  'Save holidays': 'Ruaj pushimet',
  'Terms': 'Periudhat shkollore',
  'Terms or semesters. The checklist counts down the school days left, grade averages and stats can be viewed per term, and completed work from earlier terms is tucked away. To start a new term, add one that begins today.': 'Semestrat ose viti shkollor. Lista numëron ditët e shkollës që kanë mbetur, mesataret dhe statistikat shihen sipas periudhës, dhe detyrat e përfunduara nga periudhat e kaluara fshihen. Për të nisur një periudhë të re, shto një që fillon sot.',
  'No terms yet.': 'Ende pa periudha.',
  'Name (e.g. Term 1)': 'Emri (p.sh. Semestri 1)',
  'Term': 'Periudha',
  'Term {n}': 'Periudha {n}',
  '+ Add term': '+ Shto periudhë',
  'Save terms': 'Ruaj periudhat',

  // ----- settings: grading / language / appearance -----
  'Grading scale': 'Sistemi i notave',
  'How grades are written at your school. Changing this doesn\'t convert grades already entered.': 'Si shkruhen notat në shkollën tënde. Ndryshimi nuk i konverton notat e shënuara më parë.',
  'Grades are': 'Notat janë',
  'Letters A+, A, B, C, D, E': 'Shkronja A+, A, B, C, D, E',
  'Numbers 1–10 (10 is best)': 'Numra 1–10 (10 më e mira)',
  'Language': 'Gjuha',
  'Appearance': 'Pamja',
  'Theme': 'Tema',
  'Match device': 'Si pajisja',
  'Light': 'E çelët',
  'Dark': 'E errët',
  'Accent colour': 'Ngjyra kryesore',

  // ----- settings: subjects -----
  'Subjects': 'Lëndët',
  'The subjects you can pick when adding homework. Each one has a colour for the calendar and its labels. Classes from your timetable are added automatically.': 'Lëndët që mund të zgjedhësh kur shton një detyrë. Secila ka një ngjyrë për kalendarin dhe etiketat e saj. Orët e orarit shtohen automatikisht.',
  'No subjects yet — add your first one below.': 'Ende pa lëndë — shto të parën më poshtë.',
  'New subject (e.g. Math)': 'Lëndë e re (p.sh. Matematikë)',
  '+ Add subject': '+ Shto lëndë',
  'Colour': 'Ngjyra',
  '{subject} is already in the list.': '{subject} është tashmë në listë.',
  'No subject': 'Pa lëndë',
  '+ New subject…': '+ Lëndë e re…',
  'Name of the new subject:': 'Emri i lëndës së re:',

  // ----- settings: notifications -----
  'Phone notifications': 'Njoftimet në telefon',
  'Reminders are sent through <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a>, a free notification app. Install <b>ntfy</b> on your phone, subscribe to a topic name of your choosing (make it hard to guess), and enter the same name below.': 'Kujtesat dërgohen përmes <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a>, një aplikacion falas njoftimesh. Instalo <b>ntfy</b> në telefon, abonohu në një emër teme sipas dëshirës (bëje të vështirë për t\'u gjetur) dhe shkruaj të njëjtin emër më poshtë.',
  'Topic name': 'Emri i temës',
  'ntfy server': 'Serveri ntfy',
  'Send test notification': 'Dërgo njoftim prove',
  'Sending…': 'Duke dërguar…',
  'Could not save settings': 'Cilësimet nuk u ruajtën',
  'Sent! Check your phone.': 'U dërgua! Shiko telefonin.',
  'When to remind me': 'Kur të më kujtojë',
  'Send reminders at': 'Dërgo kujtesat në orën',
  'Days before the due date to get a reminder (comma-separated, e.g. <code>7, 3, 1</code>). Items with a time also get a reminder at that time.': 'Sa ditë para afatit të vijë kujtesa (të ndara me presje, p.sh. <code>7, 3, 1</code>). Detyrat me orë marrin një kujtesë edhe në atë orë.',
  'Tests': 'Testet',
  'Quizzes': 'Kuizet',
  'Projects': 'Projektet',
  'Study sessions': 'Sesionet e studimit',
  'Morning summary of what\'s due today & tomorrow': 'Përmbledhje në mëngjes e asaj që ka afat sot dhe nesër',
  'Summary time': 'Ora e përmbledhjes',
  'Weekly digest of what\'s coming next week': 'Përmbledhje javore e asaj që vjen javën tjetër',
  'Digest day': 'Dita e përmbledhjes javore',
  'Digest time': 'Ora e përmbledhjes javore',
  'Evening "pack your bag": tomorrow\'s classes and what\'s due': 'Në mbrëmje "përgatit çantën": orët e nesërme dhe çfarë ka afat',
  'Pack reminder time': 'Ora e kujtesës për çantën',

  // ----- settings: backups -----
  'Backups': 'Kopjet rezervë',
  'A copy of your data is saved on the server once a day (the newest 30 are kept). Download one to keep it somewhere safe, or set a folder that syncs to the cloud.': 'Një kopje e të dhënave ruhet në server një herë në ditë (mbahen 30 më të rejat). Shkarko një për ta ruajtur diku të sigurt, ose cakto një dosje që sinkronizohet me cloud.',
  'Backup folder': 'Dosja e kopjeve',
  'Leave empty for the app\'s own backups folder': 'Lëre bosh për dosjen e vetë aplikacionit',
  'Back up now': 'Bëj kopje tani',
  'Download backup': 'Shkarko kopjen',
  'Backed up to {file}': 'Kopja u ruajt në {file}',
  'Folder on the server: {dir}': 'Dosja në server: {dir}',
  'No backups yet — the first one is made a few seconds after the app starts. Folder: {dir}': 'Ende pa kopje — e para bëhet pak sekonda pasi niset aplikacioni. Dosja: {dir}',
  'Put everything back from a backup file (one you downloaded, or from the OneDrive folder). The current data is saved to the backups folder first, and your password is kept.': 'Rikthe gjithçka nga një skedar kopjeje (një që ke shkarkuar, ose nga dosja OneDrive). Të dhënat aktuale ruhen fillimisht në dosjen e kopjeve dhe fjalëkalimi mbetet.',
  'Restore…': 'Rikthe…',
  'Choose a backup file first (a .db file from Download backup or the OneDrive folder).': 'Zgjidh fillimisht një skedar kopjeje (një skedar .db nga Shkarko kopjen ose nga dosja OneDrive).',
  'Replace everything with "{name}"?': 'Të zëvendësohet gjithçka me "{name}"?',
  'All homework, grades and settings on the server will be swapped for what\'s in this file. A safety copy of the current data is saved first. Your password stays the same.': 'Të gjitha detyrat, notat dhe cilësimet në server do të zëvendësohen me ato të këtij skedari. Fillimisht ruhet një kopje sigurie e të dhënave aktuale. Fjalëkalimi mbetet i njëjtë.',
  'Restoring…': 'Duke rikthyer…',
  'Restore failed ({status})': 'Rikthimi dështoi ({status})',
  'Restored {items} items and {grades} grades. Previous data saved as {file}.': 'U rikthyen {items} detyra dhe {grades} nota. Të dhënat e mëparshme u ruajtën si {file}.',

  // ----- settings: password / addresses -----
  'Password': 'Fjalëkalimi',
  'One password for the whole app. Each device asks for it once, then remembers for a year.': 'Një fjalëkalim për gjithë aplikacionin. Çdo pajisje e kërkon një herë, pastaj e mban mend për një vit.',
  'Current password': 'Fjalëkalimi aktual',
  'New password': 'Fjalëkalimi i ri',
  'Change password': 'Ndrysho fjalëkalimin',
  'Sign out on this device': 'Dil nga kjo pajisje',
  'New passwords don\'t match.': 'Fjalëkalimet e reja nuk përputhen.',
  'Password changed. Other devices will need to sign in again.': 'Fjalëkalimi u ndryshua. Pajisjet e tjera do të duhet të hyjnë përsëri.',
  'Use on tablet & phone': 'Përdorimi në tablet dhe telefon',
  'Open one of these addresses on your other device:': 'Hap një nga këto adresa në pajisjen tjetër:',
  '(from anywhere)': '(nga kudo)',
  'No network address found — is it connected to the network?': 'Nuk u gjet adresë rrjeti — a është lidhur me rrjetin?',
  'Android/Chrome: menu ⋮ → <b>Add to Home screen</b>. iPhone/iPad: Share → <b>Add to Home Screen</b>.': 'Android/Chrome: menuja ⋮ → <b>Shto në ekranin kryesor</b>. iPhone/iPad: Ndaj → <b>Shto në ekranin kryesor</b>.',

  // ----- sign-in page -----
  'Loading…': 'Duke ngarkuar…',
  'Cannot find the Pi right now. Is it switched on? Try again in a minute.': 'Nuk e gjej dot Pi-në tani. A është e ndezur? Provo sërish pas një minute.',
  'Cannot reach the server.': 'Serveri nuk arrihet.',
  'First time here. Choose a password — you\'ll use it on every device, once.': 'Hera e parë këtu. Zgjidh një fjalëkalim — do ta përdorësh në çdo pajisje, një herë.',
  'Enter the password to open your homework.': 'Shkruaj fjalëkalimin për të hapur detyrat.',
  'Repeat password': 'Përsërit fjalëkalimin',
  'Sign in': 'Hyr',
  'Set password & continue': 'Cakto fjalëkalimin dhe vazhdo',
  'Passwords don\'t match.': 'Fjalëkalimet nuk përputhen.',
  'Failed': 'Dështoi',
};

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}
function setLang(l) {
  LANG = I18N[l] ? l : 'en';
  try { localStorage.setItem('hw_lang', LANG); } catch { /* ignore */ }
}
// Dates: English uses the device's own formatting; Albanian is formatted here so it
// doesn't depend on the browser having Albanian locale data.
const SQ_MONTHS = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];
const SQ_MONTHS_SHORT = ['jan', 'shk', 'mar', 'pri', 'maj', 'qer', 'kor', 'gush', 'sht', 'tet', 'nën', 'dhj'];
const SQ_DAYS = ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'];        // Date.getDay() order
const SQ_DAYS_SHORT = ['die', 'hën', 'mar', 'mër', 'enj', 'pre', 'sht'];
const SQ_DAYS_ON = ['të dielën', 'të hënën', 'të martën', 'të mërkurën', 'të enjten', 'të premten', 'të shtunën'];   // "on Monday"
function fmtDate(d, opts) {
  if (LANG !== 'sq') return d.toLocaleDateString(undefined, opts);
  const parts = [];
  if (opts.weekday) parts.push(opts.weekday === 'long' ? SQ_DAYS[d.getDay()] : SQ_DAYS_SHORT[d.getDay()]);
  let dm = '';
  if (opts.day) dm += d.getDate();
  if (opts.month) dm += (dm ? ' ' : '') + (opts.month === 'long' ? SQ_MONTHS[d.getMonth()] : SQ_MONTHS_SHORT[d.getMonth()]);
  if (opts.year) dm += (dm ? ' ' : '') + d.getFullYear();
  if (dm) parts.push(dm);
  return parts.join(', ');
}
function fmtClock(h, m) {
  if (LANG !== 'sq') return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// fill in everything marked in the HTML
function applyLanguage() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  const mf = document.querySelector('link[rel="manifest"]');
  if (mf) mf.setAttribute('href', LANG === 'sq' ? './manifest-sq.json' : './manifest.json');
  const title = document.querySelector('title[data-i18n-doc]');
  if (title) document.title = t(title.dataset.i18nDoc);
  const apple = document.querySelector('meta[name=apple-mobile-web-app-title]');
  if (apple) apple.content = t('app.name');
}
