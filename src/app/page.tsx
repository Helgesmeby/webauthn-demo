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

    if (!publickeycredential) return <></>
    if (!challenge) return <></>

    if (!publickeycredential) return <></>

    const credentialJSON = {
      id: publickeycredential.id,
      type: publickeycredential.type,
      rawId: arrayBufferToBase64(publickeycredential.rawId),
      response: {
        clientDataJson: arrayBufferToBase64(publickeycredential.response.clientDataJson),
        attestationObject: arrayBufferToBase64(publickeycredential.response.attestationObject),
      }
    };

    const attestationObjectExample = {
      fmt: 'tpm',
      attStmt: {
        alg: -65535,
        sig: "Uint8Array(256) [99, 55, 21, 158, 109 ...]",
        ver: '2.0',
        x5c: "[ [Uint8Array(256) [99, 55, 21, 158, 109 ...], Uint8Array(256) [99, 55, 21, 158, 109 ...] ]",
        pubArea: "Uint8Array(118) [0, 35, 0, 11, 0 ...]",
        certInfo: " Uint8Array(161) [255, 84, 67, 71, 128 ...]",
      },
      authData: "Uint8Array(164) [73, 150, 13, 229, 136 ...]",

    }


    const authDataExtractedExample = {
      rpIdHash: ["73, 150, ..."],
      flags: { up: true, uv: true, at: true, ed: false },
      signCount: 0,
      attestedCredentialData: {
        aaguid: ["157, 221,  24,  ..."],
        credentialId: ["242, 135, 235, 163, 254, 154,  ..."],
        credentialPublicKey: ["165,   1,   2,   3,  38,  ..."]
      },
      extensionData: null
    }

    let userJson = JSON.stringify(user, null, 2);



    return (
      <div className="">
        <p className="text-xl mb-5">1. Serveren genererte challengen: {challenge}</p>
        <p className="text-xl">2. PublicKeyCredential som ble generert av autentikatoren (Windows Hello):</p>
        <pre className="text-sm mb-5">{JSON.stringify(credentialJSON, null, 2)} </pre>
        <pre className="inline text-xl mt-5">3. attestationObject</pre> <p className="inline text-xl">er dataene fra autentikatoren.<br/> Denne ble sendt til serveren... som dekodet det (objektet er binært enkodet i <a className="text-blue-900" href="https://cbor.io/">CBOR</a> format)...</p>
        <p className="text-xl mt-5">4. Når vi dekoder det, ser det slik ut:</p>
        <pre className="text-m">{JSON.stringify(attestationObjectExample, null, 2)}</pre>
        <p className="text-xl mt-5">Dette objektet inneholder bl.a. attestasjonsobjektet som vi kan bruke for å verifisere brukeren. Viktigste felt her er sig; signature.</p>
        <p className="text-xl ">Her finner vi også authData som inneholder alt det nødvendige for å verifisere registreringen;</p> <ul className="list-disc ml-5"><li>Relying party id</li><li>Brukerflagg</li><li>Antall registreringer</li><li>Credential id</li><li>Authenticator GUID (AAGUID) (Autentikatormodell, UUID)</li><li>og indrefileten; brukerens public key</li></ul>
        <p className="text-xl">5. Vi dekoder objektet til JSON for å finne public key og credential id:</p>
        <pre className="text-m">{JSON.stringify(authDataExtractedExample, null, 1)}</pre>
        <p className="text-xl">Nå starter valideringen av registreringen:</p>
        <p className="text-xl">6. Vi validerer authenticatorData; sjekk RP id, User Present (UP) og User Verified (UV).   </p>        
        <p className="text-xl">7. Sjekk at credential id ikke er lagret fra før (hver bruker kan ha en eller flere credential id-er tilknyttet) </p>        
        <p className="text-xl mt-5 inline">8. Lagre</p> <pre className="inline text-xl">public key og credential id</pre>
        <p className="text-xl inline"> som base64-tekst. Brukernavn lagres også.</p>
        <p className="text-xl">Public key er lagret i <a className="text-blue-900"  href="https://datatracker.ietf.org/doc/html/rfc8152">COSE</a> format og må dekrypteres og konverteres til base64 før lagring.</p>
        <p className="text-xl mt-5">Lagret bruker ser slik ut:</p>
        <pre className="text-m">{userJson}</pre>
        <p className="text-xl mt-5">9. Nå er brukeren opprettet og vi er klare for å logge inn!</p>
      </div>
    );
  }


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
