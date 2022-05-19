import { task, types } from "hardhat/config";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { currentServerTimeStamp } from "../scripts/crabada";
import { collections, connectToDatabase, disconnectFromDatabase } from "../scripts/srv/database";
import { IApiMine } from "../scripts/strategy";
import { delay } from "./crabada";

const dbGetMinesWithPairRounds = async (): Promise<IApiMine[]> => {
    return (await collections.mines.find({ round: { $in: [0, 2, 4] } }).toArray()) as unknown as IApiMine[]
}

task(
    "attackdifference",
    "Read mines from database for attacked games and generate the distribution of the difference between attack points.",
    async ({ }, 
        hre: HardhatRuntimeEnvironment) => {

        await connectToDatabase()

        const mines = await dbGetMinesWithPairRounds()

        
        const distribution = Array.from(Array(10).keys()).map(x=>0)

        for (const mine of mines){
            const difference = mine.attack_point - mine.defense_point
            const bucket = Math.min(Math.floor(difference/10), 9)
            distribution[bucket]++
        }

        for (let i=0; i<distribution.length-1; i++){
            console.log(i, distribution[i]);
        }

    })
