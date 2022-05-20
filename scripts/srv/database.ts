// External Dependencies
import * as mongoDB from "mongodb";

// Global Variables
const DB_CONN_STRING = process.env.DB_CONN_STRING || 'mongodb://127.0.0.1:27017'
const DB_NAME = process.env.DB_NAME || "crabada"
const MINES_COLLECTION_NAME = process.env.MINES_COLLECTION_NAME || "mines"
const STATUS_COLLECTION_NAME = process.env.STATUS_COLLECTION_NAME || "status"
const CAPTCHA_USERS_COLLECTION_NAME = process.env.CAPTCHA_USERS_COLLECTION_NAME || "captcha_users"
const CAPTCHA_ATTACK_TRANSACTION_DATA_COLLECTION_NAME = process.env.CAPTCHA_USERS_COLLECTION_NAME || "attack_transaction_data"

export const collections: { 
    mines?: mongoDB.Collection, 
    status?: mongoDB.Collection, 
    captchaUsers?: mongoDB.Collection,
    attackTransactionsData?: mongoDB.Collection,
} = {}

let client: mongoDB.MongoClient

// Initialize Connection
export async function connectToDatabase() {

    client = new mongoDB.MongoClient(DB_CONN_STRING)

    await client.connect()

    const db: mongoDB.Db = client.db(DB_NAME)

    const minesCollection: mongoDB.Collection = db.collection(MINES_COLLECTION_NAME)
    const statusCollection: mongoDB.Collection = db.collection(STATUS_COLLECTION_NAME)
    const captchaUsersCollection: mongoDB.Collection = db.collection(CAPTCHA_USERS_COLLECTION_NAME)
    const attackTransactionsData: mongoDB.Collection = db.collection(CAPTCHA_ATTACK_TRANSACTION_DATA_COLLECTION_NAME)
 
    collections.mines = minesCollection
    collections.status = statusCollection
    collections.captchaUsers = captchaUsersCollection
    collections.attackTransactionsData = attackTransactionsData
       
    console.log(`Successfully connected to database: ${db.databaseName} and collections:`, 
        minesCollection.collectionName, statusCollection.collectionName,
        captchaUsersCollection.collectionName, attackTransactionsData.collectionName)

}

// TODO close connection or client

export async function disconnectFromDatabase(){
    await client.close();
}
