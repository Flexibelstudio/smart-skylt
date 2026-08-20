import React, { useState } from 'react';
import { db, firebase } from '../services/firebaseInit';

/* =====================================================================
   SmartSkylt — landningssida
   ---------------------------------------------------------------------
   Renderas av App.tsx när sidan körs i marknadsföringsläge.
   Just nu aktiveras den bara med ?marketing=true (se App.tsx).

   BYT INNEHÅLL HÄR UPPE — resten av filen behöver du inte röra.
   ===================================================================== */

/** Inlägg som visas i galleriet. Byt bild genom att klistra in en ny
 *  Storage-adress. Format styr om kortet visas stående eller liggande. */
const GALLERI: {
  url: string;
  rubrik: string;
  text?: string;
  format: '9:16' | '16:9';
}[] = [
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fgallery%2F1786043480786_gallery-item-1786043480786.png?alt=media&token=98d54419-72c2-4515-a483-22594539e858',
    rubrik: 'Pressoterapi',
    text: 'Ge kroppen den återhämtning den förtjänar.',
    format: '9:16',
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fpost_assets%2Fpost-1786514158187%2Fasset-1786514158199-2r9a9e.jpg?alt=media&token=78236608-c2fb-4b93-bbdc-0d48fdefd007',
    rubrik: 'Bli stark som Torbjörn',
    text: 'Träna tryggt och flexibelt i vår familjära studio.',
    format: '9:16',
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fpost_assets%2Fpost-1786522178919%2Fasset-1786522178926-trawd1.jpg?alt=media&token=68b5b272-e6d4-4f43-8f2b-3d91a7c521fb',
    rubrik: 'Styrka & Flås',
    text: 'Effektiv träning för en balanserad vardag.',
    format: '9:16',
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fpost_assets%2Fpost-1786513809789%2Fasset-1786513809796-o40xik.jpg?alt=media&token=be589f19-d5cf-4699-8f5a-54cd9bbb9195',
    rubrik: 'Starkt jobbat idag',
    text: 'Endorfinerna rusar och tröttheten byts mot tillfredsställelse.',
    format: '16:9',
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fpost_assets%2Fpost-1771322393675%2Fasset-1771322393705-zlheqr.jpg?alt=media&token=63f6994f-fd01-4a33-9a20-69a7ca5ce605',
    rubrik: 'Lätta ben, bättre cirkulation',
    text: 'Känn skillnaden efter träning eller en lång dag.',
    format: '16:9',
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/smart-skylt.firebasestorage.app/o/organizations%2Forg_flexibel-1759257752130%2Fpost_assets%2Fpost-1786521985554%2Fasset-1786521985559-62154t.jpg?alt=media&token=569c61c5-edd2-4b99-97af-b32ef76c90e1',
    rubrik: 'Bygg en starkare vardag',
    text: 'Funktionell styrka i din egen takt.',
    format: '9:16',
  },
];

/** Priset är inte satt ännu. Sätt PRIS när ni landat i siffran, så
 *  byts platshållaren mot ett riktigt prisblock. */
const PRIS: { belopp: string; enhet: string } | null = null;
// Exempel: const PRIS = { belopp: '795 kr', enhet: '/mån per skärm' };

const KONTAKT_EPOST = 'info@flexibelfriskvardhalsa.se';

/** Loggan i navigeringen och sidfoten. Ligger i public/.
 *  Byt sökväg här om ni gör en egen, mindre version. */
const LOGGA = '/favicon.png';

/* ===================== Små byggstenar ===================== */

const Sektion: React.FC<{
  children: React.ReactNode;
  className?: string;
  id?: string;
}> = ({ children, className = '', id }) => (
  <section id={id} className={`px-5 sm:px-8 py-20 sm:py-28 ${className}`}>
    <div className="max-w-6xl mx-auto">{children}</div>
  </section>
);

const Rubrik: React.FC<{ children: React.ReactNode; ljus?: boolean }> = ({
  children,
  ljus,
}) => (
  <h2
    className={`font-display font-black tracking-tight text-3xl sm:text-4xl lg:text-5xl leading-[1.15] pt-[0.1em] ${
      ljus ? 'text-white' : 'text-slate-900'
    }`}
  >
    {children}
  </h2>
);

const Knapp: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primar' | 'sekundar' | 'ljus';
  full?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
}> = ({ children, onClick, variant = 'primar', full, type = 'button', disabled }) => {
  const bas =
    'inline-flex items-center justify-center rounded-full font-bold text-base px-8 py-4 min-h-[52px] transition-all active:scale-95 disabled:opacity-60 disabled:active:scale-100';
  const stil =
    variant === 'primar'
      ? 'bg-primary text-white hover:brightness-95 shadow-lg shadow-teal-500/25'
      : variant === 'ljus'
      ? 'bg-white text-slate-900 hover:bg-slate-100'
      : 'bg-white text-slate-800 border border-slate-300 hover:border-slate-400';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${bas} ${stil} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
};

/** Ett inlägg så som det ser ut på skärmen. */
const InlaggsKort: React.FC<{
  post: (typeof GALLERI)[number];
  className?: string;
}> = ({ post, className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-2xl bg-slate-900 shadow-2xl ring-1 ring-white/10 ${
      post.format === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]'
    } ${className}`}
  >
    <img
      src={post.url}
      alt={post.rubrik}
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />
    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
      <h3 className="font-display font-black text-white leading-[1.2] pt-[0.1em] text-lg sm:text-xl drop-shadow-lg">
        {post.rubrik}
      </h3>
      {post.text && (
        <p className="mt-1.5 text-white/85 text-xs sm:text-sm leading-snug drop-shadow line-clamp-2">
          {post.text}
        </p>
      )}
    </div>
  </div>
);

/* ===================== Sidan ===================== */

export const LandingPage: React.FC<{ onLoginClick?: () => void }> = ({
  onLoginClick,
}) => {
  const [visaFormular, setVisaFormular] = useState(false);

  const scrollaTill = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const staende = GALLERI.filter((p) => p.format === '9:16');
  const liggande = GALLERI.filter((p) => p.format === '16:9');

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans antialiased">
      {/* ---------- Navigering ---------- */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src={LOGGA}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl object-contain"
            />
            <span className="font-display font-black text-lg sm:text-xl tracking-tight text-slate-900">
              Smart<span className="text-primary">Skylt</span>
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            {onLoginClick && (
              <button
                onClick={onLoginClick}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-3 py-2"
              >
                Logga in
              </button>
            )}
            <button
              onClick={() => setVisaFormular(true)}
              className="bg-primary text-white text-sm font-bold rounded-full px-5 py-2.5 hover:brightness-95 transition-all active:scale-95"
            >
              Boka demo
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <Sektion className="bg-gradient-to-b from-slate-50 to-white !pt-14 sm:!pt-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="font-display font-black tracking-tight text-slate-900 text-4xl sm:text-5xl lg:text-6xl leading-[1.1] pt-[0.1em]">
              Skyltfönstret som säljer även när ni har stängt.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-xl">
              Byt vad skärmen visar från mobilen. AI:n skriver och formger i era
              färger — du godkänner.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Knapp onClick={() => setVisaFormular(true)}>Boka 15 minuter</Knapp>
              <Knapp variant="sekundar" onClick={() => scrollaTill('galleri')}>
                Se hur det ser ut
              </Knapp>
            </div>
            <p className="mt-6 text-sm text-slate-500">
              Ingen startavgift. Du behåller skärmen du redan har.
            </p>
          </div>

          {/* Skärmen som hjälte */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative mx-auto w-full max-w-[300px]">
              <div className="rounded-[2rem] bg-slate-900 p-3 shadow-2xl ring-1 ring-white/10">
                {staende[0] && <InlaggsKort post={staende[0]} className="!rounded-3xl" />}
              </div>
              <div className="mx-auto mt-0 h-6 w-24 rounded-b-xl bg-slate-800" />
              <div className="mx-auto h-2 w-40 rounded-full bg-slate-300" />
            </div>
          </div>
        </div>
      </Sektion>

      {/* ---------- Problemet ---------- */}
      <Sektion className="bg-slate-900">
        <div className="max-w-3xl">
          <Rubrik ljus>Vi vet hur det ser ut.</Rubrik>
          <ul className="mt-10 space-y-5">
            {[
              'Affischen i fönstret är från i våras.',
              'Den som gjorde den jobbar inte kvar, och filen finns inte kvar.',
              'Ni har en skärm — men den visar samma sak som i januari.',
            ].map((rad) => (
              <li key={rad} className="flex gap-4 text-lg sm:text-xl text-slate-300">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{rad}</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xl sm:text-2xl font-semibold text-white leading-snug">
            Det handlar inte om lathet. Det handlar om att det tar för lång tid.
          </p>
        </div>
      </Sektion>

      {/* ---------- Tre steg ---------- */}
      <Sektion>
        <Rubrik>Från idé till skärm på två minuter.</Rubrik>
        <div className="mt-14 grid md:grid-cols-3 gap-8 sm:gap-10">
          {[
            {
              nr: '1',
              titel: 'Skapa',
              text: 'Skriv en mening om vad du vill säga. Du får tillbaka rubrik, text och bild i era färger. Eller ta ett foto med mobilen och skicka upp det direkt.',
            },
            {
              nr: '2',
              titel: 'Schemalägg',
              text: 'Bestäm när det ska visas. Vardagar 08–17, hela december, eller bara idag.',
            },
            {
              nr: '3',
              titel: 'Visa',
              text: 'Inlägget syns på skärmen inom några sekunder. Inget USB-minne, ingen omstart, ingen som behöver åka dit.',
            },
          ].map((steg) => (
            <div key={steg.nr}>
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary font-display font-black text-xl flex items-center justify-center">
                {steg.nr}
              </div>
              <h3 className="mt-5 font-display font-bold text-xl text-slate-900">
                {steg.titel}
              </h3>
              <p className="mt-2.5 text-slate-600 leading-relaxed">{steg.text}</p>
            </div>
          ))}
        </div>
      </Sektion>

      {/* ---------- Galleri ---------- */}
      <Sektion id="galleri" className="bg-slate-50">
        <div className="max-w-2xl">
          <Rubrik>Det ska se ut som ni. Inte som en mall.</Rubrik>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">
            Vi läser av er hemsida och hämtar era färger, era typsnitt och ert
            tonläge. Första inlägget ni gör ser redan ut som er verksamhet.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {staende.map((post) => (
            <InlaggsKort key={post.url} post={post} />
          ))}
        </div>
        {liggande.length > 0 && (
          <div className="mt-4 sm:mt-6 grid sm:grid-cols-2 gap-4 sm:gap-6">
            {liggande.map((post) => (
              <InlaggsKort key={post.url} post={post} />
            ))}
          </div>
        )}
      </Sektion>

      {/* ---------- Branscher ---------- */}
      <Sektion>
        <Rubrik>Tre exempel, från kunder som era.</Rubrik>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {[
            {
              titel: 'Salong',
              text: 'Lediga tider den här veckan. Nya behandlingar. Produkterna i hyllan bakom kassan.',
            },
            {
              titel: 'Mäklare',
              text: 'Objekten i fönstret, som byts automatiskt. Visningstider. Såld-stämpel när det är klart — samma dag, inte nästa vecka.',
            },
            {
              titel: 'Butik',
              text: 'Veckans erbjudande. Nyheter i sortimentet. Öppettider som faktiskt stämmer.',
            },
          ].map((b) => (
            <div
              key={b.titel}
              className="rounded-2xl border border-slate-200 bg-white p-7 hover:border-primary/40 transition-colors"
            >
              <h3 className="font-display font-bold text-xl text-slate-900">
                {b.titel}
              </h3>
              <p className="mt-3 text-slate-600 leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </Sektion>

      {/* ---------- AI ---------- */}
      <Sektion className="bg-slate-900">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Rubrik ljus>Du behöver inte komma på vad du ska skriva.</Rubrik>
            <ul className="mt-9 space-y-6">
              {[
                'Skriv en mening — få ett färdigt inlägg med rubrik, text och bild.',
                'Systemet föreslår själv utifrån säsong, högtider och vad ni brukar göra den här tiden på året.',
                'Du godkänner eller struntar i. Ingenting publiceras utan att du sagt ja.',
              ].map((rad) => (
                <li key={rad} className="flex gap-4 text-slate-300 text-lg leading-relaxed">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="mt-1 h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{rad}</span>
                </li>
              ))}
            </ul>
          </div>
          {staende[1] && (
            <div className="mx-auto w-full max-w-[260px]">
              <InlaggsKort post={staende[1]} />
            </div>
          )}
        </div>
      </Sektion>

      {/* ---------- Hårdvara ---------- */}
      <Sektion>
        <div className="max-w-3xl">
          <Rubrik>Vad behöver jag köpa?</Rubrik>
          <p className="mt-5 text-xl text-slate-500">Mindre än du tror.</p>
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {[
              {
                titel: 'En smart-TV',
                text: 'En TV med Android. Har ni redan en i fönstret fungerar den oftast. Är TV:n äldre löser en liten Android-box samma sak.',
              },
              { titel: 'Wifi', text: 'Det ni redan har räcker.' },
              {
                titel: 'Vi fixar resten',
                text: 'Vi ställer in TV:n och kopplar upp den mot er kanal. Ni behöver inte installera något själva.',
              },
            ].map((h) => (
              <div key={h.titel} className="rounded-2xl bg-slate-50 p-6">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  {h.titel}
                </h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">{h.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-lg text-slate-700">
            Ni är igång samma dag.
          </p>
        </div>
      </Sektion>

      {/* ---------- Om oss ---------- */}
      <Sektion className="bg-slate-50">
        <div className="max-w-3xl">
          <Rubrik>Vi byggde det för oss själva först.</Rubrik>
          <div className="mt-7 space-y-5 text-lg text-slate-600 leading-relaxed">
            <p>
              Vi driver Flexibel Hälsostudio i Salem och Hisings Kärra. Vi hade två
              skärmar och ingen tid, och inget av det som fanns var enkelt nog att
              faktiskt bli av.
            </p>
            <p className="text-slate-800 font-medium">
              Så vi byggde ett eget. Vi använder det varje vecka — allt du ser här
              använder vi själva, varje dag.
            </p>
          </div>
        </div>
      </Sektion>

      {/* ---------- Pris ---------- */}
      <Sektion>
        <div className="max-w-2xl mx-auto text-center">
          <Rubrik>Ett pris per skärm.</Rubrik>
          {PRIS ? (
            <p className="mt-8 font-display font-black text-5xl text-slate-900">
              {PRIS.belopp}
              <span className="block mt-2 text-lg font-sans font-normal text-slate-500">
                {PRIS.enhet}
              </span>
            </p>
          ) : (
            <p className="mt-8 text-lg text-slate-600">
              Hör av dig så går vi igenom vad det kostar för just er.
            </p>
          )}
          <p className="mt-6 text-slate-500">
            Ingen startavgift. Du behåller skärmen du redan har.
          </p>
        </div>
      </Sektion>

      {/* ---------- Slut-CTA ---------- */}
      <Sektion className="bg-primary">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display font-black tracking-tight text-white text-3xl sm:text-4xl lg:text-5xl leading-[1.15] pt-[0.1em]">
            Vill du se hur det skulle se ut hos er?
          </h2>
          <p className="mt-6 text-lg text-white/90 leading-relaxed">
            Boka femton minuter. Vi visar systemet och gör ett inlägg i era färger
            medan du tittar på.
          </p>
          <div className="mt-9 flex justify-center">
            <Knapp variant="ljus" onClick={() => setVisaFormular(true)}>
              Boka 15 minuter
            </Knapp>
          </div>
        </div>
      </Sektion>

      {/* ---------- Sidfot ---------- */}
      <footer className="border-t border-slate-200 px-5 sm:px-8 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2.5">
            <img
              src={LOGGA}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <span className="font-display font-black text-base text-slate-900">
              Smart<span className="text-primary">Skylt</span>
            </span>
          </span>
          <a href={`mailto:${KONTAKT_EPOST}`} className="hover:text-slate-900">
            {KONTAKT_EPOST}
          </a>
        </div>
      </footer>

      {visaFormular && <DemoFormular onStang={() => setVisaFormular(false)} />}
    </div>
  );
};

/* ===================== Formulär ===================== */

const DemoFormular: React.FC<{ onStang: () => void }> = ({ onStang }) => {
  const [falt, setFalt] = useState({
    namn: '',
    foretag: '',
    epost: '',
    telefon: '',
    meddelande: '',
  });
  const [skickar, setSkickar] = useState(false);
  const [klart, setKlart] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const uppdatera = (nyckel: keyof typeof falt) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setFalt((f) => ({ ...f, [nyckel]: e.target.value }));

  const skicka = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!falt.namn || !falt.foretag || !falt.epost) return;
    setSkickar(true);
    setFel(null);
    try {
      if (!db) throw new Error('Ingen databasanslutning');
      await db.collection('leads').add({
        ...falt,
        kalla: 'landningssida',
        skapad: firebase.firestore.FieldValue.serverTimestamp(),
      });
      setKlart(true);
    } catch (err) {
      console.error('Kunde inte spara lead:', err);
      setFel(
        `Något gick fel. Mejla oss gärna direkt på ${KONTAKT_EPOST} så hör vi av oss.`
      );
    } finally {
      setSkickar(false);
    }
  };

  const faltStil =
    'w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary focus:border-primary transition';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6"
      onClick={onStang}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {klart ? (
          <div className="text-center py-8">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h3 className="mt-5 font-display font-black text-2xl text-slate-900">
              Tack!
            </h3>
            <p className="mt-2 text-slate-600">Vi hör av oss inom en arbetsdag.</p>
            <div className="mt-7">
              <Knapp variant="sekundar" onClick={onStang} full>
                Stäng
              </Knapp>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display font-black text-2xl text-slate-900 leading-[1.2] pt-[0.1em]">
                  Boka 15 minuter
                </h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                  Vi visar systemet och gör ett inlägg i era färger medan du tittar
                  på.
                </p>
              </div>
              <button
                onClick={onStang}
                aria-label="Stäng"
                className="shrink-0 h-10 w-10 rounded-full hover:bg-slate-100 text-slate-500 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={skicka} className="mt-6 space-y-4">
              <input
                className={faltStil}
                placeholder="Namn"
                value={falt.namn}
                onChange={uppdatera('namn')}
                required
              />
              <input
                className={faltStil}
                placeholder="Företag"
                value={falt.foretag}
                onChange={uppdatera('foretag')}
                required
              />
              <input
                className={faltStil}
                type="email"
                placeholder="E-post"
                value={falt.epost}
                onChange={uppdatera('epost')}
                required
              />
              <input
                className={faltStil}
                type="tel"
                placeholder="Telefon (valfritt)"
                value={falt.telefon}
                onChange={uppdatera('telefon')}
              />
              <textarea
                className={`${faltStil} resize-none`}
                rows={3}
                placeholder="Vad skulle du vilja visa på din skärm? (valfritt)"
                value={falt.meddelande}
                onChange={uppdatera('meddelande')}
              />

              {fel && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  {fel}
                </p>
              )}

              <Knapp type="submit" full disabled={skickar}>
                {skickar ? 'Skickar…' : 'Skicka'}
              </Knapp>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default LandingPage;
