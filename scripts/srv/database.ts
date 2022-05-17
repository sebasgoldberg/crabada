// External Dependencies
import * as mongoDB from "mongodb";

// Global Variables
const DB_CONN_STRING = process.env.DB_CONN_STRING || 'mongodb://127.0.0.1:27017'
const DB_NAME = process.env.DB_NAME || "crabada"
const MINES_COLLECTION_NAME = process.env.MINES_COLLECTION_NAME || "mines"
const STATUS_COLLECTION_NAME = process.env.STATUS_COLLECTION_NAME || "status"

export const collections: { mines?: mongoDB.Collection, status?: mongoDB.Collection } = {}

// Initialize Connection
export async function connectToDatabase() {

    const client: mongoDB.MongoClient = new mongoDB.MongoClient(DB_CONN_STRING);

    await client.connect();

    const db: mongoDB.Db = client.db(DB_NAME);

    const minesCollection: mongoDB.Collection = db.collection(MINES_COLLECTION_NAME);
    const statusCollection: mongoDB.Collection = db.collection(STATUS_COLLECTION_NAME);
 
    collections.mines = minesCollection;
    collections.status = statusCollection
       
    console.log(`Successfully connected to database: ${db.databaseName} and collections:`, 
        minesCollection.collectionName, statusCollection.collectionName);

}

// TODO close connection or client