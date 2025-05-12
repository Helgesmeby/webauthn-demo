export interface IUserCredential {
    username:string; // Brukernavn
    credentialId:string; // ID-en til autentiseringsmetoden
    publicKey:string; // Den lagrede autentiseringsmetoden (base64)
}