'use client'
import fingerprint from "@/app/assets/fingerprint.svg";
import { register } from "module";
import { useState } from "react";
import { getChallengeFromServer, registerUserServerside, getUsers, loginUserServerside } from "../server/Server";
import { useEffect } from "react";
import Link from "next/link";
import { IUser } from "../models/IUser";





export default function Home() {
  
  const [username, setUsername] = useState("");
  const [challenge, setChallenge] = useState("");
  const [publickeycredential, setPublicKeyCredential] = useState<any>(null);
  const [user, setUser] = useState<IUser>({} as IUser);
  const [userDatabase, setUserDatabase] = useState<IUser[]>([]);

  

  useEffect(() => {
    const interval = setInterval(async () => {
      const users = await getUsers();      
      setUserDatabase(users);

    }, 5000);

    return () => clearInterval(interval); // Cleanup on component unmount
  }, []);


  function arrayBufferToBase64(buffer: any) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }


 

  

  const loginUser = async (username: string) => {
    const challenge = await getChallengeFromServer(username);
    setChallenge(challenge);
     const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: Uint8Array.from(challenge, c => c.charCodeAt(0)),
        // Valgfrie parametere:
        rpId: 'localhost', // Erstatt med din Relying Party ID (vanligvis domenet)
        allowCredentials: [], // Du kan spesifisere hvilke credentials brukeren kan bruke, men er ofte tom for å la nettleseren foreslå alle
        userVerification: 'preferred', // 'required', 'preferred', 'discouraged'
        timeout: 60000, // Valgfri timeout i millisekunder
      },
    });

    console.log("PublicKeyCredential: ", assertion);

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
      </main >
    </div >
  );
}
