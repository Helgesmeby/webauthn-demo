'use client'
import fingerprint from "@/app/assets/fingerprint.svg";
import { register } from "module";
import { useState } from "react";
import { getChallengeFromServer, registerUserServerside, getUsers, loginUserServerside } from "../server/Server";
import { useEffect } from "react";
import Link from "next/link";
import { IUser } from "../models/IUser";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../Utils/Utils";





export default function Home() {

    const [username, setUsername] = useState("hesterbest@hotmail.com");
    const [challenge, setChallenge] = useState("");
    const [publickeycredential, setPublicKeyCredential] = useState<any>(null);
    const [user, setUser] = useState<IUser>({} as IUser);
    const [userDatabase, setUserDatabase] = useState<IUser[]>([]);
    const [loginAttemptComplete, setLoginAttemptComplete] = useState(false);
    const [loginError, setLoginError] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(false);
    



    useEffect(() => {
        const interval = setInterval(async () => {
            const users = await getUsers();
            setUserDatabase(users);

        }, 5000);

        return () => clearInterval(interval); // Cleanup on component unmount
    }, []);


    
    /**
     * @description Henter publicKeyCredentialCreationOptions for registrering av bruker
     * @param username  - Brukernavn
     */
    const loginUser = async (username: string) => {
        const challenge = await getChallengeFromServer(username);
        setChallenge(challenge);
        const credential = await navigator.credentials.get({
            publicKey: {
                challenge: Uint8Array.from(challenge, c => c.charCodeAt(0)), // Buffer med challenge, tilfeldig opprettet fra server        
                rpId: 'localhost', // Relying Party ID, må være en del av domenet brukeren står i (localhost)
                allowCredentials: [], // Du kan spesifisere hvilke credentials brukeren kan bruke, men er ofte tom for å la nettleseren foreslå alle
                userVerification: 'preferred', // 'required', 'preferred', 'discouraged'
                timeout: 60000, // Valgfri timeout i millisekunder
            },
        });

        if (!credential) {
            console.error("Ingen credential ble opprettet");
            return;
        }

        console.log("PublicKeyCredential: ", credential);
        setPublicKeyCredential(credential);



        const credentialId = arrayBufferToBase64((credential as any).rawId);
        const clientDataJSON = arrayBufferToBase64((credential as any).response.clientDataJSON);
        const authenticatorData = arrayBufferToBase64((credential as any).response.authenticatorData);
        const signature = arrayBufferToBase64((credential as any).response.signature);
        const userHandle = arrayBufferToBase64((credential as any).response.userHandle);
        console.log("Credential id login: ", credentialId);
        const loginResponse = await loginUserServerside(username, credentialId, clientDataJSON, authenticatorData, signature, userHandle, "localhost")

        if (loginResponse && loginResponse.verified) {
            console.log("Bruker logget inn: ", loginResponse);
            alert("Bruker logget inn: " + username);
            setLoginSuccess(true);
        } else {
            console.error("Feil ved innlogging: " + loginResponse?.error);
            alert("Feil ved innlogging: " + loginResponse?.error);
            setLoginError(true);
            setLoginSuccess(false);
        }

        setLoginAttemptComplete(true);


    }

    /**
     * @description Henter publicKeyCredentialCreationOptions for registrering av bruker
     * @param username  - Brukernavn
     */
    function registeredUsers() {
        return <div><p>Brukere:</p>{userDatabase.map((user, index) => {
            return (<div key={index} className="text-sm">
                <p>Bruker: {user.id}</p>
            </div>)
        })}</div>
    }

   function showLoginInfo() {
    if (!loginAttemptComplete) return <></>;

    // En hjelpefunksjon for å stringifye PublicKeyCredential-objektet,
    // siden det inneholder ArrayBuffer-objekter som ikke vises pent med vanlig JSON.stringify.
    const publicKeyCredentialToString = (cred:any) => {
        if (!cred) {
            return loginAttemptComplete ? "Ingen PublicKeyCredential-objekt mottatt eller det er tomt." : "Venter på innloggingsforsøk...";
        }
        try {
            return JSON.stringify(
                {
                    id: cred.id,
                    rawId: cred.rawId ? `ArrayBuffer (lengde: ${cred.rawId.byteLength}) - omgjort til base64url før sending` : null,
                    type: cred.type,
                    response: {
                        clientDataJSON: cred.response?.clientDataJSON ? `ArrayBuffer (lengde: ${cred.response.clientDataJSON.byteLength}) - inneholder challenge, origin, type` : null,
                        authenticatorData: cred.response?.authenticatorData ? `ArrayBuffer (lengde: ${cred.response.authenticatorData.byteLength}) - inneholder rpIdHash, teller, flagg` : null,
                        signature: cred.response?.signature ? `ArrayBuffer (lengde: ${cred.response.signature.byteLength}) - selve signaturen` : null,
                        userHandle: cred.response?.userHandle ? `ArrayBuffer (lengde: ${cred.response.userHandle.byteLength}) - brukerens ID i autentikatoren` : null,
                    },
                    clientExtensionResults: cred.clientExtensionResults,
                },
                null,
                2
            );
        } catch (e) {
            return "Klarte ikke å serialisere PublicKeyCredential-objektet.";
        }
    };

    return (
        <div>
            <p className="text-xl mb-5">Innlogging var {loginSuccess ? "Vellykket! 🥳" : "Mislykket :("}</p>
            <p className="text-xl mb-5">Dette skjedde nettopp under innloggingen:</p>

            <p className="text-lg mb-3 font-semibold">På klientsiden (i nettleser):</p>
            <p className="text-m mb-5 pl-5">1. Serveren genererte en unik "challenge" (utfordring) for denne innloggingsøkten: <code className="bg-gray-200 px-1 rounded">{challenge || "ikke tilgjengelig"}</code>.</p>
            <p className="text-m mb-5 pl-5">2. Nettleseren, via WebAuthn-API-et (`navigator.credentials.get()`), ba autentikatoren (Windows Hello) om å lage en "assertion" (et digitalt bevis på at du er deg). Dette innebar følgende:</p>
            <p className="text-m mb-5 pl-10">    2.1. Autentikatoren verifiserte at forespørselen kom fra et tillatt nettsted (Relying Party ID, i dette tilfellet satt til <code>localhost</code>).</p>
            <p className="text-m mb-5 pl-10">    2.2. Bruker bekreftet tilstedeværelse (var tilstede) og identitet (biometri).</p>
            <p className="text-m mb-5 pl-10">    2.3. Autentikatoren brukte den private nøkkelen (som ble opprettet under registreringen og er lagret sikkert i autentikatoren) til å signere spesifikke data. Disse dataene inkluderer `authenticatorData` (som inneholder info om rpId, en signaturteller, og om brukeren ble verifisert) og en hash av `clientDataJSON` (som inneholder challengen fra serveren og informasjon om hvor forespørselen kom fra).</p>
            <p className="text-m mb-5 pl-5">3. Resultatet fra autentikatoren var et `PublicKeyCredential`-objekt. Slik så det omtrent ut (ArrayBuffers vises forenklet):</p>
            <pre className="text-sm mb-5 bg-gray-100 p-2 rounded overflow-x-auto">{publicKeyCredentialToString(publickeycredential)}</pre>
            <p className="text-m mb-5 pl-5">De viktigste delene av dette objektet (`rawId`, `response.clientDataJSON`, `response.authenticatorData`, `response.signature`, og evt. `response.userHandle`) ble så konvertert til base64url-format og sendt til serveren.</p>

            <p className="text-lg mb-3 font-semibold">På serversiden:</p>
            <p className="text-m mb-5 pl-5">4. Serveren mottok dataene fra nettleseren og utførte en grundig valideringsprosess i flere steg:</p>
            <p className="text-m mb-5 pl-10">    4.1. <b>Dekoding:</b> Dataene (som `credentialId` (fra `rawId`), `clientDataJSON`, `authenticatorData` og `signature`) ble først dekodet fra base64url-format tilbake til binærdata som serveren kan prosessere.</p>
            <p className="text-m mb-5 pl-10">    4.2. <b>Bruker- og nøkkeloppslag:</b> Serveren brukte `credentialId` til å finne den registrerte brukeren og hente den tilhørende offentlige nøkkelen som ble lagret under brukerens registrering.</p>
            <p className="text-m mb-5 pl-10">    4.3. <b>Verifisering av `clientDataJSON`:</b></p>
            <p className="text-m mb-5 pl-16">    • Sjekket at `type`-feltet var `webauthn.get`, som indikerer en innloggingsforespørsel.</p>
            <p className="text-m mb-5 pl-16">    • Verifiserte at `challenge` i `clientDataJSON` var nøyaktig den samme som serveren sendte ut i steg 1 (<code>{challenge || "ikke tilgjengelig"}</code>). Dette forhindrer "replay attacks".</p>
            <p className="text-m mb-5 pl-16">    • Kontrollerte at `origin`-feltet (nettadressen forespørselen kom fra) stemte med serverens forventede origin (f.eks. <code>http://localhost</code> for denne demoen).</p>
            <p className="text-m mb-5 pl-10">    4.4. <b>Verifisering av `authenticatorData`:</b></p>
            <p className="text-m mb-5 pl-16">    • Verifiserte at `rpIdHash` (en hash av Relying Party ID) i `authenticatorData` stemte overens med serverens egen ID. Dette sikrer at autentiseringen er ment for dette nettstedet.</p>
            <p className="text-m mb-5 pl-16">    • Sjekket at "User Present" (UP)-flagget var satt, som bekrefter at brukeren var fysisk til stede under autentiseringen.</p>
            <p className="text-m mb-5 pl-16">    • (Valgfritt, avhengig av serverpolicy) Kunne ha sjekket "User Verified" (UV)-flagget for å se om brukeren ble spesifikt verifisert (f.eks. med PIN eller biometri).</p>
            <p className="text-m mb-5 pl-10">    4.5. <b>Klargjøring av offentlig nøkkel:</b> Den lagrede offentlige nøkkelen (som er i <a href="https://datatracker.ietf.org/doc/html/rfc8152">COSE-format</a> – et standardisert binærformat for nøkler) ble dekodet. For å kunne brukes i kryptografiske biblioteker, ble den så konvertert til et standardformat som f.eks. PEM.</p>
            <p className="text-m mb-5 pl-10">    4.6. <b>Selve signaturverifiseringen:</b> Dette er kjernen i sikkerheten! Serveren brukte brukerens lagrede (og nå klargjorte) offentlige nøkkel til å verifisere `signaturen` som ble mottatt. Signaturen ble opprinnelig laget over `authenticatorData` + en hash av `clientDataJSON`. En gyldig signatur beviser kryptografisk at en autentikator som besitter den korresponderende private nøkkelen har godkjent denne spesifikke innloggingen.</p>
            <p className="text-m mb-5 pl-10">    4.7. <b>Verifisering av signaturteller:</b> Serveren sjekket signaturtelleren (en verdi som øker for hver bruk) i `authenticatorData` mot den sist lagrede telleren for denne spesifikke autentikatoren/nøkkelen. Hvis den nye telleren ikke er høyere, kan det indikere et problem (f.eks. et forsøk på å bruke en klonet autentikator), og innloggingen bør avvises.</p>

            <p className="text-lg mb-3 font-semibold">Resultat:</p>
            <p className="text-m mb-5 pl-5">{loginSuccess ? "Alle serverens verifiseringer (steg 4.1-4.7) var vellykkede!" : "Minst én av serverens verifiseringer (steg 4.1-4.7) feilet, og innloggingen ble derfor avvist."}</p>
            <p className="text-m mb-5 pl-5">{loginSuccess ? "5. Vi ble autentisert! Serveren oppdaterte også den lagrede signaturtelleren for denne autentikatoren til den nye, høyere verdien." : "5. Innlogging mislyktes."}</p>

             {loginSuccess && (
                <>
                    <p className="text-lg mb-3 font-semibold mt-8">Steg 6: Hva nå? Opprette en sikker sesjon med JWT (JSON Web Token)</p>
                    <p className="text-m mb-5 pl-5">Etter en vellykket WebAuthn-autentisering, kan man f.eks. etablere en brukerøkt (sesjon) slik at brukeren ikke trenger å autentisere seg på nytt for hver enkelt handling på nettstedet. En vanlig metode for dette er å bruke JSON Web Tokens (JWTs).</p>
                    <p className="text-m mb-5 pl-10">    6.1. <b>Generering av JWT:</b> Når serveren har bekreftet din identitet (som i steg 5), kan den generere en JWT. Dette er en kompakt, URL-sikker streng som inneholder "claims" om brukeren og sesjonen. Typiske claims er:</p>
                    <p className="text-m mb-5 pl-16">    • <code>sub</code> (Subject): Brukerens unike ID.</p>
                    <p className="text-m mb-5 pl-16">    • <code>name</code>: Brukerens navn (valgfritt).</p>
                    <p className="text-m mb-5 pl-16">    • <code>iat</code> (Issued At): Tidspunktet tokenet ble utstedt.</p>
                    <p className="text-m mb-5 pl-16">    • <code>exp</code> (Expiration Time): Tidspunktet tokenet utløper og ikke lenger er gyldig.</p>
                    <p className="text-m mb-5 pl-10">    6.2. <b>Signering av JWT:</b> For å sikre at JWT-en ikke kan tukles med, signeres den av serveren med en hemmelig nøkkel eller et privat nøkkelpar. Bare serveren kan lage gyldige signaturer.</p>
                    <p className="text-m mb-5 pl-10">    6.3. <b>Sending til klienten:</b> Den signerte JWT-en sendes tilbake til nettleseren din som en del av svaret på innloggingsforespørselen.</p>
                    <p className="text-m mb-5 pl-10">    6.4. <b>Lagring på klienten:</b> Nettleseren lagrer JWT-en. Vanlige steder er `localStorage`, `sessionStorage`, eller som en `HttpOnly` cookie (som gir bedre beskyttelse mot XSS-angrep).</p>
                    <p className="text-m mb-5 pl-10">    6.5. <b>Bruk i påfølgende forespørsler:</b> For hver etterfølgende forespørsel til beskyttede ressurser på serveren, sender nettleseren JWT-en med, vanligvis i `Authorization`-headeren (f.eks. <code>Authorization: Bearer &lt;token&gt;</code>).</p>
                    <p className="text-m mb-5 pl-10">    6.6. <b>Validering på serveren:</b> For hver forespørsel som inneholder en JWT, må serveren validere tokenet:</p>
                    <p className="text-m mb-5 pl-16">    • Verifisere signaturen for å sikre at tokenet er autentisk og ikke endret.</p>
                    <p className="text-m mb-5 pl-16">    • Sjekke at tokenet ikke er utløpt (`exp`-claimet).</p>
                    <p className="text-m mb-5 pl-16">    • Eventuelt sjekke andre claims (f.eks. `iss` - issuer, `aud` - audience).</p>
                    <p className="text-m mb-5 pl-5">Hvis JWT-en er gyldig, får brukeren tilgang. Dette skaper en "state-less" sesjonshåndtering, da serveren ikke trenger å lagre sesjonsinformasjon selv, men kan stole på informasjonen i den validerte JWT-en.</p>
                </>
            )}
        </div>
    );
}


    return (
        <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
            <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
                <h1 className="text-4xl font-bold text-center sm:text-left">
                    TechIn WebAuthn Demo
                </h1>

                <div className="flex flex-row gap-4">
                    <p className={`text-lg cursor-pointer `} ><Link href="/">Registrering</Link></p>
                    <p className={`text-lg cursor-pointer font-bold underline`} ><Link href="/login">Innlogging</Link></p>
                </div>


                <div className="flex flex-row gap-2 w-full max-w-sm items-center">
                    <div className="flex flex-col flex-grow">
                        <label htmlFor="username" className="text-sm">
                            Brukernavn
                        </label>
                        <input
                            id="username"
                            type="text"
                            placeholder="email@domain.com"
                            className="input border border-black-300 rounded-md p-2"
                            onChange={(e) => setUsername(e.target.value)}
                            value={username}
                        />
                    </div>
                    <div className="border rounded-md p-2 hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={async () => { loginUser(username) }}>
                        <img src={fingerprint.src} alt="Fingerprint" className="w-16 h-16" />
                        <p className="text-sm">Logg inn</p>
                    </div>
                </div>



                {registeredUsers()}
                {showLoginInfo()}
            </main >
        </div >
    );
}
