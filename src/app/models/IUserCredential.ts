export interface IUserCredential {
    username:string; // Brukernavn (string)
    credentialId:string; // ID-en til autentiseringsmetoden (base64)
    publicKey:string; // Den lagrede autentiseringsmetoden (base64)
    signCount:number; // Antall ganger autentiseringsmetoden er brukt
}