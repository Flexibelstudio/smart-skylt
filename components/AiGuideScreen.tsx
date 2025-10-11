import React from 'react';
import { MarkdownRenderer } from './CustomContentScreen';

const guideContent = `
# Välkommen till Smart Skylt – Din Kreativa Partner

Smart Skylt är mer än bara digital skyltning. Det är din personliga designer, copywriter och strateg – allt i ett verktyg. Vår unika AI-assistent hjälper dig att skapa professionellt och engagerande innehåll på minuter, så att du kan fokusera på det du gör bäst.

## Ditt Varumärke: Grunden för All Magi

Allt börjar med din **varumärkesprofil**. Det är här du berättar för Smart Skylt vem du är. Genom att ange färger, typsnitt och beskriva din verksamhet ger du AI:n en kreativ kompass. Resultatet? Allt som skapas känns, ser ut och låter precis som du.

---

## Hur fungerar det? Fyra enkla steg

Din profil är AI:ns instruktionsbok. Här är hur varje del hjälper till att forma din unika stil:

**1. Färger sätter den visuella känslan**
Din primärfärg blir grunden i designförslag, medan sekundär- och accentfärger används för att skapa variation och liv i kampanjer och teman.

**2. Typsnitt påverkar tonen i dina texter**
Välj ett modernt, lekfullt eller klassiskt typsnitt. AI:n anpassar sin röst och stil för att matcha ditt val, vilket skapar en enhetlig känsla i all kommunikation.

**3. Verksamhetstyp ger AI:n sammanhang**
Är du ett café, ett gym eller en butik? Genom att ange din bransch förstår AI:n din värld. Den kan då skapa innehåll med rätt språk, anpassat för din målgrupp och med en bildstil som passar just dig.

**4. Beskrivningen ger en personlig röst**
Några korta meningar om vad som gör din verksamhet speciell är guld värt. AI:n använder din beskrivning för att skapa rubriker, texter och idéer som känns genuina, relevanta och trovärdiga.

---

## En AI som lär sig vad du gillar

Ju mer du använder Smart Skylt, desto smartare blir din assistent. AI:n lär sig kontinuerligt av dina val och anpassar sina förslag efter:

*   Vilka **färger och teman** du oftast väljer.
*   Vilken **ton** du föredrar i dina texter.
*   Vilka **typer av kampanjer** du skapar.

Med tiden blir förslagen allt mer träffsäkra. AI:n kommer till och med att föreslå kampanjer som följer ditt årshjul, så att du alltid ligger steget före.

**AI:n lär sig vad du tycker om – och skapar innehåll som ser ut och låter som du.**
`;

export const AiGuideScreen: React.FC = () => {
    return (
        <div className="w-full max-w-4xl mx-auto animate-fade-in">
            <MarkdownRenderer content={guideContent} />
        </div>
    );
};
