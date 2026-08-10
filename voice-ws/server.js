// WebSocket-server med Firebase ID-token-verifiering och Gemini Live API-proxy.

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Modality } from "@google/genai";

const app = express();
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
const server = http.createServer(app);

// Init Firebase Admin (ADC används i Cloud Run)
initializeApp({
  credential: applicationDefault(),
});
const db = getFirestore();

// FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
const API_KEY = process.env.API_KEY;

const AI_MODELS = {
  VOICE: "gemini-2.5-flash-native-audio-preview-09-2025",
};

const wss = new WebSocketServer({ noServer: true });

/** Utility: hämta queryparam från URL */
function getQueryParam(url, key) {
  try {
    const u = new URL(url, "http://localhost");
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}

// --- Helper Functions for System Instruction ---
function toDateSafe(value) {
  if (!value) return null;
  try {
    if (typeof value === "object" && value !== null && "toDate" in value) {
      const d = value.toDate();
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

const getMarketingCoachSystemInstruction_server = (organization) => {
    const allPosts = (organization.displayScreens || []).flatMap(s => s.posts || []);
    const recentPosts = allPosts
        .sort((a, b) => {
            const dateA = a.startDate ? toDateSafe(a.startDate)?.getTime() ?? 0 : 0;
            const dateB = b.startDate ? toDateSafe(b.startDate)?.getTime() ?? 0 : 0;
            return dateB - dateA;
        })
        .slice(0, 5);

    const recentMedia = (organization.mediaLibrary || [])
        .sort((a, b) => toDateSafe(b.createdAt)?.getTime() - toDateSafe(a.createdAt)?.getTime())
        .slice(0, 5);
        
    const customPages = (organization.customPages || []).slice(0, 5);
    const tags = (organization.tags || []).slice(0, 10);
    const postTemplates = (organization.postTemplates || []).slice(0, 5);

    let contentContext = "\n**Användarens nuvarande innehåll i systemet:**";
    if (recentPosts.length > 0) contentContext += "\n- **Senaste inlägg:** " + recentPosts.map(p => `"${p.internalTitle}"`).join(', ');
    if (recentMedia.length > 0) contentContext += "\n- **Senaste media:** " + recentMedia.map(m => `"${m.internalTitle}"`).join(', ');
    if (customPages.length > 0) contentContext += "\n- **Egna infosidor:** " + customPages.map(p => `"${p.title}"`).join(', ');
    if (tags.length > 0) contentContext += "\n- **Definierade taggar:** " + tags.map(t => `"${t.text}"`).join(', ');
    if (postTemplates.length > 0) contentContext += "\n- **Sparade mallar:** " + postTemplates.map(t => `"${t.templateName}"`).join(', ');
    if (contentContext === "\n**Användarens nuvarande innehåll i systemet:**") contentContext = "\nAnvändaren har inte skapat så mycket innehåll än.";

    const orgContext = `
**Företagskontext:**
- Företagsnamn: ${organization.brandName || organization.name}
- Verksamhetstyp: ${organization.businessType?.join(', ') || 'ej angiven'}
- Beskrivning: ${organization.businessDescription || 'ej angiven'}
- Hemsida: ${organization.preferenceProfile?.websiteUrl || 'ej angiven'}
- Exempeltexter (tonalitet): ${(organization.preferenceProfile?.textSnippets || []).map(s => `"${s}"`).join(', ') || 'inga angivna'}
- AI-lärd stilprofil: ${organization.styleProfile?.summary || 'ej analyserad än'}
${contentContext}
`;

    const sp = organization.styleProfile || {};
    const dnaSection = [
        sp.summary ? `Sammanfattning: ${sp.summary}` : "",
        sp.brandPersonality ? `Personlighet: ${sp.brandPersonality}` : "",
        sp.targetAudience ? `Målgrupp: ${sp.targetAudience}` : "",
        sp.coreMessage ? `Kärnbudskap: ${sp.coreMessage}` : "",
        sp.toneOfVoice ? `Tonläge: ${sp.toneOfVoice}` : "",
        sp.visualStyle ? `Visuell stil: ${sp.visualStyle}` : "",
    ].filter(Boolean).join("\n");

    const dnaSectionPromptPart = dnaSection
        ? `\n**VARUMÄRKES-DNA (följ detta i ALLA förslag, formuleringar och idéer du ger):**\n${dnaSection}\n`
        : "";

    const isProfileIncomplete = !organization.businessDescription || !organization.businessType || organization.businessType.length === 0;
    const profileCompletionInstruction = isProfileIncomplete 
        ? "VIKTIGT: Användarens profil är ofullständig. Uppmana dem vänligt att fylla i sin varumärkesprofil under fliken 'Varumärke' för att du ska kunna ge mer träffsäkra tips."
        : "";

    return `Du är Skylie, en digital marknadsassistent i ett system för digitala skyltar.
Din avatar visas i gränssnittet — en rund ikon med blå bakgrund och headset.

Ditt uppdrag är att hjälpa varje företag att skapa bättre innehåll, få idéer och förstå hur de kan använda systemet på bästa sätt. Du är vänlig, coachande och kreativ – men alltid tydlig och effektiv.

Du har tillgång till följande information om företaget du hjälper. Använd alltid denna information för att ge branschspecifika råd och relevanta exempel.
${orgContext}
${dnaSectionPromptPart}

// HÅLL I SYNK med motsvarande guide i services/aiPrompts.ts
**SYSTEMGUIDE — så fungerar plattformen (använd när användaren frågar "hur gör jag..."). Svara ALLTID stegvis, med knapparnas exakta namn, och max 4-5 steg åt gången:**

ORDLISTA: Ett SKYLTFÖNSTER är TV-skärmen i butiken (visas som TV-kort under "Anslutna skyltfönster"). En KANAL är spellistan med inlägg som rullar på skyltfönstret — kanaler döps automatiskt (Kanal 1, Kanal 2) och namnen kan inte ändras. TABLÅN är kanalens schema — knappen "Visa tablå" på kanalraden visar vad som ligger planerat över tid. Ett INLÄGG är en sida i spellistan (bild/video/text).

- LÄGGA UPP NYTT INLÄGG: Fliken Skyltfönster → "Hantera inlägg" på din kanal → "+ Skapa inlägg" → följ de fyra stegen (Layout, Text, Media, Publicering) → "Spara inlägg". Tips: jag kan skapa inlägget åt dig om du beskriver vad du vill visa!
- SNABB-INLÄGG (objekt, bilar, erbjudanden): "Skapa snabb-inlägg ⚡" — rubrik, bild och ev. QR-länk så publiceras det direkt.
- BYTA BILD: "Hantera inlägg" → tre prickar (⋮) på inlägget → "Redigera" → steget "Media" → klicka på bilden.
- PUBLICERA/AVPUBLICERA/ÄNDRA DATUM: varje inlägg i listan har knappen "Publicera" (eller "Ändra datum" om det redan visas) — sätt datum, publicera eller avpublicera med ett klick.
- ÄNDRA ORDNING: pilknapparna till vänster om varje inlägg.
- TA BORT: tre prickar (⋮) → Arkivera (går att ångra) eller Ta bort.
- SE VAD SOM VISAS PÅ SKYLTFÖNSTRET: klicka på TV-bilden under "Anslutna skyltfönster" (TV-kortet visar redan en miniatyr av det som visas), eller ⋮ → "Förhandsgranska" på kanalen.
- EMOJIS: 😀-knappen vid textfälten lägger in emojis i texten, och "Lägg till emoji" under Övriga texter skapar en fritt placerbar emoji (t.ex. 👉 som pekar på QR-koden) som du drar på plats.
- ANSLUTA EN TV: Fliken Skyltfönster → "Anslut nytt skyltfönster" → öppna appen på TV:n → skriv in koden. Extra skyltfönster kostar enligt ditt abonnemang — priset visas i dialogen och under Administration → "Ditt abonnemang".
- BYTA KANAL PÅ ETT SKYLTFÖNSTER: klicka på tre prickar (⋮) på TV-kortet under "Anslutna skyltfönster" → "Byt kanal" → välj kanal. Skyltfönstret växlar direkt, ingen omstart behövs.
- OM SKYLTFÖNSTRET ÄR OFFLINE: en varning visas överst på översikten och TV-kortet blir svart. Kontrollera ström och nätverk — det kopplar upp sig själv igen. Du får även en notis i klockan uppe till höger.
- STÄMPLAR (SÅLD!, NYHET m.m.): märken du bockar i på ett inlägg. Två utseenden: liten etikett i hörnet eller stor stämpel tvärs över. Snabb-inläggsvyn skapar färdiga för din bransch; egna gör du under fliken Varumärke.
- QR-STATISTIK: I "Hantera inlägg" ser du antal skanningar per inlägg och en 7-dagarsgraf.
- DAGENS LEDIGA TIDER: Fliken Automation → "Bokningskalendrar" → lägg till personal med iCal-länk. Skriv {{lediga_tider}} i ett inläggs text så visas tiderna automatiskt.
- ABONNEMANG & AI-KREDITER: Fliken Administration visar ditt abonnemang (pris, antal skyltfönster) och månadens AI-användning.
- BÄTTRE AI-FÖRSLAG: Fyll i fliken Varumärke (beskrivning + DNA-profil) så blir alla mina förslag anpassade till din verksamhet.

Om användaren verkar vilja skapa innehåll: erbjud dig att göra det åt dem direkt istället för att bara förklara stegen.

Du kan:
- Föreslå inläggsidéer, kampanjer och bildstilar som passar användarens bransch och befintliga innehåll.
- Ge korta marknadsföringstips (t.ex. hur man formulerar erbjudanden, använder färg eller skapar säsongsanpassat innehåll).
- Förklara hur systemets funktioner fungerar, på ett pedagogiskt och avdramatiserat sätt.
- Svara på frågor om användarens befintliga innehåll (t.ex. "Vilka är mina senaste inlägg?").

När du svarar:
- Tala i första person (“Jag heter Skylie…”).
- Håll språket enkelt, glatt och konkret.
- Låt dina svar kännas personliga och relevanta för användarens företag.
- Använd gärna emoji sparsamt för att skapa värme (t.ex. 🌟, 💡, 📈).

**VIKTIGA REGLER:**
1. Svara ALLTID på SVENSKA, oavsett vilket språk användaren pratar.
2. Inled ALDRIG konversationen; vänta alltid på att användaren talar först.
3. Undvik att uttala eller skriva ordet 'SmartSkylt'. Använd istället omskrivningar som 'systemet', 'plattformen', 'appen' eller 'tjänsten'. När du refererar till själva produkten (de digitala skyltarna), använd 'era digitala skyltar'.
4. **Diskutera först:** Hoppa inte direkt till att skapa inlägg. Bolla idén med användaren. Fråga om detaljer. Anropa funktionen 'createDisplayPost' först när användaren bekräftar att de vill gå vidare och skapa inlägget.

${profileCompletionInstruction}

Den här assistenten har en visuell avatar som visas i gränssnittet (hämtas från aiAssistant.avatarUrl i Firebase).
`;
};

// --- WebSocket Server Logic ---

server.on("upgrade", async (req, socket, head) => {
  // Endast vår WS-path
  if (!req.url.startsWith("/voice/stream")) {
    socket.destroy();
    return;
  }

  // Verifiera Firebase ID-token och orgId
  const token = getQueryParam(req.url, "token");
  const orgId = getQueryParam(req.url, "orgId");
  if (!token || !orgId) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    await getAuth().verifyIdToken(token);
  } catch (e) {
    console.error("ID token verify failed:", e?.message || e);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // OK – handshaka WS
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", async (ws, req) => {
  const orgId = getQueryParam(req.url, "orgId");
  console.log(`WS connected for org ${orgId}:`, req.socket.remoteAddress);

  // FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
  if (!API_KEY) {
    console.error("API_KEY is not set. Closing connection.");
    ws.close(1011, "AI service not configured.");
    return;
  }
  
  // --- Hämta organisation och bygg systeminstruktion ---
  let systemInstruction = "You are Skylie, a helpful AI assistant."; // Fallback
  try {
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (orgDoc.exists) {
      const organization = orgDoc.data();
      // Hämta displayScreens från subcollection och lägg till på objektet
      const screensSnap = await db.collection("organizations").doc(orgId).collection("displayScreens").get();
      organization.displayScreens = screensSnap.docs.map(d => d.data());
      systemInstruction = getMarketingCoachSystemInstruction_server(organization);
      console.log(`[Org: ${orgId}] System instruction generated for voice chat.`);
    } else {
      console.warn(`[Org: ${orgId}] Organization document not found for voice chat context.`);
    }
  } catch (e) {
    console.error(`[Org: ${orgId}] Failed to fetch org data for voice chat:`, e);
  }

  try {
    // FIX: Per @google/genai guidelines, the API key must be from process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    let sessionPromise; // Håll promise för att kunna skicka verktyg

    ws.on("message", async (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data.type === "ping") {
                ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
                return;
            }
            
            if (data.type === "audio_chunk" && data.data) {
                if (!sessionPromise) { // Initiera session vid första ljud-chunk
                    sessionPromise = ai.live.connect({
                        model: AI_MODELS.VOICE,
                        config: {
                            responseModalities: [Modality.AUDIO],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                            systemInstruction,
                            inputAudioTranscription: {},
                            outputAudioTranscription: {},
                            tools: data.tools || [] // Skicka med verktyg från klienten
                        },
                        callbacks: {
                            onopen: () => {
                              console.log("Gemini session opened for client.");
                              ws.send(JSON.stringify({ type: "connected" }));
                            },
                            onmessage: (message) => {
                              if (ws.readyState !== ws.OPEN) return;
                    
                              const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                              if (audioData) {
                                ws.send(JSON.stringify({ type: "audio_chunk", data: audioData }));
                              }
                    
                              if (message.serverContent?.inputTranscription) {
                                ws.send(JSON.stringify({ type: "transcription_update", source: "user", text: message.serverContent.inputTranscription.text, isFinal: message.serverContent.inputTranscription.isFinal }));
                              }
                    
                              if (message.serverContent?.outputTranscription) {
                                ws.send(JSON.stringify({ type: "transcription_update", source: "model", text: message.serverContent.outputTranscription.text, isFinal: message.serverContent.outputTranscription.isFinal }));
                              }
                    
                              if (message.serverContent?.turnComplete) {
                                ws.send(JSON.stringify({ type: "turn_complete" }));
                              }
                              
                              if (message.serverContent?.interrupted) {
                                console.log("Gemini detected interruption (barge-in). Notifying client.");
                                ws.send(JSON.stringify({ type: "interrupted" }));
                              }

                              if (message.toolCall) {
                                  for (const fc of message.toolCall.functionCalls) {
                                      console.log("Gemini requested tool call:", fc.name);
                                      ws.send(JSON.stringify({ type: "tool_code", data: fc }));
                                  }
                              }
                            },
                            onerror: (e) => {
                              console.error("Gemini session error:", e);
                              if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "error", message: "AI session error." }));
                            },
                            onclose: () => {
                              console.log("Gemini session closed.");
                               if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "session_closed" }));
                            },
                        },
                    });
                }
                
                const session = await sessionPromise;
                session.sendRealtimeInput({
                    media: {
                        data: data.data,
                        mimeType: 'audio/pcm;rate=16000',
                    },
                });
            }
        } catch (e) {
            console.warn("Received non-JSON message or invalid format:", msg.toString().substring(0, 100));
        }
    });

    ws.on("close", async () => {
        console.log("Client WS closed, closing Gemini session if it exists.");
        if (sessionPromise) {
            const session = await sessionPromise;
            session?.close();
        }
    });

    ws.on("error", async (err) => {
        console.error("Client WS error:", err?.message || err);
        if (sessionPromise) {
            const session = await sessionPromise;
            session?.close();
        }
    });

  } catch (e) {
    console.error("Failed to set up Gemini connection logic:", e);
    ws.close(1011, "Failed to connect to AI backend.");
    return;
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`voice-ws listening on :${PORT}`);
});