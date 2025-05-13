'use client'
import fingerprint from "@/app/assets/fingerprint.svg";
import { register } from "module";
import { useState } from "react";
import { getChallengeFromServer, registerUserServerside, getUsers } from "./server/Server";
import { useEffect } from "react";
import Link from "next/link";
import { IUser } from "./models/IUser";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./Utils/Utils";

export default function Home() {
  const [username, setUsername] = useState("hesterbest@hotmail.com");
  const [challenge, setChallenge] = useState("");
  const [publickeycredential, setPublicKeyCredential] = useState<any>(null);
  const [user, setUser] = useState<IUser>({} as IUser);
  const [userDatabase, setUserDatabase] = useState<IUser[]>([]);  

  useEffect(() => {
    const loadUsers = async () => {
      const users = await getUsers();      
      setUserDatabase(users);
    }
    const interval = setInterval(() => loadUsers(), 5000);

    return () => clearInterval(interval); 
  }, []);  

  const getPublicKeyCredentialCreationOptions = (username: string, challenge: string) => {
    return {
      challenge: new Uint8Array(challenge.split("").map(c => c.charCodeAt(0))), // Buffer med challenge, tilfeldig opprettet fra server
      rp: {
        name: "TechIn Demo Website",
        id: "localhost"
      }, // rp: Relying Party, den er ansvarlig for registrering og autentisering av brukeren. Id må være en del av nettleserdomenet. 
      user: {
        id: new Uint8Array(username.split("").map(c => c.charCodeAt(0))), // Buffer med brukerens id, må være unik for hver bruker
        name: username,
        displayName: username
      }, // Brukerdata, 
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }
      ], // Indikerer støttede algoritmer for offentlig nøkkel
      authenticatorSelection: {
        userVerification: "preferred"
      }, // Valgfritt, begrenser hvilken type autentiseringsmetode som kan brukes
      timeout: 60000, // Bruker må respondere innen 60 sekunder
      attestation: "direct" // Attestasjonstype, kan være "none", "indirect" eller "direct", direct = det må medfølge. indirect = det kan medfølge, none = det trenger ikke medfølge
    } as PublicKeyCredentialCreationOptions;
  }


  const registerUser = async (username: string) => {
    console.log("Registrerer bruker: ", username);
    // 1. Hent challenge fra server (generer en tilfeldig streng) 
    const challenge = await getChallengeFromServer(username);
    setChallenge(challenge);
    console.log("Challenge fra server: ", challenge);
    // 2. Bruker får opp dialogboks for å registrere fingeravtrykk / face id / Windows Hello
    console.log("Hent credentials fra autentikator");
    const credential = await navigator.credentials.create({
      publicKey: getPublicKeyCredentialCreationOptions(username, challenge)
    });
    setPublicKeyCredential(credential);
    console.log("Hentet credentialene");
    if (!credential) { alert('Kunne ikke hente credentials!'); return; }
    // 3. Send attestasjonsobjektet til server for lagring av bruker, men siden det er binært konverterer vi det til base64 først
    console.log("Trekk ut attestasjonsobjektet fra credential");
    const attestasjonsObjektet = arrayBufferToBase64((credential as any).response?.attestationObject);
    let user = await registerUserServerside(username, challenge, attestasjonsObjektet);
    setUser(user); // Lagre bruker i state
    console.log("Bruker registrert: ", user);
  }

 const showRegistrationInfo = () => {
    if (!publickeycredential || !challenge || !user) return <></>; // Sørg for at user også er sjekket

    const credentialJSON = {
        id: publickeycredential.id, // Dette er en base64url-kodet versjon av rawId
        type: publickeycredential.type, // Alltid 'public-key'
        rawId: arrayBufferToBase64(publickeycredential.rawId), // Rå binær ID for nøkkelparet
        response: {
            clientDataJSON: arrayBufferToBase64(publickeycredential.response.clientDataJSON), // Data fra nettleseren, base64-kodet
            attestationObject: arrayBufferToBase64(publickeycredential.response.attestationObject), // Data fra autentikatoren, base64-kodet
        },
        // Man kan også legge til getClientExtensionResults() her hvis relevant
        // clientExtensionResults: publickeycredential.getClientExtensionResults(),
    };

    // MERK: attestationObjectExample og authDataExtractedExample er statiske eksempler
    // for illustrasjon. I en ekte implementasjon ville serveren parse de faktiske binære dataene.
    const attestationObjectExample = {
        fmt: 'packed', // Format på attestasjonen (kan variere, f.eks. 'tpm', 'fido-u2f', 'packed')
        attStmt: { // Attestasjonsutsagnet - beviser autentikatorens handling
            alg: -7, // Algoritme brukt for signatur (ES256 i dette eksempelet)
            sig: "Base64-kodet signatur...", // Signaturen fra autentikatoren
            // x5c: ["Base64-kodet attestasjonssertifikat..."] // Kan inneholde sertifikatkjede for autentikatoren
        },
        authData: "Base64-kodet Authenticator Data...", // Kritiske data fra autentikatoren
    };

    const authDataExtractedExample = {
        rpIdHash: "Hash av Relying Party ID (f.eks. 'localhost')",
        flags: { UP: true, UV: true, AT: true, ED: false }, // Statusflagg (User Present, User Verified, Attested Credential Data included)
        signCount: 0, // Signeringsteller
        attestedCredentialData: {
            aaguid: "Unik ID for autentikatormodell (f.eks. Windows Hello)",
            credentialId: "Den unike ID-en for dette nøkkelparet (samme som rawId)",
            credentialPublicKey: "Offentlig nøkkel i COSE-format (strukturert binærdata)"
        },
        extensions: "Eventuelle utvidelsesdata" // Valgfritt
    };

    let userJson = JSON.stringify(user, null, 2); // Viser den faktiske lagrede brukerdataen

    return (
        <div className="space-y-6">
            <p className="text-xl font-semibold">Registreringsprosessen – Hva har skjedd?</p>

            <div>
                <h3 className="text-lg font-medium">1. Utfordringen (Challenge) fra Serveren</h3>
                <p>Serveren genererte en unik, kryptografisk sikker "challenge" for denne registreringsøkten: <code className="bg-gray-200 px-1 rounded">{challenge}</code>.</p>
                <p className="text-sm text-gray-600">Dette forhindrer "replay attacks" – ingen kan gjenbruke gamle registreringsdata.</p>
            </div>

            <div>
                <h3 className="text-lg font-medium">2. Autentikatoren Oppretter Nøkler (`PublicKeyCredential`)</h3>
                <p>Nettleseren ba autentikatoren (Windows Hello) om å opprette et nytt nøkkelpar. Resultatet er et `PublicKeyCredential`-objekt:</p>
                <pre className="text-xs bg-gray-100 p-2 rounded-md overflow-x-auto">{JSON.stringify(credentialJSON, null, 2)}</pre>
                <p className="text-sm text-gray-600 mt-1">
                    Viktige deler her er:
                    <ul className="list-disc list-inside ml-4">
                        <li>`rawId`: Den unike ID-en for det nye nøkkelparet (credential ID).</li>
                        <li>`response.clientDataJSON`: Data satt sammen av nettleseren, inkludert challengen og opprinnelsen (hvilket nettsted det gjelder for). Dette signeres implisitt.</li>
                        <li>`response.attestationObject`: "Beviset" fra autentikatoren. Dette er hva vi sender til serveren.</li>
                    </ul>
                </p>
            </div>

            <div>
                <h3 className="text-lg font-medium">3. `attestationObject` – Autentikatorens Bevis</h3>
                <p>
                    `attestationObject` er en pakke med data fra autentikatoren, kodet i <a className="text-blue-600 hover:underline" href="https://cbor.io/" target="_blank" rel="noopener noreferrer">CBOR</a>-format (en slags binær JSON).
                    Den ble sendt (som base64) til serveren for validering.
                </p>
                <p className="mt-1">Når serveren dekoder CBOR-dataene, kan strukturen se omtrent slik ut (dette er et illustrativt eksempel):</p>
                <pre className="text-xs bg-gray-100 p-2 rounded-md overflow-x-auto">{JSON.stringify(attestationObjectExample, null, 2)}</pre>
                <p className="text-sm text-gray-600 mt-1">
                    Hovedkomponentene i `attestationObject` er:
                    <ul className="list-disc list-inside ml-4">
                        <li>`fmt`: Attestasjonsformatet – forteller serveren hvordan `attStmt` skal tolkes.</li>
                        <li>`attStmt`: Attestasjonsutsagnet – inneholder en digital signatur (`sig`) fra autentikatoren. Denne signaturen beviser at autentikatoren faktisk har generert nøkkelparet for dette nettstedet og denne challengen. Kan også inneholde sertifikater (`x5c`) for å verifisere selve autentikatoren.</li>
                        <li>`authData`: Authenticator Data – kanskje den viktigste delen for serveren.</li>
                    </ul>
                </p>
            </div>

            <div>
                <h3 className="text-lg font-medium">4. `authData` – Detaljer fra Autentikatoren</h3>
                <p>`authData` (Authenticator Data) er en strukturert binær streng som inneholder kritisk informasjon. Når serveren parser dette, får den tilgang til (illustrativt eksempel):</p>
                <pre className="text-xs bg-gray-100 p-2 rounded-md overflow-x-auto">{JSON.stringify(authDataExtractedExample, null, 2)}</pre>
                <p className="text-sm text-gray-600 mt-1">
                    Viktige felt i `authData`:
                    <ul className="list-disc list-inside ml-4">
                        <li>`rpIdHash`: En hash av ID-en til nettstedet ("Relying Party ID"). Serveren sjekker at dette stemmer med sin egen ID.</li>
                        <li>`flags`: Statusflagg:
                            <ul className="list-disc list-inside ml-4">
                                <li>`UP` (User Present): Bekrefter at brukeren var til stede (f.eks. trykket på en knapp).</li>
                                <li>`UV` (User Verified): Bekrefter at brukeren ble verifisert (f.eks. via biometri eller PIN).</li>
                                <li>`AT` (Attested Credential Data): Indikerer at data om den nye nøkkelen er inkludert.</li>
                            </ul>
                        </li>
                        <li>`signCount`: En teller for hvor mange ganger denne autentikatoren har blitt brukt til å signere. Hjelper med å oppdage kloning.</li>
                        <li>`attestedCredentialData`:
                            <ul className="list-disc list-inside ml-4">
                                <li>`aaguid`: Identifiserer typen/modellen av autentikatoren (f.eks. "Microsoft Windows Hello", "Yubico YubiKey").</li>
                                <li>`credentialId`: Den unike ID-en for det nye nøkkelparet (samme som `rawId` vist tidligere).</li>
                                <li>`credentialPublicKey`: Den offentlige delen av det nye nøkkelparet, i <a className="text-blue-600 hover:underline" href="https://datatracker.ietf.org/doc/html/rfc8152" target="_blank" rel="noopener noreferrer">COSE</a>-format. Dette er "indrefileten"!</li>
                            </ul>
                        </li>
                    </ul>
                </p>
            </div>

            <div>
                <h3 className="text-lg font-medium">5. Server-Side Validering – Sikkerheten Sjekkes</h3>
                <p>Før noe lagres, (skal egentlig) serveren utføre en rekke strenge valideringer (men disse har vi droppet nå for enkelthets skyld):</p>
                <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Sjekke at `challenge` i `clientDataJSON` (som er signert) matcher den opprinnelige challengen.</li>
                    <li>Verifisere at `origin` i `clientDataJSON` (også signert) er korrekt.</li>
                    <li>Validere `rpIdHash` i `authData` mot serverens egen ID.</li>
                    <li>Kontrollere `flags` (f.eks. at `UP` er satt, og `UV` hvis påkrevd).</li>
                    <li>Verifisere signaturen (`attStmt.sig`) ved hjelp av attestasjonssertifikatet (hvis `attestation` ikke er "none"). Dette bekrefter autentisiteten til autentikatoren.</li>
                    <li>Sjekke at `credentialId` ikke allerede er registrert for en *annen* bruker. (Koden din tillater at en bruker har flere credentials, noe som er vanlig).</li>
                </ul>
            </div>

            <div>
                <h3 className="text-lg font-medium">6. Lagring av Nøkkelinformasjon</h3>
                <p>Hvis alle valideringer er OK, lagrer serveren brukerens nye WebAuthn-credential. Typisk lagres:</p>
                <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Brukernavn/bruker-ID.</li>
                    <li>`credentialId` (som base64-streng).</li>
                    <li>`credentialPublicKey` (den offentlige nøkkelen i COSE-format, som base64-streng). Serveren må kunne tolke COSE-formatet for å bruke nøkkelen ved innlogging.</li>
                    <li>`signCount` (oppdateres ved hver innlogging).</li>
                    <li>AAGUID (for å vite hvilken type autentikator som ble brukt).</li>
                </ul>
                <p className="mt-1">Den faktiske brukerdataen som ble lagret (eller returnert fra serveren) i denne demoen:</p>
                <pre className="text-xs bg-gray-100 p-2 rounded-md overflow-x-auto">{userJson}</pre>
            </div>

            <div>
                <h3 className="text-lg font-medium">7. Registrering Fullført!</h3>
                <p className="text-green-600 font-semibold">Brukeren er nå registrert med WebAuthn! Klar for passordløs innlogging med den registrerte autentikatoren.</p>
            </div>
        </div>
    );
};


  function registeredUsers() {
    return <div><p>Brukere:</p>{userDatabase.map((user, index) => {
      return (<div key={index} className="text-sm">
        <p>Bruker: {user.id}</p>
      </div>)
    })}</div>
  }


  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <h1 className="text-4xl font-bold text-center sm:text-left">
          TechIn WebAuthn Demo
        </h1>

        <div className="flex flex-row gap-4">
          <p className={`text-lg cursor-pointer font-bold underline `} ><Link href="/">Registrering</Link></p>
          <p className={`text-lg cursor-pointer`}><Link href="/login">Innlogging</Link></p>
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
              onClick={async () => registerUser(username)}>
              <img src={fingerprint.src} alt="Fingerprint" className="w-16 h-16" />
              <p className="text-sm" >Registrer</p>
            </div>



          </div>
        

        {showRegistrationInfo()}
        {registeredUsers()}
      </main >
    </div >
  );
}
